export type SupportedFormat =
  | "pdf" | "docx" | "txt" | "epub" | "image"
  | "html" | "markdown" | "rtf";

export type IndexStatus = "queued" | "indexing" | "ready" | "failed";
export type PlaybackStatus = "idle" | "playing" | "paused" | "stopped" | "completed" | "error";
export type VoiceProvider = "system" | "neural";

export interface BookRecord {
  id: string;
  title: string;
  fileName: string;
  format: SupportedFormat;
  text: string;
  sentences: string[];
  pagePreviews: string[];
  pageCount: number;
  indexedAt: string;
  status: IndexStatus;
  progress: number;
  lastSentenceIndex: number;
  totalCharacters: number;
}

export interface BookSummary {
  id: string;
  title: string;
  fileName: string;
  format: SupportedFormat;
  pageCount: number;
  indexedAt: string;
  status: IndexStatus;
  progress: number;
  lastSentenceIndex: number;
  totalCharacters: number;
  sentenceCount: number;
}

export interface ReaderState {
  status: PlaybackStatus;
  sentenceIndex: number;
  totalSentences: number;
  error: string | null;
}

export type ReaderAction =
  | { type: "LOAD"; totalSentences: number; sentenceIndex?: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "SENTENCE_DONE" }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

export interface ReadingPreferences {
  provider: VoiceProvider;
  voiceId: string;
  rate: number;
  volume: number;
  soundEffects: boolean;
  captionsEnabled: boolean;
  fontScale: number;
}

export const DEFAULT_PREFERENCES: Readonly<ReadingPreferences> = Object.freeze({
  provider: "system",
  voiceId: "",
  rate: 1,
  volume: 0.8,
  soundEffects: true,
  captionsEnabled: true,
  fontScale: 1,
});
