import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import {
  getFormatFromName, makePagePreviews, normalizeText, splitIntoSentences,
  validateDocumentMetadata, MAX_INDEXED_CHARACTERS, type BookRecord,
} from "@readaloud/reader-core";
import { extractWithService, type ApiSettings } from "./api";

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function stripMarkup(source: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  document.querySelectorAll("script,style,noscript,nav").forEach((node) => node.remove());
  return document.body?.textContent ?? document.documentElement.textContent ?? "";
}

function normaliseZipPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

async function extractEpub(buffer: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  const files = unzipSync(new Uint8Array(buffer));
  const containerBytes = files["META-INF/container.xml"];
  if (!containerBytes) throw new Error("EPUB container metadata is missing.");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseAttributeValue: false });
  const container = parser.parse(bytesToText(containerBytes)) as { container?: { rootfiles?: { rootfile?: unknown } } };
  const roots = container.container?.rootfiles?.rootfile;
  const rootfile = (Array.isArray(roots) ? roots[0] : roots) as Record<string, string> | undefined;
  const opfPath = rootfile?.["@_full-path"];
  if (!opfPath) throw new Error("EPUB package path is missing.");
  const packageBytes = files[normaliseZipPath(opfPath)];
  if (!packageBytes) throw new Error("EPUB package file is missing.");
  const book = parser.parse(bytesToText(packageBytes)) as { package?: { manifest?: { item?: unknown }; spine?: { itemref?: unknown } } };
  const manifestItems = book.package?.manifest?.item;
  const spineItems = book.package?.spine?.itemref;
  const manifest = (Array.isArray(manifestItems) ? manifestItems : manifestItems ? [manifestItems] : []) as Record<string, string>[];
  const spine = (Array.isArray(spineItems) ? spineItems : spineItems ? [spineItems] : []) as Record<string, string>[];
  const byId = new Map(manifest.map((item) => [item["@_id"], item]));
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const chunks: string[] = [];
  for (const ref of spine) {
    const item = byId.get(ref["@_idref"] ?? "");
    const href = item?.["@_href"];
    if (!href || item?.["@_properties"] === "nav") continue;
    const archivePath = normaliseZipPath(base + href);
    const bytes = files[archivePath];
    if (bytes) {
      const text = normalizeText(stripMarkup(bytesToText(bytes)));
      if (text) chunks.push(text);
    }
  }
  return { text: normalizeText(chunks.join("\\n\\n")), pageCount: chunks.length };
}

export async function indexDocument(file: File, api: ApiSettings, progress: (value: number, label: string) => void): Promise<BookRecord> {
  const error = validateDocumentMetadata(file.name, file.size);
  if (error) throw new Error(error);
  const format = getFormatFromName(file.name);
  if (!format) throw new Error("Unsupported format.");
  progress(8, "Validating document");
  const buffer = await file.arrayBuffer();
  progress(20, "Reading file");
  let text = "";
  let pageCount = 1;

  if (format === "pdf") {
    try {
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
      if (pdf.numPages > 800) throw new Error("This PDF exceeds the 800-page limit.");
      const pages: string[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const line = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        pages.push(line);
        progress(20 + Math.round((number / pdf.numPages) * 45), "Indexing PDF page " + number + " of " + pdf.numPages);
      }
      text = pages.join("\\n\\n");
      pageCount = pdf.numPages;
      if (!normalizeText(text)) throw new Error("No selectable text was found in this PDF.");
    } catch (localError) {
      progress(30, "Trying configured PDF/OCR service");
      const remote = await extractWithService(file, api);
      text = remote.text;
      pageCount = remote.pageCount;
      if (!normalizeText(text)) throw new Error("No readable text was found in this PDF.");
    }
  } else if (format === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    text = result.value;
    progress(65, "Extracted Word document text");
  } else if (format === "epub") {
    const result = await extractEpub(buffer);
    text = result.text;
    pageCount = result.pageCount;
    progress(65, "Indexed EPUB reading order");
  } else if (format === "image") {
    const remote = await extractWithService(file, api);
    text = remote.text;
    pageCount = remote.pageCount;
    progress(70, "Completed OCR");
  } else {
    text = new TextDecoder("utf-8").decode(buffer);
    if (format === "html") text = stripMarkup(text);
    if (format === "rtf") text = text.replace(/\\\\'[0-9a-fA-F]{2}/g, " ").replace(/\\\\[a-zA-Z]+-?\\d* ?|[{}]/g, " ");
    progress(65, "Extracted document text");
  }

  text = normalizeText(text);
  if (!text) throw new Error("This file contains no readable text.");
  if (text.length > MAX_INDEXED_CHARACTERS) throw new Error("Extracted text exceeds the 8-million-character safety limit.");
  progress(78, "Building sentence captions");
  const sentences = splitIntoSentences(text);
  const pagePreviews = makePagePreviews(text);
  progress(94, "Saving local reading index");
  const rawTitle = file.name.replace(/\\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return {
    id: crypto.randomUUID(),
    title: rawTitle || "Untitled book",
    fileName: file.name,
    format,
    text,
    sentences,
    pagePreviews,
    pageCount: Math.max(pageCount, pagePreviews.length),
    indexedAt: new Date().toISOString(),
    status: "ready",
    progress: 100,
    lastSentenceIndex: 0,
    totalCharacters: text.length,
  };
}
