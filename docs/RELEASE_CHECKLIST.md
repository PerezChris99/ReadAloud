# ReadAloud release checklist

## Product and runtime
- [ ] Clean Windows desktop install and uninstall; verify startup and local library persistence.
- [ ] Android API 26 emulator and physical-device build; verify document picker, speech controls, secure settings and SQLite.
- [ ] iOS simulator and physical-device build; account for iOS silent-mode behaviour and App Store signing requirements.
- [ ] Import and play text, DOCX, EPUB and text-based PDF on each supported platform.
- [ ] Validate scanned PDF and image OCR through an authenticated, deployed service.
- [ ] Verify sentence captions, page preview, pause/resume, skip, speed/volume and saved progress on long books.
- [ ] Confirm user-facing failures for invalid, encrypted, malformed, oversized, empty and unparseable files.
- [ ] Verify no document is sent to a remote service unless configured and required by the selected feature.
- [ ] Lock the device and background the app during a long book; verify sustained audio, interruptions, pause/resume, and cleanup when stopping or switching books.

## Security and operations
- [ ] Configure HTTPS, trusted hosts, exact CORS origins, high-entropy service token and Azure provider secret.
- [ ] Use shared rate-limit storage when running multiple API instances; set upstream and provider quotas.
- [ ] Test upload size/page/image-pixel limits and service timeouts under load.
- [ ] Test logs and telemetry for accidental document content, tokens and provider secrets.
- [ ] Review dependency audit output and current OS/app-store requirements before publishing.
- [ ] Complete app signing, privacy disclosures, legal contact and jurisdiction-specific legal review.

## Release artifacts
- [ ] Generate and commit the supported package lockfiles after installation in a network-enabled build environment.
- [ ] Build and sign Windows installer, Android APK/AAB and iOS IPA using the actual target toolchains.
- [ ] Test installers and upgrades on clean supported devices.
- [ ] Confirm store listing, screenshots, accessible UI, Terms and Privacy text match actual data flows.
- [ ] Record actual test logs, build IDs, supported device matrix and rollback/recovery procedure.

A checklist item is not complete until the resulting command, device test, service configuration or review has actually passed. Source scaffolding by itself is not a release certification.
