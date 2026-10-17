import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BookRecord, BookSummary } from "@readaloud/reader-core";

interface ReadAloudDB extends DBSchema {
  books: {
    key: string;
    value: BookSummary;
    indexes: { "by-indexed-at": string; "by-title": string };
  };
  bookData: { key: string; value: BookRecord };
}

let database: Promise<IDBPDatabase<ReadAloudDB>> | undefined;

function toSummary(book: BookRecord): BookSummary {
  return {
    id: book.id, title: book.title, fileName: book.fileName, format: book.format,
    pageCount: book.pageCount, indexedAt: book.indexedAt, status: book.status,
    progress: book.progress, lastSentenceIndex: book.lastSentenceIndex,
    totalCharacters: book.totalCharacters, sentenceCount: book.sentences.length,
  };
}

function getDatabase(): Promise<IDBPDatabase<ReadAloudDB>> {
  if (!database) {
    database = openDB<ReadAloudDB>("readaloud-library", 2, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("books", { keyPath: "id" });
          store.createIndex("by-indexed-at", "indexedAt");
          store.createIndex("by-title", "title");
          db.createObjectStore("bookData", { keyPath: "id" });
          return;
        }
        if (oldVersion < 2) {
          db.createObjectStore("bookData", { keyPath: "id" });
          if (!transaction) throw new Error("Library upgrade transaction is unavailable.");
          const summaryStore = transaction.objectStore("books");
          const dataStore = transaction.objectStore("bookData");
          const cursorRequest = summaryStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value as unknown as BookRecord;
            dataStore.put({ ...record, text: "" });
            cursor.update(toSummary(record));
            cursor.continue();
          };
        }
      },
    });
  }
  return database;
}

export async function listBooks(): Promise<BookSummary[]> {
  const db = await getDatabase();
  return (await db.getAll("books")).sort((a, b) => b.indexedAt.localeCompare(a.indexedAt));
}

export async function getBook(bookId: string): Promise<BookRecord | null> {
  const db = await getDatabase();
  return (await db.get("bookData", bookId)) ?? null;
}

export async function saveBook(book: BookRecord): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["books", "bookData"], "readwrite");
  await Promise.all([
    tx.objectStore("books").put(toSummary(book)),
    tx.objectStore("bookData").put({ ...book, text: "" }),
  ]);
  await tx.done;
}

export async function updateReadingPosition(bookId: string, sentenceIndex: number): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["books", "bookData"], "readwrite");
  const content = await tx.objectStore("bookData").get(bookId);
  const summary = await tx.objectStore("books").get(bookId);
  const position = Math.max(0, sentenceIndex);
  if (content) await tx.objectStore("bookData").put({ ...content, lastSentenceIndex: position });
  if (summary) await tx.objectStore("books").put({ ...summary, lastSentenceIndex: position });
  await tx.done;
}

export async function removeBook(bookId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["books", "bookData"], "readwrite");
  await Promise.all([tx.objectStore("books").delete(bookId), tx.objectStore("bookData").delete(bookId)]);
  await tx.done;
}
