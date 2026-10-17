from __future__ import annotations

import html
import os
import re
import httpx
from fastapi import HTTPException

VOICE_PRESETS = {
    "en-US-JennyNeural": {"name": "Jenny", "locale": "en-US", "gender": "female"},
    "en-US-GuyNeural": {"name": "Guy", "locale": "en-US", "gender": "male"},
    "en-GB-SoniaNeural": {"name": "Sonia", "locale": "en-GB", "gender": "female"},
    "en-GB-RyanNeural": {"name": "Ryan", "locale": "en-GB", "gender": "male"},
    "en-IN-NeerjaNeural": {"name": "Neerja", "locale": "en-IN", "gender": "female"},
    "en-IN-PrabhatNeural": {"name": "Prabhat", "locale": "en-IN", "gender": "male"},
}

async def synthesize_neural_speech(text: str, voice: str, rate: float, volume: float) -> bytes:
    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not key or not region:
        raise HTTPException(status_code=503, detail="Neural voices are not configured on this server.")
    if voice not in VOICE_PRESETS:
        raise HTTPException(status_code=422, detail="Unsupported neural voice.")
    if not re.fullmatch(r"[a-z0-9-]{3,30}", region):
        raise HTTPException(status_code=503, detail="Speech service region is invalid.")

    bounded_rate = max(0.75, min(rate, 1.35))
    bounded_volume = max(0.2, min(volume, 1.0))
    rate_percent = round((bounded_rate - 1) * 100)
    volume_percent = round((bounded_volume - 1) * 100)
    safe_text = html.escape(text, quote=False)
    ssml = (
        f'<speak version="1.0" xml:lang="{VOICE_PRESETS[voice]["locale"]}" '
        'xmlns="http://www.w3.org/2001/10/synthesis">'
        f'<voice name="{voice}"><prosody rate="{rate_percent:+d}%" volume="{volume_percent:+d}%">'
        f'{safe_text}</prosody></voice></speak>'
    )
    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    timeout = httpx.Timeout(connect=5.0, read=25.0, write=5.0, pool=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream(
                "POST",
                endpoint,
                content=ssml.encode("utf-8"),
                headers={
                    "Ocp-Apim-Subscription-Key": key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                    "User-Agent": "ReadAloud/0.2",
                },
            ) as response:
                if response.status_code != 200:
                    raise HTTPException(status_code=502, detail="The neural speech provider rejected this request.")
                # Enforce the cap while receiving bytes, not after httpx has buffered an
                # arbitrarily large provider response into memory.
                chunks: list[bytes] = []
                total_bytes = 0
                async for chunk in response.aiter_bytes():
                    total_bytes += len(chunk)
                    if total_bytes > 8 * 1024 * 1024:
                        raise HTTPException(status_code=502, detail="The speech provider returned an oversized audio payload.")
                    chunks.append(chunk)
                if total_bytes == 0:
                    raise HTTPException(status_code=502, detail="The speech provider returned an empty audio payload.")
                return b"".join(chunks)
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Neural speech provider timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Neural speech provider could not be reached.") from exc
