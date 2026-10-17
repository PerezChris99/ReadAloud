# ReadAloud

**A calm, local-first reading companion for books, documents and long-form reading.**

ReadAloud is being built for people who would rather listen to a novel, textbook, report or PDF than stare at a screen. The experience combines a personal library, document indexing, a page-style preview, sentence-synchronised captions, accessible playback controls and natural neural voices when a speech provider is configured.

## Product goals

- **Mobile:** React Native and Expo for Android 8.0 (API 26) and later, plus iOS.
- **Desktop:** a lightweight Tauri 2 application for Windows, with React and TypeScript.
- **Shared reader core:** type/size validation, text normalisation, sentence segmentation, page previews and explicit playback-state transitions.
- **Local first:** extracted text and reading position stay on-device by default.
- **Optional enhancement service:** self-hosted API for PDF/OCR extraction and neural speech; provider keys never belong in client bundles.
- **Voice fallback:** installed device voices remain available without a service. Voice quality varies by OS and installed voice; natural neural voices require configured service credentials.
- **Mobile listening:** background audio and lock-screen metadata are enabled for neural playback; sustained background behavior and interruptions still need real-device acceptance tests.

## System flow

~~~mermaid
flowchart TD
  A[Import a book or document] --> B[Validate format and size]
  B --> C[Index and extract text]
  C --> D[Split into sentences and preview pages]
  D --> E[Save local library and reading position]
  E --> F[Reader player]
  F --> G[Current-page preview]
  F --> H[Sentence-synchronised caption]
  F --> I[System voice]
  F -. optional .-> J[Neural speech service]
~~~

~~~mermaid
flowchart LR
  M[React Native / Expo] --> C[Shared reader core]
  D[Tauri desktop / React] --> C
  M --> S[(Local SQLite)]
  D --> L[(Local IndexedDB)]
  M -. PDF / OCR / neural speech .-> A[Optional FastAPI]
  D -. PDF / OCR / neural speech .-> A
  A --> P[Document parsers and OCR]
  A --> T[Neural speech provider]
~~~

## Repository layout

- apps/mobile — React Native (Expo) app.
- apps/desktop — Tauri desktop app.
- apps/api — optional extraction and neural speech API.
- packages/reader-core — cross-platform domain logic.
- docs — architecture, security, legal and release notes.

## Development prerequisites

- Node.js 22.13+ and npm.
- Rust toolchain and platform build prerequisites for Tauri desktop.
- Android Studio/SDK for Android; Xcode on macOS for iOS builds.
- Python 3.11+ and Tesseract OCR only when running the optional API.
- Azure Speech resource credentials only for neural voice mode.

## Common commands

From the repository root:

    npm install
    npm run test:core
    npm run typecheck
    npm run dev:desktop
    npm run dev:mobile

The Python API is in `apps/api`. To run it locally, create a Python 3.12 virtual environment, install `apps/api/requirements.txt`, install Tesseract OCR, copy `apps/api/.env.example` to `apps/api/.env`, and run `uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8787`. See [apps/api/README.md](apps/api/README.md). Set the neural speech provider key only on the server. Public production still requires HTTPS, a unique high-entropy service token, Redis rate-limit storage and deployment-specific host/origin configuration.

**Release status:** this codebase is in active build-out, not a released or independently verified app. Real-device installation, mobile-store signing, neural voice credentials, deployment configuration and final legal review are release gates. Do not expose a speech service publicly without authentication, rate limiting and controlled provider spend.
