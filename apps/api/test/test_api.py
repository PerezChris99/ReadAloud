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
