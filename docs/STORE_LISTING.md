# Mobile store listing draft

This is a publisher-ready starting point, not a claim that the app is approved for submission. Confirm each capability in a signed release build and replace all publisher-owned fields before submitting. Do not publish while the release checklist contains blockers.

## Store identity

- **App name:** ReadAloud
- **Android package / iOS bundle ID:** `app.readaloud.reader`
- **Current source version:** `0.2.0`
- **Suggested categories:** Books & Reference or Productivity (choose the best fit in each store's current taxonomy).
- **Support contact:** **Publisher must supply a monitored address.**
- **Public privacy-policy URL:** **Publisher must publish and supply a stable URL.**
- **Store icon, screenshots and preview video:** **Must be created from the final branded release build.**
- **Age/content rating:** Complete each store's current questionnaire; do not guess a rating.

## Google Play draft

### Short description

Listen to books and documents with sentence-synchronised captions.

### Full description

ReadAloud helps you listen to long-form reading while keeping your place. Import supported books and documents, follow sentence-synchronised captions, view a page-style text preview, and control playback from a calm personal library.

**Read and listen**
- Import supported text documents and books, including TXT, DOCX, EPUB, HTML, Markdown and RTF-style text.
- View sentence captions and page-style previews while listening.
- Pause, resume, skip and continue from a saved reading position.
- Use voices installed on your device, with voice availability depending on your operating system.

**Optional enhanced processing**
- PDF extraction and scanned-page OCR on mobile require a ReadAloud processing service that you explicitly configure.
- Optional neural voices require a configured ReadAloud service and a speech provider. Voice availability, latency and quality depend on the configured provider.
- A configured service receives the document or sentence needed for the selected operation. Only connect a service you trust.

**Designed around your library**
- Imported text and reading progress are stored locally by default.
- The app does not currently require an account and does not implement advertising analytics or cross-device sync.
- Delete a book from the local library to remove its stored reading index.

ReadAloud is in pre-release development. Supported formats and enhanced features vary by platform and configuration. Consult the in-app Privacy notice and the publisher's published privacy policy before using a remote processing service.

### Data Safety preparation (verify against final build)

- **Account data:** no account registration or login is implemented in the current source.
- **Local files and reading text:** imported content is processed and stored locally by default.
- **Remote document processing:** on mobile, PDF/image files are uploaded only when the user has configured a service endpoint and imports a format that requires remote extraction/OCR.
- **Neural speech:** the current sentence is sent to the configured API and then to the configured speech provider.
- **Analytics/advertising:** no advertising or analytics SDK is implemented in the current source.
- **Deletion:** deleting a book removes its local indexed content; the app does not provide cloud sync or cloud library backup.
- **Third-party processing and retention:** depends on the service operator and configured speech provider; disclose the actual provider terms and retention practices.

The publisher must verify these points in the release artifact and answer every current Play Data safety question accurately. A self-hosted or third-party API may change what must be disclosed.

## Apple App Store draft

- **Name:** ReadAloud
- **Subtitle (draft):** Listen along with your books
- **Promotional text (draft):** Keep your place with sentence captions and a calm reading player.
- **Description:** The Google Play full description above may be adapted to Apple's current limits and formatting.
- **Keywords (draft):** read aloud, document reader, PDF reader, text to speech, EPUB, accessibility
- **Support URL:** **Publisher must supply a monitored support page.**
- **Privacy Policy URL:** **Publisher must supply a stable public privacy-policy page.**

Before submission, verify App Privacy disclosures, privacy-manifest requirements, bundle ID, app icon, launch assets, permissions, background audio behavior, supported OS target and any current Apple review requirements.

## Must be supplied or verified by the publisher

1. Legal/support contact and stable public support and privacy-policy URLs.
2. Final app icon, launch/splash artwork, screenshots and store graphics for the required device sizes.
3. Signed release artifacts and measured install size for Android and iOS.
4. Final supported-format matrix based on end-to-end testing on the actual release builds.
5. Actual API deployment and provider data-retention terms, quotas and user disclosures.
6. Completed store questionnaires, content rating, age targeting, regions, pricing and release tracks.
7. Owner-approved license and third-party notices as appropriate for distribution.

Do not claim the mobile apps are under 25 MB installed until the final artifacts have been measured on representative devices and the results recorded in the release evidence.
