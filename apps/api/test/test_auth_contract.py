from __future__ import annotations

from starlette.requests import Request
from fastapi import HTTPException
import pytest

from app.security import verify_client


def _request(host: str = "127.0.0.1") -> Request:
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/v1/voices",
        "raw_path": b"/v1/voices",
        "query_string": b"",
        "headers": [],
        "client": (host, 12345),
        "server": ("testserver", 80),
    })


def test_authentication_fails_closed_in_production_without_configured_token(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("READALOUD_API_TOKEN", raising=False)

    with pytest.raises(HTTPException) as error:
        verify_client(_request(), None)

    assert error.value.status_code == 503


def test_authentication_rejects_missing_token_when_configured(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", "a" * 48)

    with pytest.raises(HTTPException) as error:
        verify_client(_request(), None)

    assert error.value.status_code == 401


def test_authentication_rejects_incorrect_token(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", "a" * 48)

    with pytest.raises(HTTPException) as error:
        verify_client(_request(), "b" * 48)

    assert error.value.status_code == 401


def test_authentication_accepts_exact_configured_token(monkeypatch):
    token = "a" * 48
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", token)

    assert verify_client(_request(), token) is None


def test_development_without_token_is_loopback_only(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("READALOUD_API_TOKEN", raising=False)

    assert verify_client(_request("127.0.0.1"), None) is None
    assert verify_client(_request("::1"), None) is None

    with pytest.raises(HTTPException) as error:
        verify_client(_request("203.0.113.10"), None)

    assert error.value.status_code == 503


def test_health_route_has_no_store_and_security_headers():
    from fastapi.testclient import TestClient
    from app.main import app

    response = TestClient(app).get("/v1/health")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"


def test_invalid_speech_payload_is_rejected_before_provider_call(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.security import verify_client

    async def fail_if_called(*args, **kwargs):
        raise AssertionError("Provider must not be called for invalid payload.")

    monkeypatch.setattr("app.main.synthesize_neural_speech", fail_if_called)
    app.dependency_overrides[verify_client] = lambda: None
    try:
        response = TestClient(app).post("/v1/speech", json={"text": "   "})
    finally:
        app.dependency_overrides.pop(verify_client, None)

    assert response.status_code == 422


def test_speech_schema_rejects_text_over_limit():
    from app.main import SpeechRequest

    with pytest.raises(Exception):
        SpeechRequest(text="x" * 4501)
