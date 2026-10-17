# ReadAloud

**A local-first reading and listening companion for long-form documents.**

ReadAloud combines a personal library, document indexing, page-style previews, sentence-synchronised captions and playback controls. It is designed for readers who want to listen to books, reports and documents while keeping their library on their own device by default.

> **Release status: pre-release.** The source is under active development. No desktop installer, Android package or iOS build has been certified by this repository as a production release. Build, signing, real-device, store-policy and legal checks in [the release checklist](docs/RELEASE_CHECKLIST.md) are release gates—not claims that those checks have passed.

## Product targets and current boundaries

| Target | Implementation | Important boundary |
| --- | --- | --- |
| Windows desktop | React + TypeScript, Vite and Tauri 2 | Windows NSIS installer is configured; clean-machine installation, signing, upgrade and uninstall still require verification. |
| Android | React Native + Expo | Minimum Android API 26 (Android 8.0). An install-size budget of 25 MB is a target to measure on a signed release artifact, not a verified result. |
| iOS | React Native + Expo | Configured deployment target iOS 16.4; build and submission require macOS/Xcode and Apple signing credentials. |
| Optional processing API | Python 3.11+ / FastAPI | Provides document extraction/OCR and Azure neural speech. It is optional and must be deployed with TLS, a strong token, trusted-host/CORS configuration, shared rate-limit storage and provider spend controls. |

The app does not currently implement user accounts, cross-device sync, cloud library backup, or advertising analytics. Device-installed system voices can work without the API. Neural voices require a configured API and Azure Speech credentials on the server. Voice availability and pronunciation vary by platform and provider.

## How it works

```mermaid
flowchart TD
    A[Choose a document] --> B[Validate type and size]
    B --> C{Processing path}
    C -->|TXT, DOCX, EPUB, HTML and supported text formats| D[Local extraction]
    C -->|Mobile PDF / image OCR| E[Explicitly configured API]
    C -->|Desktop PDF local fallback| E
    D --> F[Normalize and segment text]
    E --> F
    F --> G[Create sentence index and page previews]
    G --> H[Save local library and reading position]
    H --> I[Reader and playback controls]
    I --> J[Sentence caption and page preview]
    I --> K[Installed system voice]
    I -. optional .-> L[Neural speech API]
    L --> M[Configured speech provider]
```

```mermaid
flowchart LR
    subgraph Clients
      A[React Native / Expo]
      B[Tauri / React]
    end
    C[Shared TypeScript reader core]
    D[(SQLite on mobile)]
    E[(IndexedDB on desktop)]
    F[Optional Python FastAPI]
    G[Document parsers / OCR]
    H[Azure neural speech]
    A --> C
    B --> C
    A --> D
    B --> E
    A -. configured requests .-> F
    B -. configured requests .-> F
    F --> G
    F --> H
```

**Privacy boundary:** imported text and reading position are stored locally by default. The mobile app sends PDF/image files to the configured service when those formats need server extraction; neural voice sends the current sentence to the configured service. Only configure a service you trust. See [Security and privacy](docs/SECURITY.md).

## Repository map

- `apps/mobile` — Expo mobile client, SQLite library, document import and playback.
- `apps/desktop` — Tauri desktop client, IndexedDB library and local document processing.
- `apps/api` — optional FastAPI extraction/OCR and neural-speech service.
- `packages/reader-core` — shared types, format validation, text normalization, sentence segmentation, previews and playback-domain logic.
- `docs/ARCHITECTURE.md` — component boundaries and data flow.
- `docs/SECURITY.md` — trust boundaries and deployment security baseline.
- `docs/RELEASE_CHECKLIST.md` — measurable release gates for desktop, Android, iOS, API and stores.
- `docs/GIT_WORKFLOW.md` — required `perez` → PR → `main` branch discipline and manual validation rules.
- `docs/releases/0.2.0-prerelease.md` — factual pre-release notes and promotion gates; not a claim of published binaries.
- `docs/STORE_LISTING.md` — conservative store-listing draft and data-disclosure preparation.

## Development prerequisites

- Node.js 22.13+ and npm 10.9+.
- Rust and Tauri's Windows build prerequisites for the desktop installer.
- Android Studio/SDK for Android builds.
- macOS, Xcode and Apple signing credentials for iOS release builds.
- Python 3.11+ and Tesseract OCR for the optional API.
- Azure Speech resource credentials only if enabling neural speech.

## Common commands

Run from the repository root:

```sh
npm install
npm run test:core
npm run typecheck
npm run dev:desktop
npm run dev:mobile
npm run build:desktop
npm run build:android
npm run build:ios
```

The API's tests use pytest. From the repository root, create a Python virtual environment, install `apps/api/requirements.txt` and `apps/api/requirements-dev.txt`, then run:

```sh
python -m pytest apps/api/test
```

For a local API, copy `apps/api/.env.example` to `apps/api/.env`, configure local-only values, install Tesseract, then run:

```sh
uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8787
```

Do not expose that development command to the public internet. Production requires HTTPS, a high-entropy `READALOUD_API_TOKEN`, exact `READALOUD_ALLOWED_HOSTS` and `READALOUD_CORS_ORIGINS`, protected shared Redis rate-limit storage, secret-manager-backed Azure credentials, ingress/request timeouts, monitoring and provider spend limits. A single shared bearer token is not a multi-user identity or account system.

## Supported import formats

Format support varies by platform and extraction path. Current code includes TXT, DOCX, EPUB, HTML/Markdown/RTF-style text and PDF/image extraction paths. Mobile PDF and image OCR require the optional API; desktop PDF attempts local extraction and can use the API fallback. Validate the actual sample corpus and error states per platform before advertising support in a store listing.

## Security, performance and release discipline

- Imported files are untrusted input. The shared core and API enforce file/format/archive/text limits; API document extraction is run outside the event loop, and neural audio is capped while streamed from the provider.
- The library list uses summary records and loads the selected book's full index on demand.
- Keep provider secrets on the server or in platform secure storage; never bake production service credentials into public client bundles.
- No CI workflows are included by project policy while workflow quota is exhausted. Run documented checks manually in a clean, supported environment and preserve the logs.
- Follow [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md): implement on `perez`, open a PR to `main`, merge after review/evidence, then fast-forward `perez` to the merged `main` SHA. Do not push directly to `main`.
- Workspace manifests currently need a committed npm lockfile before `npm ci` can provide reproducible installs; do not treat `npm install` success on one machine as reproducibility evidence.
- The mobile 25 MB install-size target must be measured on the final signed artifacts for each platform. If it is exceeded, inspect bundle contents and native dependencies before release; do not claim compliance based on JavaScript source size.
- Read the release checklist. Any unchecked build, device, security, size, legal, signing or store item blocks a production launch.

## Proprietary license and third-party notices

ReadAloud is **proprietary software**. Copyright in original project materials is claimed by **PerezChris99**, subject to third-party rights and any signed legal assignment. All rights are reserved. Prior explicit written permission is required to use, modify, redistribute, commercially exploit, or contribute to the project. Public visibility is not a license. See [`LICENSE`](LICENSE), [`CONTRIBUTING.md`](CONTRIBUTING.md), and [`docs/PROPRIETARY_RIGHTS.md`](docs/PROPRIETARY_RIGHTS.md). Third-party components remain under their own licenses.

The registered legal name and jurisdiction of the owner's company have not been provided in this repository. The owner must record the exact company identity from its legal documents before making a company-specific copyright/assignment claim. For written license or contribution requests, contact `kweeziperez712@gmail.com`.
