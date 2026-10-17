export interface ApiSettings {
  baseUrl: string;
  token: string;
}

export function normaliseApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Refuse plaintext remote endpoints before sending documents or credentials. */
export function validateApiBaseUrl(value: string): string {
  const baseUrl = normaliseApiUrl(value);
  if (!baseUrl) throw new Error("Configure the optional ReadAloud API URL in Settings.");
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("Enter a valid ReadAloud API URL."); }
  const host = url.hostname.toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The ReadAloud API URL must not contain credentials, a query, or a fragment.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Use HTTPS for remote ReadAloud services. HTTP is allowed only for localhost development.");
  }
  return baseUrl;
}

async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Keep the timer active through response-body consumption, not just until
    // fetch receives headers; a slow/truncated body must not hang the UI.
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function extractWithService(file: File, settings: ApiSettings): Promise<{ text: string; pageCount: number }> {
  const baseUrl = validateApiBaseUrl(settings.baseUrl);
  const form = new FormData();
  form.append("file", file, file.name);
  return withRequestTimeout(async (signal) => {
    const response = await fetch(baseUrl + "/v1/documents/extract", {
      method: "POST",
      headers: settings.token ? { "X-ReadAloud-Token": settings.token } : {},
      body: form,
      signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(payload.detail || "The document service could not index this file.");
    }
    const payload = await response.json() as { text?: unknown; pageCount?: unknown };
    if (typeof payload.text !== "string" || payload.text.length > 8_000_000) {
      throw new Error("The document service returned invalid or oversized extracted text.");
    }
    const pageCount = typeof payload.pageCount === "number" && Number.isFinite(payload.pageCount) && payload.pageCount >= 0
      ? payload.pageCount : 1;
    return { text: payload.text, pageCount };
  }, 120_000, "The document service timed out. Check the connection and try again.");
}

export async function neuralSpeechUrl(text: string, voice: string, rate: number, volume: number, settings: ApiSettings): Promise<string> {
  const baseUrl = validateApiBaseUrl(settings.baseUrl);
  return withRequestTimeout(async (signal) => {
    const response = await fetch(baseUrl + "/v1/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(settings.token ? { "X-ReadAloud-Token": settings.token } : {}) },
      body: JSON.stringify({ text, voice, rate, volume }),
      signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(payload.detail || "Neural speech generation failed.");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("audio/")) throw new Error("The speech service returned an unexpected response.");
    const blob = await response.blob();
    if (blob.size === 0 || blob.size > 8 * 1024 * 1024) throw new Error("The speech service returned empty or oversized audio.");
    return URL.createObjectURL(blob);
  }, 35_000, "Neural speech timed out. Switch to a system voice or try again.");
}
