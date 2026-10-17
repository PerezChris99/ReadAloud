from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.speech import synthesize_neural_speech


def test_neural_speech_fails_closed_when_provider_is_not_configured(monkeypatch):
    monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
    monkeypatch.delenv("AZURE_SPEECH_REGION", raising=False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(synthesize_neural_speech("Hello.", "en-US-JennyNeural", 1.0, 0.8))
    assert error.value.status_code == 503


def test_neural_speech_rejects_unknown_voice_before_network_access(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "test-key")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "eastus")
    with pytest.raises(HTTPException) as error:
        asyncio.run(synthesize_neural_speech("Hello.", "not-a-supported-voice", 1.0, 0.8))
    assert error.value.status_code == 422


def test_neural_speech_rejects_invalid_region_before_network_access(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_KEY", "test-key")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "https://attacker.example")
    with pytest.raises(HTTPException) as error:
        asyncio.run(synthesize_neural_speech("Hello.", "en-US-JennyNeural", 1.0, 0.8))
    assert error.value.status_code == 503
