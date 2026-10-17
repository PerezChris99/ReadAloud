# Security and privacy baseline

## Trust boundaries
- Imported files are untrusted input. The clients impose a 50 MiB maximum file size and an 8-million-character extracted-text ceiling.
- The optional API validates extension, body size, PDF page count, raster pixel count, text length for speech, and allowed neural voices.
- Provider credentials remain server-side. Never put Azure Speech secrets or production API tokens into the React Native or desktop bundles.
- The API returns generic parser errors, does not intentionally retain upload contents or output audio, and uses no-store / nosniff response headers.

## Required production controls
1. Terminate TLS at a managed ingress or reverse proxy; do not expose the development server.
2. Set APP_ENV=production, a high-entropy READALOUD_API_TOKEN, exact READALOUD_ALLOWED_HOSTS and exact READALOUD_CORS_ORIGINS.
3. Store Azure keys in the deployment secret manager and set provider quotas, alerts and spend limits.
4. Set REDIS_URL to a protected shared Redis instance for cross-worker rate-limit consistency. Without Redis, limits are per-process memory only.
5. Restrict ingress, apply connection / request timeouts, use non-root containers, patch dependencies, and monitor 4xx/5xx, latency, rate-limits and provider failures.
6. Add per-user authentication, token rotation and usage attribution before offering an internet-facing multi-user speech service. A single shared bearer token is not a public-user identity system.

## Local-first behaviour
- Text, DOCX and EPUB are parsed locally by clients. The desktop parses text PDFs locally and only falls back to the configured API when local extraction fails.
- Mobile currently uses the configured API for PDF and image OCR. It will not upload those files if no service URL is configured.
- Neural speech sends the current sentence to the user-configured API. Do not use an untrusted server.
- No account, analytics SDK, ads or cross-device sync are implemented at this stage.

## Known remaining assurance work
The repository cannot prove device OS sandbox behaviour, store signing, third-party provider data retention, production reverse-proxy settings or shared-rate-limit configuration. Those must be verified in the actual release environment.
