# ReadAloud engineering audit — 2026-10-22

## Scope and confidence

This is a source-level audit of the GitHub repository and targeted code changes made through the repository connection. It is **not** a production certification: this environment could not resolve `github.com` from a local shell, so a clean checkout, dependency install, test run, browser build, native build, and device test could not be executed. Findings below distinguish merged source improvements from required verification.

## Completed source improvements

### Playback and responsiveness
- Moved sentence-position persistence off the desktop/mobile speech hot path. A local database write is no longer awaited before beginning each sentence.
- Changed desktop progress persistence to update only the compact library summary. Previously every sentence change loaded and rewrote the entire IndexedDB book record, including all sentence and page-preview arrays.
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

## Follow-up whole-repository audit — 2026-10-23

### Additional source issue found and corrected

- **Asynchronous book-selection race (desktop and mobile):** opening a book is asynchronous because the complete sentence index is read from local storage. If a user selected book A and then book B before A's read completed, A's slower result could overwrite B's active reader state. The startup hydration path on desktop had the same race with a user selection. Added monotonically increasing selection tokens so stale reads and stale errors are ignored; desktop deletion and mobile import/deletion invalidate older selection requests. This is a source-level correction; it still requires runtime regression testing on both platforms.

### Static package/configuration review

- The root npm workspace declares all three JavaScript workspaces and uses exact versions for its direct dependencies. TypeScript strictness is enabled in the shared config.
- The desktop Tauri config points at the Vite output, configures NSIS as the Windows bundle target, and grants only the default Tauri core capability in its declared capability file.
- The mobile Expo config declares Android API 26, an iOS deployment target, package/bundle identifiers, the app icon and audio/document/storage plugins.
- The Python API has pinned direct requirements, a separate pinned development requirements file, a non-root container user, request-size limits, and production startup checks for token, Redis and explicit host/origin configuration.
- Static inspection is not a substitute for validating Expo config-plugin option support, Tauri schema validation, Python dependency resolution, Rust dependency resolution or native platform toolchains.

### Remaining issues that prevent a “perfect / no build errors” claim

1. **No root `package-lock.json`:** the npm workspace is not reproducible yet. I did not fabricate a lockfile. It must be generated with the repository's supported Node/npm versions in a network-enabled clean checkout and committed before a clean `npm ci` can be the installation gate.
2. **No executed tests/builds:** GitHub source access is available, but this session does not have a working network-enabled local checkout or native build toolchains. JavaScript tests, TypeScript checks, Python tests, Vite/Tauri packaging, Android and iOS builds remain unexecuted; no pass is inferred.
3. **No dependency audit evidence:** npm, Python and Cargo transitive dependency resolution/advisory checks remain pending until package installation can run. The versions in manifests have not been proven mutually compatible by a successful clean install.
4. **No native runtime evidence:** no physical-device test can establish audio lifecycle, permissions, background playback, document-picker behavior, storage migrations, install/upgrade/uninstall, or the 25 MB installed-size target from source review alone.
5. **No release artifacts:** signing, checksums, store validation and release publication remain gated on successful builds and real artifacts.

### Follow-up validation commands

Run from a clean checkout using Node 22.13+ and npm 10.9+; install the API development requirements in the active Python environment first:

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

The desktop build requires its supported native host toolchain; Android requires its SDK/toolchain; iOS requires macOS/Xcode and signing setup. Record each actual exit code and logs. No GitHub Actions workflows were added.

### Follow-up conclusion

The second pass found and corrected a real cross-platform stale-selection race and reviewed the workspace, TypeScript, Expo, Tauri and API package/runtime configuration. **The code is not yet certifiable as build-clean** because the lockfile, clean dependency installation, executed checks and native builds are still outstanding. A claim of zero errors would be unsupported until those checks pass.

## Flow-hardening follow-up — 2026-10-23

A second pass over the initialization sequence found a narrower timing window in the desktop startup race guard: the initial selection token was captured only after awaiting the library-summary query. A manual selection made while that query was pending could therefore still be overwritten by startup hydration. The token is now captured synchronously at effect entry, before any asynchronous work, and compared after full-book hydration. This complements the selection tokens merged in PR #40.

### End-to-end flow coverage still required

Use representative small, large, malformed, encrypted and unsupported documents on both platforms. Verify each transition rather than only the happy path:

1. Launch with an empty library; launch with one book; launch with many books.
2. Select A then B rapidly while local storage is delayed; B must remain selected.
3. Import while a book is opening; the new import must not be replaced by a stale result.
4. Cancel an import, fail an import, retry an import, and import the same file twice.
5. Play, pause, resume, seek, change voice/provider, change books during audio fetch, stop during audio fetch, and recover from offline/provider errors.
6. Confirm progress persists across app restart without writing full sentence arrays per sentence.
7. Delete a book while it is selected or loading; cancel deletion and confirm the book remains.
8. Test permissions, app background/foreground, headphones/audio interruptions, database upgrade from existing installs, and a full offline system-voice reading session.
9. Exercise PDF OCR/API timeout, invalid token, oversized body, empty extraction, malformed ZIP/EPUB/DOCX and service unavailable responses.
10. Validate desktop installer install/upgrade/uninstall and Android/iOS install/upgrade on supported OS versions.

These are acceptance scenarios, not tests claimed to have run. The repository currently lacks a runnable local environment in this session, so no test/build pass has been inferred.
