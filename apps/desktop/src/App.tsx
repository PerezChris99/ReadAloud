import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookRecord, ReadingPreferences } from "@readaloud/reader-core";
import { DEFAULT_PREFERENCES, sentenceToPageIndex } from "@readaloud/reader-core";
import { indexDocument } from "./lib/documents";
import { listBooks, removeBook, saveBook, updateReadingPosition } from "./lib/storage";
import { normaliseApiUrl, type ApiSettings } from "./lib/api";

type Notice = { tone: "good" | "warn" | "error"; message: string } | null;

function chime(enabled: boolean, kind: "select" | "success" | "play" | "stop" = "select"): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const frequencies = kind === "success" ? [660, 880] : kind === "play" ? [520] : kind === "stop" ? [390] : [580];
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequencies[0] ?? 520, context.currentTime);
    if (frequencies[1]) osc.frequency.setValueAtTime(frequencies[1], context.currentTime + 0.07);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.19);
    window.setTimeout(() => void context.close(), 320);
  } catch {
    // Audio feedback is decorative; failures must never block reading.
  }
}

export default function App() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexLabel, setIndexLabel] = useState("");
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [provider, setProvider] = useState<ReadingPreferences["provider"]>("system");
  const [voice, setVoice] = useState("en-US-JennyNeural");
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [effects, setEffects] = useState(true);
  const [apiBase, setApiBase] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [infoPage, setInfoPage] = useState<"about" | "privacy" | "terms" | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const shouldContinue = useRef(false);
  const selected = books.find((book) => book.id === selectedId) ?? books[0] ?? null;
  const api: ApiSettings = useMemo(() => ({ baseUrl: normaliseApiUrl(apiBase), token: apiToken }), [apiBase, apiToken]);
  const activeSentence = selected?.sentences[sentenceIndex] ?? "";
  const pageIndex = selected ? sentenceToPageIndex(selected.sentences, selected.pagePreviews, sentenceIndex) : 0;
  const pagePreview = selected?.pagePreviews[pageIndex] ?? "";
  const progressPercent = selected?.sentences.length ? Math.round(((sentenceIndex + 1) / selected.sentences.length) * 100) : 0;

  useEffect(() => {
    void listBooks().then((data) => {
      setBooks(data);
      if (data[0]) {
        setSelectedId(data[0].id);
        setSentenceIndex(data[0].lastSentenceIndex);
      }
    }).catch(() => setNotice({ tone: "error", message: "The local library could not be opened. Check available storage and restart ReadAloud." }));
    const speech = window.speechSynthesis;
    const refresh = () => setVoices(speech.getVoices());
    refresh();
    speech.addEventListener("voiceschanged", refresh);
    return () => {
      speech.removeEventListener("voiceschanged", refresh);
      shouldContinue.current = false;
      speech.cancel();
      audioRef.current?.pause();
    };
  }, []);

  const stopPlayback = useCallback((reset = false) => {
    shouldContinue.current = false;
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setPlaying(false);
    if (reset) setSentenceIndex(0);
    chime(effects, "stop");
  }, [effects]);

  const speakIndex = useCallback(async (book: BookRecord, index: number) => {
    if (index < 0 || index >= book.sentences.length) {
      setPlaying(false);
      shouldContinue.current = false;
      return;
    }
    setSentenceIndex(index);
    await updateReadingPosition(book.id, index);
    const sentence = book.sentences[index] ?? "";
    if (!sentence) return;
    try {
      if (provider === "neural") {
        const response = await fetch(api.baseUrl + "/v1/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(api.token ? { "X-ReadAloud-Token": api.token } : {}) },
          body: JSON.stringify({ text: sentence, voice, rate, volume }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { detail?: string };
          throw new Error(payload.detail || "Neural speech is unavailable.");
        }
        const objectUrl = URL.createObjectURL(await response.blob());
        audioUrlRef.current = objectUrl;
        const audio = new Audio(objectUrl);
        audio.volume = volume;
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(objectUrl);
          if (audioUrlRef.current === objectUrl) audioUrlRef.current = null;
          if (audioRef.current === audio) audioRef.current = null;
          if (shouldContinue.current) void speakIndex(book, index + 1);
          else setPlaying(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          if (audioUrlRef.current === objectUrl) audioUrlRef.current = null;
          if (audioRef.current === audio) audioRef.current = null;
          setPlaying(false);
          shouldContinue.current = false;
          setNotice({ tone: "error", message: "The generated audio could not be played. Switch to a system voice or retry." });
        };
        await audio.play();
      } else {
        const utterance = new SpeechSynthesisUtterance(sentence);
        const chosen = voices.find((item) => item.name === voice || item.voiceURI === voice);
        if (chosen) utterance.voice = chosen;
        utterance.rate = rate;
        utterance.volume = volume;
        utterance.onend = () => {
          if (shouldContinue.current) void speakIndex(book, index + 1);
          else setPlaying(false);
        };
        utterance.onerror = (event) => {
          if (event.error === "canceled" || event.error === "interrupted") return;
          setPlaying(false);
          shouldContinue.current = false;
          setNotice({ tone: "error", message: "The system voice stopped unexpectedly. Try another installed voice." });
        };
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      setPlaying(false);
      shouldContinue.current = false;
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Speech playback failed." });
    }
  }, [api, provider, rate, volume, voice, voices]);

  const togglePlay = useCallback(() => {
    if (!selected || !selected.sentences.length) return;
    if (playing) {
      shouldContinue.current = false;
      window.speechSynthesis.pause();
      audioRef.current?.pause();
      setPlaying(false);
      chime(effects, "stop");
      return;
    }
    if (provider === "system" && window.speechSynthesis.paused) {
      shouldContinue.current = true;
      window.speechSynthesis.resume();
      setPlaying(true);
      return;
    }
    if (provider === "neural" && audioRef.current) {
      shouldContinue.current = true;
      void audioRef.current.play().then(() => setPlaying(true)).catch((error: unknown) => {
        setPlaying(false);
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Audio could not resume." });
      });
      return;
    }
    shouldContinue.current = true;
    setPlaying(true);
    chime(effects, "play");
    void speakIndex(selected, sentenceIndex >= selected.sentences.length - 1 ? 0 : sentenceIndex);
  }, [selected, playing, provider, effects, speakIndex, sentenceIndex]);

  const moveSentence = useCallback((delta: number) => {
    if (!selected) return;
    stopPlayback();
    const next = Math.max(0, Math.min(selected.sentences.length - 1, sentenceIndex + delta));
    setSentenceIndex(next);
    void updateReadingPosition(selected.id, next);
    chime(effects, "select");
  }, [selected, sentenceIndex, stopPlayback, effects]);

  async function importFile(file?: File): Promise<void> {
    if (!file) return;
    setNotice(null);
    setIndexProgress(1);
    setIndexLabel("Preparing import");
    try {
      const book = await indexDocument(file, api, (value, label) => {
        setIndexProgress(value);
        setIndexLabel(label);
      });
      await saveBook(book);
      const latest = await listBooks();
      setBooks(latest);
      setSelectedId(book.id);
      setSentenceIndex(0);
      setIndexProgress(100);
      setIndexLabel("Book ready to read");
      setNotice({ tone: "good", message: "“" + book.title + "” is indexed and ready. Your reading text is stored locally." });
      chime(effects, "success");
    } catch (error) {
      setIndexProgress(0);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Import failed." });
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selected || !window.confirm("Remove “" + selected.title + "” and its local reading index? The original file will not be deleted.")) return;
    stopPlayback();
    await removeBook(selected.id);
    const remaining = await listBooks();
    setBooks(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setSentenceIndex(0);
    setNotice({ tone: "good", message: "Book removed from the local library." });
  }

  function selectBook(book: BookRecord): void {
    stopPlayback();
    setSelectedId(book.id);
    setSentenceIndex(book.lastSentenceIndex);
    chime(effects, "select");
  }

  const systemVoices = voices.slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const selectedVoice = provider === "system"
    ? (systemVoices.find((item) => item.name === voice || item.voiceURI === voice)?.name ?? "System default voice")
    : voice;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => stopPlayback()}>
          <span className="brand-mark">ra</span>
          <span><strong>readaloud</strong><small>listen deeply</small></span>
        </button>
        <div className="sidebar-label">YOUR SPACE</div>
        <button className="nav-item active" onClick={() => inputRef.current?.click()}><span>＋</span> Add a book</button>
        <button className="nav-item" onClick={() => setShowSettings(true)}><span>⚙</span> Reader settings</button>
        <div className="sidebar-label library-label">YOUR LIBRARY <span>{books.length}</span></div>
        <div className="book-list">
          {books.map((book) => (
            <button key={book.id} className={"book-row" + (selected?.id === book.id ? " selected" : "")} onClick={() => selectBook(book)}>
              <span className={"book-icon format-" + book.format}>{book.format === "epub" ? "EP" : book.format.toUpperCase().slice(0, 2)}</span>
              <span className="book-row-text"><strong>{book.title}</strong><small>{book.format.toUpperCase()} · {book.sentences.length.toLocaleString()} sentences</small></span>
            </button>
          ))}
          {books.length === 0 && <p className="empty-sidebar">Your next chapter starts here.</p>}
        </div>
        <div className="sidebar-footer"><span className="privacy-dot" /> Local library · private by default</div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><span className="eyebrow">YOUR LISTENING SPACE</span><h1>{selected ? "Welcome back to your story." : "Make time for a good story."}</h1></div>
          <div className="top-actions">
            <button className="button quiet" onClick={() => setShowSettings(true)}>Settings</button>
            <button className="button primary" onClick={() => inputRef.current?.click()}>＋ Import book</button>
          </div>
        </header>
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.epub,.jpg,.jpeg,.png,.webp,.html,.htm,.md,.markdown,.rtf" hidden onChange={(event) => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />

        {indexProgress > 0 && indexProgress < 100 && (
          <section className="index-card" aria-live="polite">
            <div className="index-head"><span className="spinner" /><div><strong>Getting your book ready</strong><small>{indexLabel}</small></div><b>{indexProgress}%</b></div>
            <div className="progress-track"><div style={{ width: indexProgress + "%" }} /></div>
          </section>
        )}

        {notice && <div className={"notice " + notice.tone} role="status"><span>{notice.tone === "error" ? "!" : notice.tone === "good" ? "✓" : "i"}</span><p>{notice.message}</p><button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}

        {!selected ? (
          <section className="welcome-grid">
            <div className="welcome-card">
              <div className="orb orb-yellow" /><div className="orb orb-blue" />
              <span className="pill">YOUR NEXT CHAPTER</span>
              <h2>Turn reading time<br/>into listening time.</h2>
              <p>Bring your books along. ReadAloud prepares your document, follows every sentence, and lets you settle into the story.</p>
              <button className="button primary large" onClick={() => inputRef.current?.click()}>Choose your first book <span>→</span></button>
              <div className="supported">PDF · EPUB · Word · Text · HTML · Images / OCR</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">♫</div><h3>A player made for books</h3><p>Gentle controls, comfortable page previews and captions that follow the words being spoken.</p>
              <div className="feature-icon sky">✧</div><h3>Made to feel natural</h3><p>Use an installed voice or connect an optional neural voice service for a more expressive read.</p>
              <div className="feature-icon sun">⌂</div><h3>Your library stays yours</h3><p>Reading text is stored locally. Documents are sent to a configured service only when that feature needs it.</p>
            </div>
          </section>
        ) : (
          <section className="reader-workspace">
            <div className="reader-head">
              <div className="book-title-wrap"><span className="pill">NOW READING</span><h2>{selected.title}</h2><p>{selected.format.toUpperCase()} · {selected.pagePreviews.length} preview pages · {selected.totalCharacters.toLocaleString()} characters</p></div>
              <button className="button quiet danger" onClick={() => void deleteSelected()}>Remove book</button>
            </div>
            <div className="reader-grid">
              <article className="page-panel">
                <div className="panel-topline"><span>PAGE PREVIEW</span><span>PAGE {pageIndex + 1} / {Math.max(1, selected.pagePreviews.length)}</span></div>
                <div className="paper">
                  <div className="paper-running">{selected.title}</div>
                  <div className="paper-content">{pagePreview.split(/(?<=[.!?])\s+/).map((part, i) => <span key={i} className={activeSentence && part.includes(activeSentence.slice(0, Math.min(25, activeSentence.length))) ? "page-sentence-active" : ""}>{part} </span>)}</div>
                  <div className="paper-footer"><span>READALOUD</span><span>{String(pageIndex + 1).padStart(2, "0")}</span></div>
                </div>
                <div className="page-note"><span className="privacy-dot" /> Page-style preview is generated from extracted text.</div>
              </article>
              <aside className="player-panel">
                <div className="player-meta"><span className="equalizer"><i/><i/><i/></span><span>{playing ? "NOW PLAYING" : "READY WHEN YOU ARE"}</span></div>
                <h3>{selected.title}</h3>
                <p className="chapter-meta">Sentence {Math.min(sentenceIndex + 1, selected.sentences.length)} of {selected.sentences.length}</p>
                <div className="caption-stage" aria-live="polite" aria-atomic="true">
                  <span className="caption-label">FOLLOW ALONG</span>
                  <p>{activeSentence || "Select play to begin listening."}</p>
                  <span className="caption-wave">﹏﹏﹏﹏﹏﹏﹏﹏</span>
                </div>
                <div className="player-progress-line"><div className="progress-track"><div style={{ width: progressPercent + "%" }} /></div><div className="progress-labels"><span>{progressPercent}% through this book</span><span>{Math.max(0, selected.sentences.length - sentenceIndex - 1)} left</span></div></div>
                <div className="transport">
                  <button className="transport-skip" aria-label="Previous sentence" title="Previous sentence" onClick={() => moveSentence(-1)} disabled={sentenceIndex <= 0}>⏮</button>
                  <button className="transport-play" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={togglePlay}>{playing ? "Ⅱ" : "▶"}</button>
                  <button className="transport-skip" aria-label="Next sentence" title="Next sentence" onClick={() => moveSentence(1)} disabled={sentenceIndex >= selected.sentences.length - 1}>⏭</button>
                </div>
                <div className="fine-controls"><label>Reading speed <strong>{rate.toFixed(1)}×</strong><input type="range" min="0.7" max="1.35" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label><label>Volume <strong>{Math.round(volume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label></div>
                <div className="voice-row"><span>VOICE</span><button onClick={() => setShowSettings(true)}>{selectedVoice} <span>⌄</span></button></div>
              </aside>
            </div>
          </section>
        )}
        <footer className="app-footer"><span>Designed for a quieter kind of focus.</span><div><button onClick={() => setInfoPage("privacy")}>Privacy</button><button onClick={() => setInfoPage("terms")}>Terms</button><button onClick={() => setInfoPage("about")}>About</button><span>ReadAloud · v0.2</span></div></footer>
      </main>


      {infoPage && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInfoPage(null); }}>
        <section className="settings-modal information-modal" role="dialog" aria-modal="true" aria-labelledby="information-title">
          <button className="modal-close" aria-label="Close information" onClick={() => setInfoPage(null)}>×</button>
          <span className="pill">{infoPage === "about" ? "WHY READALOUD EXISTS" : "READALOUD · LEGAL"}</span>
          <h2 id="information-title">{infoPage === "about" ? "A little more story in your day." : infoPage === "privacy" ? "Privacy Notice" : "Terms of Use"}</h2>
          <div className="legal-copy">
            {(infoPage === "about" ? [
              "ReadAloud is being built for people who want to enjoy novels, books, reports and long documents by listening. It combines a calm player, page-style previews and sentence-synchronised captions so readers can follow along without losing their place.",
              "Built by PerezChris99, ReadAloud aims to make long-form reading more comfortable and accessible across desktop and mobile devices, while keeping a reader’s library private by default.",
              "The product is in active development. Natural neural voices, PDF/OCR processing and some format support require a configured service; available built-in voices depend on the device."
            ] : infoPage === "privacy" ? [
              "ReadAloud keeps imported reading text and saved progress in local app storage by default. The original document is not modified or deleted when imported. The desktop library uses IndexedDB; the mobile library uses SQLite.",
              "Most supported formats are processed locally. The mobile client sends PDFs and image scans to the ReadAloud API only when a service URL has been explicitly configured. Desktop PDF/OCR fallback and neural speech also use that configured service.",
              "When neural voice is enabled, the current sentence is sent to the configured ReadAloud API, which forwards it to the configured speech provider. The API is designed not to retain uploaded documents or generated audio, but provider and service-operator processing terms still apply.",
              "This application currently has no account service, advertising analytics, cloud library synchronisation or cloud backup. Removing a book deletes its local extracted text and index, not the original source file.",
              "This notice is a product disclosure draft, not jurisdiction-specific legal advice. The publisher must add a monitored support/legal contact and review this text against the real deployment and provider agreements before public release."
            ] : [
              "Use ReadAloud only with books and documents you own or are authorised to access and process. You remain responsible for copyright, licensing and any restrictions imposed by a document's owner.",
              "ReadAloud is an in-development application. Text extraction, OCR, installed voices and third-party neural speech may be incomplete, inaccurate or unavailable. Do not rely on generated speech as the authoritative version of legal, medical, financial, academic or safety-critical content.",
              "Remote extraction and neural speech require a configured service and may incur third-party charges. Operators must configure authentication, rate limits, provider billing protections and privacy terms before offering the service publicly.",
              "Before public distribution, the publisher should obtain legal review and add the appropriate operator identity, support contact, governing law, commercial-use terms and liability provisions."
            ]).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <div className="modal-actions"><button className="button primary" onClick={() => setInfoPage(null)}>Close</button></div>
        </section>
      </div>}
      {showSettings && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false); }}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <button className="modal-close" aria-label="Close settings" onClick={() => setShowSettings(false)}>×</button>
          <span className="pill">PERSONALISE YOUR LISTENING</span><h2 id="settings-title">Reader settings</h2>
          <label className="field-label">Voice provider<select value={provider} onChange={(event) => { setProvider(event.target.value as ReadingPreferences["provider"]); setVoice(""); }}><option value="system">Installed device voices</option><option value="neural">Natural neural voice service</option></select></label>
          {provider === "system" ? <label className="field-label">Installed voice<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="">System default</option>{systemVoices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name} · {item.lang}</option>)}</select><small>The sound and language depend on voices installed on this computer.</small></label> : <><label className="field-label">Neural voice<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="en-US-JennyNeural">Jenny · US English · Female</option><option value="en-US-GuyNeural">Guy · US English · Male</option><option value="en-GB-SoniaNeural">Sonia · UK English · Female</option><option value="en-GB-RyanNeural">Ryan · UK English · Male</option><option value="en-IN-NeerjaNeural">Neerja · Indian English · Female</option><option value="en-IN-PrabhatNeural">Prabhat · Indian English · Male</option></select></label><label className="field-label">ReadAloud service URL<input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://your-readaloud-service.example" autoComplete="url"/></label><label className="field-label">Service access token<input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Entered for this session only" autoComplete="off"/><small>The token stays in memory in this desktop window; it is not saved in the library.</small></label></>}
          <label className="toggle-row"><input type="checkbox" checked={effects} onChange={(event) => setEffects(event.target.checked)}/> Gentle interface sound effects</label>
          <div className="modal-actions"><button className="button quiet" onClick={() => { setProvider(DEFAULT_PREFERENCES.provider); setVoice(""); setRate(1); setVolume(0.8); }}>Reset defaults</button><button className="button primary" onClick={() => { setShowSettings(false); setNotice({ tone: "good", message: "Reading preferences applied for this session." }); }}>Save preferences</button></div>
          {provider === "neural" && <p className="security-note">Neural voice text is sent to your configured ReadAloud API, which forwards it to its configured speech provider. Do not enter an untrusted service URL.</p>}
        </section>
      </div>}
    </div>
  );
}
