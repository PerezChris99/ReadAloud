import test from "node:test";
import assert from "node:assert/strict";
import {
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
test("page previews are bounded and preserve the trailing text", () => {
  const input = Array.from({ length: 18 }, (_, i) => "Paragraph " + (i + 1) + ": " + "book content ".repeat(35)).join("\n\n");
  const pages = makePagePreviews(input, 600);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 600));
  assert.ok(pages.join("\n\n").includes("Paragraph 18:"));
  assert.equal(sentenceToPageIndex(["one", "two"], ["one", "two"], 1), 1);
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
