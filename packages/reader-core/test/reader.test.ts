import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeZipArchive,
  makePagePreviews, normalizeText, splitIntoSentences, sentenceToPageIndex,
  createInitialReaderState, readerReducer, getFormatFromName, validateDocumentMetadata,
} from "../src/index.js";

test("normalizes line endings, BOM, control characters and excess blank lines", () => {
  assert.equal(normalizeText("\uFEFFHello\r\nworld\u0000\n\n\nnext"), "Hello\nworld\n\nnext");
});
test("splits sentences and rejects empty caption lists", () => {
  assert.deepEqual(splitIntoSentences("First sentence. Second sentence! Last one?"), ["First sentence.", "Second sentence!", "Last one?"]);
  assert.deepEqual(splitIntoSentences("  "), []);
});
test("page previews are bounded and preserve trailing text", () => {
  const input = Array.from({ length: 18 }, (_, i) => "Paragraph " + (i + 1) + ": " + "book content ".repeat(35)).join("\n\n");
  const pages = makePagePreviews(input, 600);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 600));
  assert.ok(pages.join("\n\n").includes("Paragraph 18:"));
  assert.equal(sentenceToPageIndex(["one", "two"], ["one", "two"], 1), 1);
  assert.equal(sentenceToPageIndex(["one", "two", "three"], ["one", "two", "three"], 0), 0);
  assert.equal(sentenceToPageIndex(["one", "two", "three"], ["one", "two", "three"], 2), 2);
  assert.equal(sentenceToPageIndex(["one", "two"], ["one", "two"], 99), 1);
  assert.equal(sentenceToPageIndex(["one", "two"], ["one", "two"], -5), 0);
});
test("reader state transitions guard empty books and complete at the last sentence", () => {
  let state = createInitialReaderState();
  state = readerReducer(state, { type: "PLAY" });
  assert.equal(state.status, "idle");
  state = readerReducer(state, { type: "LOAD", totalSentences: 2 });
  state = readerReducer(state, { type: "PLAY" });
  assert.equal(state.status, "playing");
  state = readerReducer(state, { type: "PAUSE" });
  assert.equal(state.status, "paused");
  state = readerReducer(state, { type: "PLAY" });
  state = readerReducer(state, { type: "SENTENCE_DONE" });
  assert.equal(state.sentenceIndex, 1);
  state = readerReducer(state, { type: "SENTENCE_DONE" });
  assert.equal(state.status, "completed");
});
test("validates known formats, unsupported extensions, unsafe names and oversized files", () => {
  assert.equal(getFormatFromName("chapter.EPUB"), "epub");
  assert.equal(getFormatFromName("book.pdf.exe"), null);
  assert.equal(validateDocumentMetadata("report.pdf", 100), null);
  assert.ok(validateDocumentMetadata("payload.exe", 100));
  assert.ok(validateDocumentMetadata("report.pdf", 60 * 1024 * 1024));
  assert.ok(validateDocumentMetadata("bad\nname.pdf", 100));
});
test("rejects truncated archives before decompressing", () => {
  assert.throws(() => assertSafeZipArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), /archive/i);
});

test("normalization preserves multilingual text and removes a leading BOM", () => {
  const source = "\uFEFFHello café — مرحباً — 你好 — नमस्ते 😀\r\nNext";
  const normalized = normalizeText(source);
  assert.ok(normalized.startsWith("Hello"));
  assert.ok(normalized.includes("café"));
  assert.ok(normalized.includes("مرحبا") || normalized.includes("مرحباً"));
  assert.ok(normalized.includes("你好"));
  assert.ok(normalized.includes("नमस्ते"));
  assert.ok(normalized.includes("😀"));
  assert.ok(!normalized.includes("\r"));
});

test("page previews retain all source paragraphs and respect the configured bound", () => {
  const paragraphs = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}: ${"reader content ".repeat(20)}`);
  const source = paragraphs.join("\n\n");
  const pages = makePagePreviews(source, 256);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 256));
  const reconstructed = pages.join("\n");
  for (let index = 1; index <= paragraphs.length; index += 1) {
    assert.ok(reconstructed.includes(`Paragraph ${index}:`));
  }
});

test("sentence-to-page lookup clamps invalid indexes and handles empty collections", () => {
  assert.equal(sentenceToPageIndex([], [], 0), 0);
  assert.equal(sentenceToPageIndex(["one", "two"], ["one"], -1), 0);
  assert.equal(sentenceToPageIndex(["one", "two"], ["one"], 100), 0);
  assert.equal(sentenceToPageIndex(["one", "two"], ["one", "two"], 100), 1);
});

test("reader reducer does not advance beyond completion after repeated events", () => {
  let state = createInitialReaderState();
  state = readerReducer(state, { type: "LOAD", totalSentences: 1 });
  state = readerReducer(state, { type: "PLAY" });
  state = readerReducer(state, { type: "SENTENCE_DONE" });
  assert.equal(state.status, "completed");
  assert.equal(state.sentenceIndex, 0);
  state = readerReducer(state, { type: "SENTENCE_DONE" });
  assert.equal(state.status, "completed");
  assert.equal(state.sentenceIndex, 0);
});

test("document metadata rejects traversal and control-character filenames", () => {
  assert.ok(validateDocumentMetadata("../outside.pdf", 100));
  assert.ok(validateDocumentMetadata("folder\\\\outside.pdf", 100));
  assert.ok(validateDocumentMetadata("bad\\nname.pdf", 100));
  assert.ok(validateDocumentMetadata("book.pdf.exe", 100));
});

test("safe ZIP validation rejects empty and truncated payloads", () => {
  assert.throws(() => assertSafeZipArchive(new Uint8Array()), /archive/i);
  assert.throws(() => assertSafeZipArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), /archive/i);
});
