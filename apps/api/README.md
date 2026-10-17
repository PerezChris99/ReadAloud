# ReadAloud API service

Optional, stateless service for mobile PDF extraction, scanned-document OCR and neural voice audio. It is not required to import text, DOCX or EPUB on device. The service does not intentionally persist document contents or generated audio; requests are read into bounded memory / temporary files and discarded after processing.

## Run locally

    python -m venv .venv
    # Windows: .venv\\Scripts\\activate
    # macOS/Linux: source .venv/bin/activate
    pip install -r apps/api/requirements.txt
    pip install -r apps/api/requirements-dev.txt  # only when running tests
    cp apps/api/.env.example apps/api/.env
    uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8787

Run `pytest -q apps/api/test` from the repository root with the API virtual environment activated to execute the Python tests. `requirements-dev.txt` contains test-only dependencies. Set APP_ENV=development for local setup. Set READALOUD_API_TOKEN to test authenticated client calls. Production startup fails closed without a token. Configure Azure Speech key and region only for neural audio. Install Tesseract OCR for scanned PDFs and images.

## Endpoints

- GET /v1/health — minimal health status; no credentials or environment values are returned.
- GET /v1/voices — supported neural voice names and whether provider credentials are configured.
- POST /v1/documents/extract — multipart upload; allowed document extension, max upload size, page count and OCR limits are enforced.
- POST /v1/speech — text-to-neural-speech; request schema constrains text, rate, volume and voice.

Protected routes require the X-ReadAloud-Token header when READALOUD_API_TOKEN is set. The API never returns provider keys. Extracted document text and generated audio use Cache-Control: no-store.

## Production gates

Use HTTPS, set exact allowed hosts and CORS origins, provide a high-entropy service token, set Azure quotas/spend alerts, restrict network ingress, and configure REDIS_URL for shared rate limits across more than one worker. The built-in in-memory limiter is only suitable for a single process. A single shared token is a self-hosting primitive, not full public multi-user identity or subscription authorization; do not expose it as a public service until per-user authentication and usage accounting are integrated.
