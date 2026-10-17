from __future__ import annotations

import asyncio

from app.security import RequestBodyLimitMiddleware


def test_request_body_limit_rejects_chunked_upload_without_content_length():
    async def run_test():
        events = [
            {"type": "http.request", "body": b"123456", "more_body": True},
            {"type": "http.request", "body": b"789012", "more_body": False},
        ]
        sent = []

        async def receive():
            return events.pop(0)

        async def send(message):
            sent.append(message)

        async def downstream(scope, receive, send):
            while True:
                message = await receive()
                if message["type"] == "http.disconnect" or not message.get("more_body", False):
                    break
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok", "more_body": False})

        middleware = RequestBodyLimitMiddleware(downstream, max_bytes=10, paths={"/v1/documents/extract"})
        await middleware(
            {"type": "http", "method": "POST", "path": "/v1/documents/extract", "headers": []},
            receive,
            send,
        )
        return sent

    sent = asyncio.run(run_test())
    assert sent[0]["status"] == 413
    assert sent[1]["body"] == b"Request body is too large."


def test_request_body_limit_does_not_interfere_with_other_routes():
    async def run_test():
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"x" * 100, "more_body": False}

        async def send(message):
            sent.append(message)

        async def downstream(scope, receive, send):
            await receive()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok", "more_body": False})

        middleware = RequestBodyLimitMiddleware(downstream, max_bytes=1, paths={"/v1/documents/extract"})
        await middleware(
            {"type": "http", "method": "POST", "path": "/v1/health", "headers": []},
            receive,
            send,
        )
        return sent

    sent = asyncio.run(run_test())
    assert sent[0]["status"] == 200
