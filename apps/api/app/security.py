from __future__ import annotations

import hmac
import os
from fastapi import Header, HTTPException, Request, status

def api_environment() -> str:
    return os.getenv("APP_ENV", "development").strip().lower()

def verify_client(request: Request, x_readaloud_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("READALOUD_API_TOKEN", "").strip()
    if not expected:
        if api_environment() == "production":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="API authentication is not configured.")
        client = request.client.host if request.client else ""
        if client not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Configure READALOUD_API_TOKEN before remote use.")
        return
    if not x_readaloud_token or not hmac.compare_digest(x_readaloud_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API token.")
