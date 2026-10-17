import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BookRecord } from "@readaloud/reader-core";

interface ReadAloudDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { "by-indexed-at": string; "by-title": string };
  };
}

let database: Promise<IDBPDatabase<ReadAloudDB>> | undefined;

function getDatabase(): Promise<IDBPDatabase<ReadAloudDB>> {
  if (!database) {
    database = openDB<ReadAloudDB>("readaloud-library", 1, {
      upgrade(db) {
        const store = db.createObjectStore("books", { keyPath: "id" });
        store.createIndex("by-indexed-at", "indexedAt");
        store.createIndex("by-title", "title");
      },
    });
  }
  return database;
}

export async function listBooks(): Promise<BookRecord[]> {
  const db = await getDatabase();
  return (await db.getAll("books")).sort((a, b) => b.indexedAt.localeCompare(a.indexedAt));
}

export async function saveBook(book: BookRecord): Promise<void> {
  const db = await getDatabase();
  await db.put("books", book);
}

export async function updateReadingPosition(bookId: string, sentenceIndex: number): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction("books", "readwrite");
  const book = await tx.store.get(bookId);
  if (book) await tx.store.put({ ...book, lastSentenceIndex: Math.max(0, sentenceIndex) });
  await tx.done;
}

export async function removeBook(bookId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("books", bookId);
}
