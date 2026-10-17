import * as SQLite from "expo-sqlite";
import type { BookRecord, BookSummary } from "@readaloud/reader-core";

let database: Promise<SQLite.SQLiteDatabase> | undefined;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = (async () => {
      const connection = await SQLite.openDatabaseAsync("readaloud-library.db");
      await connection.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await connection.execAsync("CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, file_name TEXT NOT NULL, format TEXT NOT NULL, text_content TEXT NOT NULL, sentences_json TEXT NOT NULL, pages_json TEXT NOT NULL, page_count INTEGER NOT NULL, indexed_at TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL, last_sentence_index INTEGER NOT NULL, total_characters INTEGER NOT NULL, sentence_count INTEGER NOT NULL DEFAULT 0)");
      const columns = await connection.getAllAsync<{ name: string }>("PRAGMA table_info(books)");
      if (!columns.some((column) => column.name === "sentence_count")) {
        await connection.execAsync("ALTER TABLE books ADD COLUMN sentence_count INTEGER NOT NULL DEFAULT 0");
        await connection.execAsync("UPDATE books SET sentence_count = json_array_length(sentences_json)");
      }
      await connection.execAsync("CREATE INDEX IF NOT EXISTS idx_books_indexed_at ON books(indexed_at DESC)");
      await connection.execAsync("CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE)");
      return connection;
    })();
  }
  return database;
}

type DbBook = {
  id: string; title: string; file_name: string; format: BookRecord["format"];
  text_content: string; sentences_json: string; pages_json: string; page_count: number;
  indexed_at: string; status: BookRecord["status"]; progress: number;
  last_sentence_index: number; total_characters: number; sentence_count: number;
};

type DbBookSummary = Pick<DbBook,
  "id" | "title" | "file_name" | "format" | "page_count" | "indexed_at" |
  "status" | "progress" | "last_sentence_index" | "total_characters" | "sentence_count"
>;

function fromSummary(row: DbBookSummary): BookSummary {
  return {
    id: row.id, title: row.title, fileName: row.file_name, format: row.format,
    pageCount: row.page_count, indexedAt: row.indexed_at, status: row.status,
    progress: row.progress, lastSentenceIndex: row.last_sentence_index,
    totalCharacters: row.total_characters, sentenceCount: row.sentence_count,
  };
}

function fromRow(row: DbBook): BookRecord {
  return {
    id: row.id, title: row.title, fileName: row.file_name, format: row.format,
    text: row.text_content, sentences: JSON.parse(row.sentences_json) as string[],
    pagePreviews: JSON.parse(row.pages_json) as string[], pageCount: row.page_count,
    indexedAt: row.indexed_at, status: row.status, progress: row.progress,
    lastSentenceIndex: row.last_sentence_index, totalCharacters: row.total_characters,
  };
}

export async function listBooks(): Promise<BookSummary[]> {
  const connection = await db();
  const rows = await connection.getAllAsync<DbBookSummary>(
    "SELECT id,title,file_name,format,page_count,indexed_at,status,progress,last_sentence_index,total_characters,sentence_count FROM books ORDER BY indexed_at DESC"
  );
  return rows.map(fromSummary);
}

export async function getBook(bookId: string): Promise<BookRecord | null> {
  const connection = await db();
  const row = await connection.getFirstAsync<DbBook>("SELECT * FROM books WHERE id = ?", bookId);
  return row ? fromRow(row) : null;
}

export async function saveBook(book: BookRecord): Promise<void> {
  const connection = await db();
  await connection.runAsync(
    "INSERT INTO books (id,title,file_name,format,text_content,sentences_json,pages_json,page_count,indexed_at,status,progress,last_sentence_index,total_characters,sentence_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,file_name=excluded.file_name,format=excluded.format,text_content=excluded.text_content,sentences_json=excluded.sentences_json,pages_json=excluded.pages_json,page_count=excluded.page_count,indexed_at=excluded.indexed_at,status=excluded.status,progress=excluded.progress,last_sentence_index=excluded.last_sentence_index,total_characters=excluded.total_characters,sentence_count=excluded.sentence_count",
    book.id, book.title, book.fileName, book.format, "", JSON.stringify(book.sentences),
    JSON.stringify(book.pagePreviews), book.pageCount, book.indexedAt, book.status, book.progress,
    book.lastSentenceIndex, book.totalCharacters, book.sentences.length,
  );
}

export async function updateReadingPosition(bookId: string, sentenceIndex: number): Promise<void> {
  const connection = await db();
  await connection.runAsync("UPDATE books SET last_sentence_index = ? WHERE id = ?", Math.max(0, sentenceIndex), bookId);
}

export async function deleteBook(bookId: string): Promise<void> {
  const connection = await db();
  await connection.runAsync("DELETE FROM books WHERE id = ?", bookId);
}
