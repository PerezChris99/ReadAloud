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

// Cache cumulative character offsets by array identity. A book's sentence and page
// arrays are immutable during reading, so this avoids rebuilding huge prefixes on
// every caption update while allowing garbage collection when a book is released.
const sentencePrefixCache = new WeakMap<string[], number[]>();
const pageLengthCache = new WeakMap<string[], number[]>();

function getSentencePrefixLengths(sentences: string[]): number[] {
  const cached = sentencePrefixCache.get(sentences);
  if (cached) return cached;
  const prefix = new Array<number>(sentences.length + 1);
  prefix[0] = 0;
  for (let index = 0; index < sentences.length; index += 1) {
    prefix[index + 1] = (prefix[index] ?? 0) + (sentences[index]?.length ?? 0) + (index > 0 ? 1 : 0);
  }
  sentencePrefixCache.set(sentences, prefix);
  return prefix;
}

function getPageCumulativeLengths(pages: string[]): number[] {
  const cached = pageLengthCache.get(pages);
  if (cached) return cached;
  const cumulative = new Array<number>(pages.length);
  let total = 0;
  for (let index = 0; index < pages.length; index += 1) {
    total += pages[index]?.length ?? 0;
    cumulative[index] = total;
  }
  pageLengthCache.set(pages, cumulative);
  return cumulative;
}

export function sentenceToPageIndex(sentences: string[], pages: string[], sentenceIndex: number): number {
  if (sentences.length === 0 || pages.length === 0) return 0;
  const safeIndex = Math.max(0, Math.min(Math.floor(sentenceIndex), sentences.length - 1));
  const prefixLength = getSentencePrefixLengths(sentences)[safeIndex] ?? 0;
  const cumulative = getPageCumulativeLengths(pages);

  // Find the first page whose cumulative text length covers this sentence offset.
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((cumulative[middle] ?? 0) > prefixLength) high = middle;
    else low = middle + 1;
  }
  return low;
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
