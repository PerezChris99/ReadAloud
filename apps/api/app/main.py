from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .extractors import ALLOWED_EXTENSIONS, extract_document
from .security import RequestBodyLimitMiddleware, api_environment, verify_client
from .speech import VOICE_PRESETS, synthesize_neural_speech

APP_VERSION = "0.2.0"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "800"))
MAX_OCR_PAGES = int(os.getenv("MAX_OCR_PAGES", "100"))

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("REDIS_URL") or "memory://",
    headers_enabled=True,
    default_limits=["120/minute"],
)

app = FastAPI(
    title="ReadAloud Service",
    version=APP_VERSION,
    description="Optional, stateless document extraction, OCR and neural speech gateway.",
    docs_url="/docs" if api_environment() != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if api_environment() != "production" else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

allowed_hosts = [value.strip() for value in os.getenv("READALOUD_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver").split(",") if value.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

allowed_origins = [value.strip() for value in os.getenv(
    "READALOUD_CORS_ORIGINS",
    "http://localhost:1420,tauri://localhost,https://tauri.localhost",
).split(",") if value.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-ReadAloud-Token"],
    max_age=600,
)

@app.middleware("http")
async def reject_oversized_declared_body(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
                return Response("Request body is too large.", status_code=413)
        except ValueError:
            return Response("Invalid Content-Length.", status_code=400)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response

# Starlette parses multipart uploads before entering the endpoint. Bound the
# actual ASGI body stream as well as the uploaded file, including chunked requests.
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=MAX_UPLOAD_BYTES + 1024 * 1024,
    paths={"/v1/documents/extract"},
)

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4500)
    voice: str = Field(default="en-US-JennyNeural", max_length=64)
    rate: float = Field(default=1.0, ge=0.75, le=1.35)
    volume: float = Field(default=0.8, ge=0.2, le=1.0)

@app.get("/v1/health")
@limiter.limit("60/minute")
async def health(request: Request):
    return {"status": "ok", "service": "readaloud-api", "version": APP_VERSION}

@app.get("/v1/voices", dependencies=[Depends(verify_client)])
@limiter.limit("60/minute")
async def voices(request: Request):
    return {
        "provider": "azure-neural",
        "configured": bool(os.getenv("AZURE_SPEECH_KEY") and os.getenv("AZURE_SPEECH_REGION")),
        "voices": [{"id": key, **value} for key, value in VOICE_PRESETS.items()],
    }

@app.post("/v1/documents/extract", dependencies=[Depends(verify_client)])
@limiter.limit("10/minute")
async def extract(request: Request, file: UploadFile = File(...)):
    filename = (file.filename or "").replace("\\", "/").split("/")[-1]
    extension = Path(filename).suffix.lower()
    if not filename or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported document format.")
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
                raise HTTPException(status_code=413, detail="Document exceeds the upload limit.")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length.") from exc
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds the 50 MB processing limit.")
    if not data:
        raise HTTPException(status_code=422, detail="The selected document is empty.")
    try:
        result = await run_in_threadpool(extract_document, data, filename, MAX_PDF_PAGES, MAX_OCR_PAGES)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Document indexing failed. Try a different file.") from exc
    if not result.text:
        raise HTTPException(status_code=422, detail="No readable text was found. Try a clearer scan or a text-based document.")
    return {"text": result.text, "pageCount": result.page_count, "format": result.format, "characterCount": len(result.text), "retained": False}

@app.post("/v1/speech", dependencies=[Depends(verify_client)])
@limiter.limit("30/minute")
async def speech(request: Request, payload: SpeechRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be blank.")
    audio = await synthesize_neural_speech(payload.text, payload.voice, payload.rate, payload.volume)
    return Response(content=audio, media_type="audio/mpeg", headers={
        "Content-Disposition": 'inline; filename="readaloud-sentence.mp3"',
        "Content-Length": str(len(audio)),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })

@app.on_event("startup")
async def enforce_production_configuration():
    if api_environment() != "production":
        return
    token = os.getenv("READALOUD_API_TOKEN", "").strip()
    if len(token) < 32:
        raise RuntimeError("Production READALOUD_API_TOKEN must contain at least 32 characters.")
    if not os.getenv("REDIS_URL", "").strip():
        raise RuntimeError("REDIS_URL must be configured for shared production rate limits.")
    host_setting = os.getenv("READALOUD_ALLOWED_HOSTS", "").strip()
    origin_setting = os.getenv("READALOUD_CORS_ORIGINS", "").strip()
    production_hosts = [value.strip() for value in host_setting.split(",") if value.strip()]
    production_origins = [value.strip() for value in origin_setting.split(",") if value.strip()]
    if not production_hosts or "*" in production_hosts or "testserver" in production_hosts:
        raise RuntimeError("Set explicit production READALOUD_ALLOWED_HOSTS without wildcard hosts.")
    if not production_origins or "*" in production_origins:
        raise RuntimeError("Set explicit production READALOUD_CORS_ORIGINS without wildcard origins.")
