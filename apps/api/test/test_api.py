from fastapi.testclient import TestClient

from app.main import app
from app.security import verify_client

app.dependency_overrides[verify_client] = lambda: None
client = TestClient(app)

def test_health_has_minimal_non_sensitive_payload():
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json()["service"] == "readaloud-api"
    assert "token" not in response.text.lower()

def test_plain_text_extraction_does_not_persist_upload():
    response = client.post(
        "/v1/documents/extract",
        files={"file": ("sample.txt", b"First line.\nSecond line.", "text/plain")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "First line.\nSecond line."
    assert body["retained"] is False
    assert body["characterCount"] == len(body["text"])

def test_unsupported_file_extension_is_rejected():
    response = client.post(
        "/v1/documents/extract",
        files={"file": ("payload.exe", b"not an executable", "application/octet-stream")},
    )
    assert response.status_code == 415

def test_empty_upload_is_rejected():
    response = client.post(
        "/v1/documents/extract",
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 422


def test_production_gate_fails_without_shared_rate_limit_storage(monkeypatch):
    from app.main import enforce_production_configuration

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", "a" * 40)
    monkeypatch.delenv("REDIS_URL", raising=False)
    import pytest
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        import asyncio
        asyncio.run(enforce_production_configuration())

def test_production_gate_rejects_short_service_token(monkeypatch):
    from app.main import enforce_production_configuration

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", "too-short")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    import pytest
    with pytest.raises(RuntimeError, match="32 characters"):
        import asyncio
        asyncio.run(enforce_production_configuration())


def test_production_gate_requires_explicit_host_and_origin_configuration(monkeypatch):
    import asyncio
    import pytest
    from app.main import enforce_production_configuration

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("READALOUD_API_TOKEN", "r" * 48)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.delenv("READALOUD_ALLOWED_HOSTS", raising=False)
    monkeypatch.setenv("READALOUD_CORS_ORIGINS", "https://reader.example")
    with pytest.raises(RuntimeError, match="READALOUD_ALLOWED_HOSTS"):
        asyncio.run(enforce_production_configuration())

    monkeypatch.setenv("READALOUD_ALLOWED_HOSTS", "reader.example")
    monkeypatch.delenv("READALOUD_CORS_ORIGINS", raising=False)
    with pytest.raises(RuntimeError, match="READALOUD_CORS_ORIGINS"):
        asyncio.run(enforce_production_configuration())
