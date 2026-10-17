# ReadAloud architecture

## Product boundary

ReadAloud is a local-first reader. The clients own their book library, sentence index, reading position and player interface. The Python API is an optional processing service for PDF/OCR extraction and high-quality neural audio; it is not intended to become a document-storage service.

## Import and playback flow

~~~mermaid
flowchart TD
  A[Choose book or document] --> B[Validate name, format and size]
  B --> C{Local extraction available?}
  C -->|TXT, HTML, Markdown, RTF| D[Extract locally]
  C -->|DOCX or EPUB| E[Bound ZIP metadata, then extract locally]
  C -->|PDF text layer| F[Read PDF locally on desktop]
  C -->|Scanned PDF, OCR image or mobile PDF| G[Explicit configured Python API]
  D --> H[Normalize and segment text]
  E --> H
  F --> H
  G --> H
  H --> I[Local library and progress index]
  I --> J[Player with page preview and sentence caption]
  J --> K[Installed device voice]
  J -. optional .-> L[Python neural speech service]
  L --> M[Neural voice provider]
~~~

## Storage and privacy

The desktop library is stored in local IndexedDB and the mobile library in local SQLite. Reading positions are updated as sentences are played. There is currently no account system, cloud library sync, subscription service or cloud backup.

Most formats are extracted on-device. Mobile PDF/image extraction and neural speech require the URL explicitly entered in settings. Only the selected input for extraction or current sentence for neural speech is sent to that configured service. The optional API is designed not to retain document content or generated audio.

## Performance and safety boundaries

- 50 MiB maximum original document size.
- 8 million character maximum extracted text in the client and API.
- 800-page maximum PDF extraction.
- 100-page maximum server OCR fallback.
- Preflight bounds on DOCX/EPUB archive members and expanded size before decompression.
- 40-million-pixel maximum image.
- Neural speech accepts one sentence of at most 4,500 characters, fixed voice identifiers and bounded speed/volume.
- Local DB indexes support title lookup and recent-item ordering on mobile.

## Known limits

Preview pages are generated from extracted text and do not reproduce the exact typography or layout of the original PDF/ebook. Sentence captions are aligned by reading order, not phoneme timing or word-level highlighting. Neural audio generation per sentence can introduce network latency; production needs measured playback performance and provider quota controls.


## Library memory model

Library views query a metadata-only summary (title, format, sentence count, saved position and index timestamp). Full sentence arrays and preview-page content are loaded only when a reader opens a particular book. Desktop IndexedDB separates summaries from book data and migrates existing version-1 entries; mobile SQLite selects metadata-only columns for library listings. The original extracted text is not stored a second time because the indexed sentence list already contains the readable text.