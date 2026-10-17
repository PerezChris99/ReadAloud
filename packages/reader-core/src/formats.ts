import type { SupportedFormat } from "./types.js";
import { MAX_DOCUMENT_BYTES } from "./text.js";

const FORMAT_BY_EXTENSION: Record<string, SupportedFormat> = {
  ".pdf": "pdf", ".docx": "docx", ".txt": "txt", ".epub": "epub",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
  ".html": "html", ".htm": "html", ".md": "markdown", ".markdown": "markdown", ".rtf": "rtf",
};

export function getFormatFromName(fileName: string): SupportedFormat | null {
  const clean = fileName.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return null;
  return FORMAT_BY_EXTENSION[clean.slice(dot).toLowerCase()] ?? null;
}

export function validateDocumentMetadata(fileName: string, size: number): string | null {
  if (!fileName.trim() || fileName.length > 255 || /[\u0000-\u001f]/u.test(fileName)) return "The selected file has an invalid name.";
  if (getFormatFromName(fileName) === null) return "Unsupported format. Choose PDF, DOCX, TXT, EPUB, HTML, Markdown, RTF or an image.";
  if (!Number.isFinite(size) || size < 0) return "The file size could not be verified.";
  if (size > MAX_DOCUMENT_BYTES) return "This file is over the 50 MB import limit.";
  return null;
}

export function displayFormat(format: SupportedFormat): string {
  return ({
    pdf: "PDF", docx: "Word document", txt: "Text file", epub: "EPUB book",
    image: "Image / scanned page", html: "HTML document", markdown: "Markdown", rtf: "Rich Text Format",
  })[format];
}
