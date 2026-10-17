export interface ApiSettings {
  baseUrl: string;
  token: string;
}

export function normaliseApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export async function extractWithService(file: File, settings: ApiSettings): Promise<{ text: string; pageCount: number }> {
  const baseUrl = normaliseApiUrl(settings.baseUrl);
  if (!baseUrl) throw new Error("PDF text could not be extracted locally. Configure the optional ReadAloud API for PDF/OCR processing.");
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(baseUrl + "/v1/documents/extract", {
    method: "POST",
    headers: settings.token ? { "X-ReadAloud-Token": settings.token } : {},
    body: form,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(payload.detail || "The document service could not index this file.");
  }
  const payload = await response.json() as { text: string; pageCount?: number };
  return { text: payload.text, pageCount: payload.pageCount ?? 1 };
}

export async function neuralSpeechUrl(text: string, voice: string, rate: number, volume: number, settings: ApiSettings): Promise<string> {
  const baseUrl = normaliseApiUrl(settings.baseUrl);
  if (!baseUrl) throw new Error("Configure the optional ReadAloud API to use natural neural voices.");
  const response = await fetch(baseUrl + "/v1/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.token ? { "X-ReadAloud-Token": settings.token } : {}),
    },
    body: JSON.stringify({ text, voice, rate, volume }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(payload.detail || "Neural speech generation failed.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
