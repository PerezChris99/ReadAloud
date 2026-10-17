from __future__ import annotations

import hmac
import os
from collections.abc import Awaitable, Callable
from typing import Any

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


class RequestBodyLimitMiddleware:
    """Bound streamed upload bodies, including chunked requests without Content-Length."""

    def __init__(self, app: Callable[..., Awaitable[None]], max_bytes: int, paths: set[str]) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.paths = paths

    async def __call__(self, scope: dict[str, Any], receive: Callable[..., Awaitable[dict[str, Any]]], send: Callable[..., Awaitable[None]]) -> None:
        if scope.get("type") != "http" or scope.get("method") != "POST" or scope.get("path") not in self.paths:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        declared = headers.get(b"content-length")
        if declared:
            try:
                if int(declared) > self.max_bytes:
                    await self._reject(send)
                    return
            except ValueError:
                await self._reject(send, status_code=400, message=b"Invalid Content-Length.")
                return

        received = 0
        too_large = False
        response_started = False
        response_body_sent = False

        async def limited_receive() -> dict[str, Any]:
            nonlocal received, too_large
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    too_large = True
                    return {"type": "http.disconnect"}
            return message

        async def limited_send(message: dict[str, Any]) -> None:
            nonlocal response_started, response_body_sent
            if not too_large:
                await send(message)
                return
            if message.get("type") == "http.response.start" and not response_started:
                response_started = True
                await send({
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8"), (b"cache-control", b"no-store")],
                })
            elif message.get("type") == "http.response.body" and response_started and not response_body_sent:
                response_body_sent = True
                await send({"type": "http.response.body", "body": b"Request body is too large.", "more_body": False})

        try:
            await self.app(scope, limited_receive, limited_send)
        except Exception:
            if not too_large:
                raise
            if not response_started:
                await self._reject(send)

    @staticmethod
    async def _reject(send: Callable[..., Awaitable[None]], status_code: int = 413, message: bytes = b"Request body is too large.") -> None:
        await send({
            "type": "http.response.start",
            "status": status_code,
            "headers": [(b"content-type", b"text/plain; charset=utf-8"), (b"cache-control", b"no-store")],
        })
        await send({"type": "http.response.body", "body": message, "more_body": False})
