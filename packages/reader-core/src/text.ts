import type { ReaderState, ReaderAction } from "./types.js";

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_INDEXED_CHARACTERS = 8_000_000;
export const DEFAULT_PAGE_CHARACTERS = 1_450;
export const MAX_SENTENCE_CHARACTERS = 4_500;

export function normalizeText(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitIntoSentences(input: string): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  const segments = text.match(/[^.!?…]+(?:[.!?…]+[”’"'’)]*)?|[.!?…]+/gu) ?? [];
  return segments.map((part) => part.trim()).filter(Boolean).flatMap((sentence) => {
    if (sentence.length <= MAX_SENTENCE_CHARACTERS) return [sentence];
    const parts: string[] = [];
    let remaining = sentence;
    while (remaining.length > MAX_SENTENCE_CHARACTERS) {
      let splitAt = remaining.lastIndexOf(" ", MAX_SENTENCE_CHARACTERS);
      if (splitAt < Math.floor(MAX_SENTENCE_CHARACTERS * 0.55)) splitAt = MAX_SENTENCE_CHARACTERS;
      parts.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) parts.push(remaining);
    return parts;
  });
}

export function makePagePreviews(input: string, maxChars = DEFAULT_PAGE_CHARACTERS): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 250 || maxChars > 8_000) {
    throw new RangeError("Page preview size must be between 250 and 8000 characters.");
  }
  const text = normalizeText(input);
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/);
  const pages: string[] = [];
  let page = "";
  for (const paragraph of paragraphs) {
    let remaining = paragraph.trim();
    while (remaining) {
      const separator = page ? "\n\n" : "";
      const capacity = maxChars - page.length - separator.length;
      if (capacity <= 0) {
        pages.push(page);
        page = "";
        continue;
      }
      if (remaining.length <= capacity) {
        page += separator + remaining;
        remaining = "";
        continue;
      }
      let breakAt = remaining.lastIndexOf(" ", capacity);
      if (breakAt < Math.floor(capacity * 0.55)) breakAt = capacity;
      const piece = remaining.slice(0, breakAt).trim();
      if (piece) {
        if (page) pages.push(page);
        pages.push(piece);
        page = "";
      }
      remaining = remaining.slice(breakAt).trim();
    }
    if (page.length >= maxChars * 0.85) {
      pages.push(page);
      page = "";
    }
  }
  if (page) pages.push(page);
  return pages.filter(Boolean);
}

export function sentenceToPageIndex(sentences: string[], pages: string[], sentenceIndex: number): number {
  if (sentences.length === 0 || pages.length === 0) return 0;
  const safeIndex = Math.max(0, Math.min(sentenceIndex, sentences.length - 1));
  const prefixLength = sentences.slice(0, safeIndex).join(" ").length;
  let consumed = 0;
  for (let index = 0; index < pages.length; index += 1) {
    consumed += pages[index]?.length ?? 0;
    if (prefixLength <= consumed) return index;
  }
  return pages.length - 1;
}

export function createInitialReaderState(): ReaderState {
  return { status: "idle", sentenceIndex: 0, totalSentences: 0, error: null };
}

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case "LOAD": {
      const total = Math.max(0, Math.floor(action.totalSentences));
      const index = Math.max(0, Math.min(Math.floor(action.sentenceIndex ?? 0), Math.max(0, total - 1)));
      return { status: total ? "stopped" : "idle", sentenceIndex: index, totalSentences: total, error: null };
    }
    case "PLAY":
      return state.totalSentences > 0 ? { ...state, status: "playing", error: null } : state;
    case "PAUSE":
      return state.status === "playing" ? { ...state, status: "paused" } : state;
    case "STOP":
      return { ...state, status: state.totalSentences ? "stopped" : "idle", sentenceIndex: 0, error: null };
    case "NEXT":
      return state.totalSentences === 0 ? state : { ...state, sentenceIndex: Math.min(state.sentenceIndex + 1, state.totalSentences - 1), status: "stopped", error: null };
    case "PREVIOUS":
      return state.totalSentences === 0 ? state : { ...state, sentenceIndex: Math.max(0, state.sentenceIndex - 1), status: "stopped", error: null };
    case "SENTENCE_DONE":
      if (state.totalSentences === 0) return state;
      if (state.sentenceIndex >= state.totalSentences - 1) return { ...state, status: "completed", sentenceIndex: state.totalSentences - 1 };
      return { ...state, sentenceIndex: state.sentenceIndex + 1, status: "playing" };
    case "FAIL":
      return { ...state, status: "error", error: action.message.slice(0, 500) };
    case "RESET":
      return createInitialReaderState();
  }
}
