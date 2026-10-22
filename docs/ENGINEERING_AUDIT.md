# ReadAloud engineering audit — 2026-10-22

## Scope and confidence

This is a source-level audit of the GitHub repository and targeted code changes made through the repository connection. It is **not** a production certification: this environment could not resolve `github.com` from a local shell, so a clean checkout, dependency install, test run, browser build, native build, and device test could not be executed. Findings below distinguish merged source improvements from required verification.

## Completed source improvements

### Playback and responsiveness
- Moved sentence-position persistence off the desktop/mobile speech hot path. A local database write is no longer awaited before beginning each sentence.
- Removed the mobile system-voice promise chain that could retain unresolved promises across an entire long book.
- Added desktop playback-run tokens to prevent stale neural requests and stale audio callbacks from restarting playback or overwriting the current run after stop/track changes.
- Added mobile neural-audio prefetch for the next sentence while the current segment plays. This can reduce request-boundary gaps, but cannot eliminate slow network/provider latency.
- Changed mobile cold start to load library summaries without immediately hydrating the first book's full sentence index. Desktop now publishes its summary list before hydrating the first book.
- Reworked shared sentence-to-page lookup to cache cumulative offsets with `WeakMap` and binary-search page offsets, avoiding repeated `slice().join()` allocations and full page scans on every active-caption update.
- Added regression tests for sentence/page boundaries and clamped indexes. These tests still need to be executed.

### Design and installation metadata
- Applied the Indie-Tech Minimalist palette: whitesmoke `#F5F5F7`, navy `#0B1B3D`, sky blue `#38BDF8`, restrained yellow `#FDE047`, white surfaces and subtle `#E5E7EB` borders.
- Standardized desktop text to medium weight and mobile text styles to weight 500; softened cards and inputs and improved narrow-window layout.
- Added a lightweight static SVG wireframe watermark to the desktop hero/empty state.
- Connected the existing mobile icon asset to Expo's app icon and Android adaptive-icon configuration.

## Remaining launch blockers

These require a network-enabled checkout and real platform toolchains. Do not describe the application as 100% tested or production-ready until they pass.

1. **Reproducible dependency graph:** the root npm workspace lockfile is absent. Generate it using the pinned Node/npm versions, commit it through a PR, then prove `npm ci` succeeds from a clean checkout. Do not fabricate a lockfile.
2. **Automated validation:** run `npm run test:core`, `npm run test:desktop-api`, `npm run typecheck`, and API pytest using the documented API dev requirements. Run all production build commands and preserve logs. There are no CI workflows by policy.
3. **Native builds and signing:** build the Windows installer, Android AAB/APK and iOS IPA in their supported environments. Confirm signing identities, package IDs, launch assets, upgrades and clean install/uninstall.
4. **Runtime performance:** test short and very long documents on low-memory Android hardware, iOS devices and supported desktop hardware. Measure indexing time, memory peak, caption-to-page alignment, cold start, skip/seek latency, pause/resume, background audio, lock-screen controls, and position recovery after force-close.
5. **Neural playback:** test prefetch success/failure, cancellation while a request is pending, slow network, provider rate limits/timeouts, voice changes, and audio cleanup. Network-based neural speech cannot guarantee gapless playback in every network condition; local system voices are the fallback.
6. **Document safety and compatibility:** test malformed/encrypted/oversized PDFs, scanned PDFs, DOCX/EPUB ZIP bombs, unsupported file types, Unicode and multilingual text, very long sentences, empty documents and storage exhaustion.
7. **Dependency and security assurance:** run npm/Python/Rust dependency audits, secret scanning over current files and full history, and a Git object audit in a full clone. Review API ingress/TLS, Redis, secrets, provider spend controls, data handling and production configuration.
8. **Mobile size budget:** measure actual signed installed apps on devices against the 25 MB target. Source and JavaScript bundle size are not a substitute for installed-size measurement.
9. **Release/legal/store:** complete real privacy disclosures, support contact, third-party license notices, legal review, store listings, device evidence and artifact hashes. Create a GitHub release only when verified artifacts are available.

## Commands for the clean-checkout validation pass

Run from the repository root after adding the committed lockfile and installing required platform prerequisites:

```sh
npm ci
npm run test:core
npm run test:desktop-api
npm run typecheck
python -m pytest apps/api/test
npm run build:desktop
npm run build:android
npm run build:ios
```

Some commands are platform-specific; iOS requires macOS/Xcode and signing credentials, desktop Tauri requires its host build prerequisites, and Android requires its SDK/toolchain. Record each command's actual result instead of treating skipped commands as passes.

## Current conclusion

The code has received targeted fixes for source-confirmed playback and rendering bottlenecks and the visual system has been aligned. **Build, test, signing, device, performance, install-size and release assurance remain unverified.** This document is an execution checklist, not a claim that those gates have passed.
