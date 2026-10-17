import { File } from "expo-file-system";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import {
  getFormatFromName, makePagePreviews, normalizeText, splitIntoSentences,
  validateDocumentMetadata, MAX_INDEXED_CHARACTERS, type BookRecord,
} from "@readaloud/reader-core";

export interface DocumentApiSettings { baseUrl: string; token: string; }
export type ProgressUpdate = (progress: number, label: string) => void;

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}
function stripMarkup(source: string): string {
  return source
    .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<nav[\\s\\S]*?<\\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
function normaliseZipPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
function collectXmlText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectXmlText);
  if (!node || typeof node !== "object") return [];
  const object = node as Record<string, unknown>;
  if (typeof object.t === "string") return [object.t];
  return Object.entries(object).flatMap(([key, value]) => key.startsWith("@_") ? [] : collectXmlText(value));
}
function extractDocx(bytes: Uint8Array): string {
  const archive = unzipSync(bytes);
  const main = archive["word/document.xml"];
  if (!main) throw new Error("The Word file is missing its document body.");
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, textNodeName: "t" });
  const parsed = parser.parse(bytesToText(main)) as { document?: { body?: { p?: unknown } } };
  const paragraphs = parsed.document?.body?.p;
  const items = Array.isArray(paragraphs) ? paragraphs : paragraphs ? [paragraphs] : [];
  return items.map((item) => collectXmlText(item).join("")).filter((part) => part.trim()).join("\\n\\n");
}
function extractEpub(bytes: Uint8Array): { text: string; pages: number } {
  const archive = unzipSync(bytes);
  const container = archive["META-INF/container.xml"];
  if (!container) throw new Error("The EPUB container metadata is missing.");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  const parsedContainer = parser.parse(bytesToText(container)) as { container?: { rootfiles?: { rootfile?: unknown } } };
  const rootfiles = parsedContainer.container?.rootfiles?.rootfile;
  const rootfile = (Array.isArray(rootfiles) ? rootfiles[0] : rootfiles) as Record<string, string> | undefined;
  const opf = rootfile?.["@_full-path"];
  if (!opf || !archive[normaliseZipPath(opf)]) throw new Error("The EPUB package file is missing.");
  const parsed = parser.parse(bytesToText(archive[normaliseZipPath(opf)]!)) as { package?: { manifest?: { item?: unknown }; spine?: { itemref?: unknown } } };
  const manifest = parsed.package?.manifest?.item;
  const itemList = (Array.isArray(manifest) ? manifest : manifest ? [manifest] : []) as Record<string, string>[];
  const spine = parsed.package?.spine?.itemref;
  const spineList = (Array.isArray(spine) ? spine : spine ? [spine] : []) as Record<string, string>[];
  const byId = new Map(itemList.map((item) => [item["@_id"], item]));
  const prefix = opf.includes("/") ? opf.slice(0, opf.lastIndexOf("/") + 1) : "";
  const chunks: string[] = [];
  for (const reference of spineList) {
    const item = byId.get(reference["@_idref"] ?? "");
    const href = item?.["@_href"];
    if (!href || item?.["@_properties"] === "nav") continue;
    const content = archive[normaliseZipPath(prefix + href)];
    if (content) {
      const text = normalizeText(stripMarkup(bytesToText(content)));
      if (text) chunks.push(text);
    }
  }
  return { text: normalizeText(chunks.join("\\n\\n")), pages: chunks.length };
}

async function extractWithService(uri: string, name: string, api: DocumentApiSettings): Promise<{ text: string; pageCount: number }> {
  if (!api.baseUrl.trim()) throw new Error("PDF text extraction and image OCR need a configured ReadAloud service on mobile. Configure the service URL in Settings; files are not uploaded until you do.");
  const file = new File(uri);
  const bytes = await file.bytes();
  const form = new FormData();
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  form.append("file", blob, name);
  const response = await fetch(api.baseUrl.replace(/\\/+$/, "") + "/v1/documents/extract", {
    method: "POST",
    headers: api.token ? { "X-ReadAloud-Token": api.token } : {},
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail || "The configured document service could not process this file.");
  }
  return await response.json() as { text: string; pageCount: number };
}

export async function indexMobileDocument(
  uri: string,
  fileName: string,
  size: number,
  api: DocumentApiSettings,
  progress: ProgressUpdate,
): Promise<BookRecord> {
  const failure = validateDocumentMetadata(fileName, size);
  if (failure) throw new Error(failure);
  const format = getFormatFromName(fileName);
  if (!format) throw new Error("Unsupported document format.");
  progress(8, "Validating document");
  let text = "";
  let pageCount = 1;

  if (format === "pdf" || format === "image") {
    progress(18, format === "pdf" ? "Preparing PDF extraction" : "Preparing image OCR");
    const result = await extractWithService(uri, fileName, api);
    text = result.text;
    pageCount = result.pageCount;
    progress(72, "Text extraction complete");
  } else {
    const file = new File(uri);
    const bytes = await file.bytes();
    progress(25, "Reading document");
    if (format === "docx") {
      text = extractDocx(bytes);
      progress(65, "Indexed Word paragraphs");
    } else if (format === "epub") {
      const result = extractEpub(bytes);
      text = result.text;
      pageCount = result.pages;
      progress(65, "Indexed EPUB reading order");
    } else {
      text = bytesToText(bytes);
      if (format === "html") text = stripMarkup(text);
      if (format === "rtf") text = text.replace(/\\\\'[0-9a-fA-F]{2}/g, " ").replace(/\\\\[a-zA-Z]+-?\\d* ?|[{}]/g, " ");
      progress(65, "Extracted text");
    }
  }

  text = normalizeText(text);
  if (!text) throw new Error("No readable text was found in this document.");
  if (text.length > MAX_INDEXED_CHARACTERS) throw new Error("The extracted text exceeds the 8-million-character safety limit.");
  progress(80, "Building sentence captions");
  const sentences = splitIntoSentences(text);
  const pagePreviews = makePagePreviews(text, 1_100);
  if (!sentences.length) throw new Error("No readable sentences were found.");
  const title = fileName.replace(/\\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled book";
  progress(96, "Saving local reading index");
  return {
    id: "book-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    title, fileName, format, text, sentences, pagePreviews,
    pageCount: Math.max(pageCount, pagePreviews.length),
    indexedAt: new Date().toISOString(), status: "ready", progress: 100,
    lastSentenceIndex: 0, totalCharacters: text.length,
  };
}
