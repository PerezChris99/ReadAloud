import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import {
  DEFAULT_PREFERENCES, sentenceToPageIndex, type BookRecord, type ReadingPreferences,
} from "@readaloud/reader-core";
import { indexMobileDocument } from "./src/documents";
import type { DocumentApiSettings } from "./src/documents";
import { listBooks, saveBook, deleteBook, updateReadingPosition } from "./src/storage";
import { colors } from "./src/theme";

type Screen = "home" | "library" | "reader" | "settings" | "about" | "privacy" | "terms";
type Voice = { identifier: string; name: string; language: string; quality?: string; gender?: string };

function buildChimeWav(): Uint8Array {
  const sampleRate = 22_050;
  const sampleCount = Math.floor(sampleRate * 0.18);
  const dataBytes = sampleCount * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46464952, true); // RIFF
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, 0x45564157, true); // WAVE
  view.setUint32(12, 0x20746d66, true); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); // data
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const position = i / sampleRate;
    const frequency = position < 0.085 ? 660 : 880;
    const localPosition = position < 0.085 ? position : position - 0.085;
    const envelope = Math.min(1, localPosition / 0.012) * Math.max(0, 1 - position / 0.18);
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * position) * 1600 * envelope);
    view.setInt16(44 + i * 2, sample, true);
  }
  return bytes;
}

let chimeFile: File | null = null;

function feedback(enabled: boolean): void {
  if (!enabled) return;
  void Haptics.selectionAsync().catch(() => undefined);
  try {
    if (!chimeFile) chimeFile = new File(Paths.cache, "readaloud-ui-chime.wav");
    if (!chimeFile.exists) {
      chimeFile.create({ overwrite: true });
      chimeFile.write(buildChimeWav());
    }
    const player = createAudioPlayer(chimeFile.uri);
    player.volume = 0.12;
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.didJustFinish) return;
      subscription.remove();
      try { player.remove(); } catch { /* a UI sound must never block reading */ }
    });
    player.play();
  } catch {
    // UI audio is best-effort; haptics and reading controls remain usable.
  }
}
function displayFormat(book: BookRecord): string {
  return book.format.toUpperCase() === "IMAGE" ? "OCR scan" : book.format.toUpperCase();
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexLabel, setIndexLabel] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentSentence, setCurrentSentence] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [provider, setProvider] = useState<ReadingPreferences["provider"]>(DEFAULT_PREFERENCES.provider);
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [soundEffects, setSoundEffects] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [fontScale, setFontScale] = useState(1);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const runId = useRef(0);
  const shouldContinue = useRef(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const cachedAudioRef = useRef<File | null>(null);
  const selected = books.find((book) => book.id === selectedId) ?? books[0] ?? null;
  const activeSentence = selected?.sentences[currentSentence] ?? "";
  const pageIndex = selected ? sentenceToPageIndex(selected.sentences, selected.pagePreviews, currentSentence) : 0;
  const pagePreview = selected?.pagePreviews[pageIndex] ?? "";
  const api: DocumentApiSettings = useMemo(() => ({ baseUrl: apiBaseUrl.trim(), token: apiToken }), [apiBaseUrl, apiToken]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {
      // If the platform rejects the audio session, foreground playback remains available.
    });
    let cancelled = false;
    (async () => {
      try {
        const [items, url, token, savedVoice, savedProvider, savedRate, savedVolume, savedEffects, savedCaptions, savedScale] = await Promise.all([
          listBooks(),
          SecureStore.getItemAsync("readaloud.api.url"),
          SecureStore.getItemAsync("readaloud.api.token"),
          SecureStore.getItemAsync("readaloud.voice"),
          SecureStore.getItemAsync("readaloud.provider"),
          SecureStore.getItemAsync("readaloud.rate"),
          SecureStore.getItemAsync("readaloud.volume"),
          SecureStore.getItemAsync("readaloud.soundEffects"),
          SecureStore.getItemAsync("readaloud.captionsEnabled"),
          SecureStore.getItemAsync("readaloud.fontScale"),
        ]);
        if (cancelled) return;
        setBooks(items);
        setSelectedId(items[0]?.id ?? null);
        setCurrentSentence(items[0]?.lastSentenceIndex ?? 0);
        setApiBaseUrl(url ?? "");
        setApiToken(token ?? "");
        setVoice(savedVoice ?? "");
        setProvider(savedProvider === "neural" ? "neural" : "system");
        const restoredRate = Number(savedRate ?? "1");
        const restoredVolume = Number(savedVolume ?? "0.8");
        const restoredScale = Number(savedScale ?? "1");
        setRate(Number.isFinite(restoredRate) ? Math.max(0.7, Math.min(1.35, restoredRate)) : 1);
        setVolume(Number.isFinite(restoredVolume) ? Math.max(0, Math.min(1, restoredVolume)) : 0.8);
        setSoundEffects(savedEffects !== "false");
        setCaptionsEnabled(savedCaptions !== "false");
        setFontScale(Number.isFinite(restoredScale) ? Math.max(0.9, Math.min(1.3, restoredScale)) : 1);
        const available = await Speech.getAvailableVoicesAsync();
        if (!cancelled) setVoices(available as Voice[]);
      } catch {
        if (!cancelled) setError("The local library could not be opened. Restart the app and try again.");
      }
    })();
    return () => {
      cancelled = true;
      runId.current += 1;
      shouldContinue.current = false;
      void Speech.stop();
      try { playerRef.current?.pause(); playerRef.current?.remove(); } catch { /* native player may already be released */ }
    };
  }, []);

  const stop = useCallback(async (reset = false) => {
    runId.current += 1;
    shouldContinue.current = false;
    await Speech.stop().catch(() => undefined);
    try {
      playerRef.current?.setActiveForLockScreen(false);
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch { /* ignore already released player */ }
    playerRef.current = null;
    const oldFile = cachedAudioRef.current;
    cachedAudioRef.current = null;
    if (oldFile) { try { oldFile.delete(); } catch { /* cache cleanup must not block controls */ } }
    setPlaying(false);
    setPaused(false);
    if (reset) setCurrentSentence(0);
    feedback(soundEffects);
  }, [soundEffects]);

  const playSentence = useCallback(async (book: BookRecord, index: number, token: number): Promise<void> => {
    if (token !== runId.current || !shouldContinue.current) return;
    if (index < 0 || index >= book.sentences.length) {
      setPlaying(false); setPaused(false); shouldContinue.current = false; return;
    }
    const sentence = book.sentences[index] ?? "";
    setCurrentSentence(index);
    await updateReadingPosition(book.id, index);
    if (token !== runId.current || !shouldContinue.current) return;

    if (provider === "neural") {
      if (!api.baseUrl) throw new Error("Natural neural voices need a configured ReadAloud service. Add the service URL in Settings.");
      const response = await fetch(api.baseUrl.replace(/\/+$/, "") + "/v1/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(api.token ? { "X-ReadAloud-Token": api.token } : {}) },
        body: JSON.stringify({ text: sentence, voice: voice || "en-US-JennyNeural", rate, volume }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail || "The neural voice service could not generate speech.");
      }
      const audioBytes = new Uint8Array(await response.arrayBuffer());
      if (token !== runId.current || !shouldContinue.current) return;
      const file = new File(Paths.cache, "readaloud-" + token + "-" + index + ".mp3");
      file.create({ overwrite: true });
      file.write(audioBytes);
      cachedAudioRef.current = file;
      const audioPlayer = createAudioPlayer(file.uri);
      playerRef.current = audioPlayer;
      audioPlayer.setActiveForLockScreen(true, {
        title: book.title,
        artist: "ReadAloud",
        albumTitle: "Your listening library",
      });
      const subscription = audioPlayer.addListener("playbackStatusUpdate", (status) => {
        if (!status.didJustFinish) return;
        subscription.remove();
        try {
          audioPlayer.setActiveForLockScreen(false);
          audioPlayer.remove();
        } catch { /* already released */ }
        if (playerRef.current === audioPlayer) playerRef.current = null;
        const cached = cachedAudioRef.current;
        cachedAudioRef.current = null;
        if (cached) { try { cached.delete(); } catch { /* cleanup only */ } }
        if (shouldContinue.current && token === runId.current) void playSentence(book, index + 1, token).catch(handlePlaybackError);
        else { setPlaying(false); setPaused(false); }
      });
      audioPlayer.volume = volume;
      audioPlayer.play();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      Speech.speak(sentence, {
        voice: voice || undefined,
        rate,
        onDone: () => {
          if (token === runId.current && shouldContinue.current) void playSentence(book, index + 1, token).then(resolve).catch(reject);
          else resolve();
        },
        onStopped: resolve,
        onError: (reason) => reject(new Error(typeof reason === "string" ? reason : "System speech failed.")),
      });
    });
  }, [provider, api, voice, rate, volume]);

  const handlePlaybackError = (reason: unknown) => {
    shouldContinue.current = false;
    setPlaying(false);
    setPaused(false);
    setError(reason instanceof Error ? reason.message : "Speech playback stopped unexpectedly.");
  };

  const start = useCallback(async (fromIndex?: number) => {
    if (!selected || !selected.sentences.length) return;
    const token = runId.current + 1;
    runId.current = token;
    shouldContinue.current = true;
    setPlaying(true);
    setPaused(false);
    setError("");
    feedback(soundEffects);
    const startAt = fromIndex ?? currentSentence;
    try {
      await playSentence(selected, startAt >= selected.sentences.length ? 0 : startAt, token);
    } catch (reason) {
      if (token === runId.current) handlePlaybackError(reason);
    }
  }, [selected, currentSentence, playSentence, soundEffects]);

  const togglePlay = useCallback(async () => {
    if (!selected) return;
    if (playing && !paused) {
      setPlaying(false);
      setPaused(true);
      if (provider === "neural") playerRef.current?.pause();
      else if (Platform.OS === "android") await Speech.stop().catch(() => undefined);
      else await Speech.pause().catch(() => undefined);
      feedback(soundEffects);
      return;
    }
    if (paused) {
      setPlaying(true);
      setPaused(false);
      if (provider === "neural" && playerRef.current) playerRef.current.play();
      else if (provider === "system" && Platform.OS !== "android") await Speech.resume().catch(() => undefined);
      else await start(currentSentence);
      return;
    }
    await start(currentSentence);
  }, [selected, playing, paused, provider, soundEffects, start, currentSentence]);

  const move = useCallback(async (delta: number) => {
    if (!selected) return;
    await stop();
    const target = Math.max(0, Math.min(selected.sentences.length - 1, currentSentence + delta));
    setCurrentSentence(target);
    await updateReadingPosition(selected.id, target);
  }, [selected, currentSentence, stop]);

  async function importDocument(): Promise<void> {
    setError("");
    setSuccess("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", multiple: false, copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setBusy(true); setIndexProgress(1); setIndexLabel("Preparing import");
      const book = await indexMobileDocument(asset.uri, asset.name, asset.size ?? 0, api, (progress, label) => {
        setIndexProgress(progress); setIndexLabel(label);
      });
      await saveBook(book);
      const latest = await listBooks();
      setBooks(latest); setSelectedId(book.id); setCurrentSentence(0); setScreen("reader");
      setIndexProgress(100); setIndexLabel("Book ready to read");
      setSuccess("“" + book.title + "” is indexed and ready to read.");
      feedback(soundEffects);
    } catch (reason) {
      setSuccess("");
      setError(reason instanceof Error ? reason.message : "The selected document could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  async function selectBook(book: BookRecord): Promise<void> {
    await stop();
    setSelectedId(book.id);
    setCurrentSentence(book.lastSentenceIndex);
    setScreen("reader");
    feedback(soundEffects);
  }

  async function removeSelected(): Promise<void> {
    if (!selected) return;
    Alert.alert("Remove this book?", "This removes its local reading index, not the original file.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        void (async () => {
          await stop();
          await deleteBook(selected.id);
          const remaining = await listBooks();
          setBooks(remaining); setSelectedId(remaining[0]?.id ?? null); setCurrentSentence(0);
          setScreen("library");
        })();
      } },
    ]);
  }

  async function saveSettings(): Promise<void> {
    try {
      if (apiBaseUrl.trim()) {
        const parsed = new URL(apiBaseUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("The service URL must use HTTP or HTTPS.");
        if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname)) {
          throw new Error("Use HTTPS for non-local services.");
        }
      }
      await Promise.all([
        SecureStore.setItemAsync("readaloud.api.url", apiBaseUrl.trim().replace(/\/+$/, "")),
        SecureStore.setItemAsync("readaloud.api.token", apiToken),
        SecureStore.setItemAsync("readaloud.voice", voice),
        SecureStore.setItemAsync("readaloud.provider", provider),
        SecureStore.setItemAsync("readaloud.rate", String(rate)),
        SecureStore.setItemAsync("readaloud.volume", String(volume)),
        SecureStore.setItemAsync("readaloud.soundEffects", String(soundEffects)),
        SecureStore.setItemAsync("readaloud.captionsEnabled", String(captionsEnabled)),
        SecureStore.setItemAsync("readaloud.fontScale", String(fontScale)),
      ]);
      setError("");
      setScreen("settings");
      Alert.alert("Settings saved", "Service credentials are stored in the platform secure store.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be saved.");
    }
  }

  const pageText = useMemo(() => pagePreview, [pagePreview]);
  const voiceList = voices.filter((item) => item.language.toLowerCase().startsWith("en")).slice(0, 12);

  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable style={styles.brand} onPress={() => { setScreen("home"); feedback(soundEffects); }}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>ra</Text></View>
        <View><Text style={styles.brandName}>readaloud</Text><Text style={styles.brandTag}>LISTEN DEEPLY</Text></View>
      </Pressable>
      <Pressable style={styles.avatarButton} onPress={() => setScreen("settings")}><Text style={styles.avatarText}>☼</Text></Pressable>
    </View>
  );

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {([{ id: "home", label: "Home", glyph: "⌂" }, { id: "library", label: "Library", glyph: "▤" }, { id: "reader", label: "Player", glyph: "♫" }, { id: "settings", label: "Settings", glyph: "⚙" }] as const).map((tab) => (
        <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: screen === tab.id }} style={[styles.tab, screen === tab.id && styles.tabActive]} onPress={() => { if (tab.id === "reader" && !selected) { setScreen("library"); return; } setScreen(tab.id); feedback(soundEffects); }}>
          <Text style={[styles.tabGlyph, screen === tab.id && styles.tabGlyphActive]}>{tab.glyph}</Text><Text style={[styles.tabLabel, screen === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const renderBookCard = (book: BookRecord) => (
    <Pressable key={book.id} style={styles.bookCard} onPress={() => void selectBook(book)}>
      <View style={[styles.bookCover, book.format === "epub" ? styles.coverYellow : book.format === "pdf" ? styles.coverBlue : styles.coverSmoke]}>
        <Text style={styles.bookCoverText}>{book.format.toUpperCase().slice(0, 3)}</Text>
      </View>
      <View style={styles.bookInfo}><Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookMeta}>{displayFormat(book)} · {book.sentences.length.toLocaleString()} sentences</Text><View style={styles.smallProgress}><View style={[styles.smallProgressFill, { width: Math.round(((book.lastSentenceIndex + 1) / Math.max(1, book.sentences.length)) * 100) + "%" }]} /></View><Text style={styles.bookMeta}>{Math.round(((book.lastSentenceIndex + 1) / Math.max(1, book.sentences.length)) * 100)}% listened</Text></View>
      <Text style={styles.cardArrow}>›</Text>
    </Pressable>
  );

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroOrbOne}/><View style={styles.heroOrbTwo}/>
        <Text style={styles.eyebrow}>A LITTLE MORE STORY IN YOUR DAY</Text>
        <Text style={styles.heroTitle}>Turn reading time{"\n"}into listening time.</Text>
        <Text style={styles.heroCopy}>Your books. Your pace. A calmer way to get lost in the words.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void importDocument()} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink}/> : <Text style={styles.primaryButtonText}>＋  Import a book</Text>}
        </Pressable>
        <Text style={styles.supported}>PDF · EPUB · Word · Text · HTML · Markdown · Images/OCR</Text>
      </View>
      {busy && <View style={styles.indexCard}><View style={styles.indexRow}><ActivityIndicator color={colors.skyDeep}/><View style={styles.indexCopy}><Text style={styles.indexTitle}>Getting your book ready</Text><Text style={styles.indexSub}>{indexLabel}</Text></View><Text style={styles.indexPercent}>{indexProgress}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: indexProgress + "%" }]}/></View></View>}
      {success ? <Pressable style={styles.successBox} onPress={() => setSuccess("")}><Text style={styles.successText}>{success}  ×</Text></Pressable> : null}
      {error ? <Pressable style={styles.errorBox} onPress={() => setError("")}><Text style={styles.errorText}>{error}  ×</Text></Pressable> : null}
      <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Pick up where you left off</Text><Text style={styles.sectionSub}>Your library stays on this device.</Text></View><Pressable onPress={() => setScreen("library")}><Text style={styles.link}>View library →</Text></Pressable></View>
      {books.slice(0, 2).map(renderBookCard)}
      {books.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyIcon}>✧</Text><Text style={styles.emptyTitle}>A story is waiting for you.</Text><Text style={styles.emptyCopy}>Import a book to build your private listening library.</Text></View>}
      <View style={styles.featureStrip}><View style={styles.featureIcon}><Text>♫</Text></View><View style={styles.featureText}><Text style={styles.featureTitle}>Made for long-form listening</Text><Text style={styles.featureCopy}>Page previews and captions follow the sentence being read. Choose a system voice or connect an optional neural voice service.</Text></View></View>
      <View style={styles.linksRow}><Pressable onPress={() => setScreen("about")}><Text style={styles.link}>About ReadAloud</Text></Pressable><Pressable onPress={() => setScreen("privacy")}><Text style={styles.link}>Privacy</Text></Pressable><Pressable onPress={() => setScreen("terms")}><Text style={styles.link}>Terms</Text></Pressable></View>
    </ScrollView>
  );

  const renderLibrary = () => (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <View style={styles.pageHeading}><Text style={styles.eyebrow}>YOUR READING SHELF</Text><Text style={styles.screenTitle}>Your library</Text><Text style={styles.pageDescription}>Your indexed books are ready to listen to, even after you leave this screen.</Text></View>
      <Pressable style={styles.importOutline} onPress={() => void importDocument()}><Text style={styles.importOutlineText}>＋  Import document or book</Text></Pressable>
      {busy && <View style={styles.indexCard}><View style={styles.indexRow}><ActivityIndicator color={colors.skyDeep}/><View style={styles.indexCopy}><Text style={styles.indexTitle}>Indexing your document</Text><Text style={styles.indexSub}>{indexLabel}</Text></View><Text style={styles.indexPercent}>{indexProgress}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: indexProgress + "%" }]}/></View></View>}
      {success ? <Pressable style={styles.successBox} onPress={() => setSuccess("")}><Text style={styles.successText}>{success}  ×</Text></Pressable> : null}
      {error ? <Pressable style={styles.errorBox} onPress={() => setError("")}><Text style={styles.errorText}>{error}  ×</Text></Pressable> : null}
      {books.map(renderBookCard)}
      {books.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Your shelf is still quiet.</Text><Text style={styles.emptyCopy}>Import PDF, EPUB, DOCX, text, HTML, Markdown, RTF or a scanned image.</Text></View>}
    </ScrollView>
  );

  const renderReader = () => !selected ? (
    <View style={styles.screenContent}><Text style={styles.screenTitle}>No book selected</Text><Pressable style={styles.primaryButton} onPress={() => void importDocument()}><Text style={styles.primaryButtonText}>Import a book</Text></Pressable></View>
  ) : (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <View style={styles.readerHeader}><View style={styles.readerTitleArea}><Text style={styles.eyebrow}>NOW READING</Text><Text style={styles.screenTitle}>{selected.title}</Text><Text style={styles.pageDescription}>{displayFormat(selected)} · {selected.totalCharacters.toLocaleString()} characters</Text></View><Pressable onPress={() => void removeSelected()}><Text style={styles.deleteText}>Remove</Text></Pressable></View>
      <View style={styles.paperCard}>
        <View style={styles.paperTopline}><Text style={styles.paperLabel}>PAGE PREVIEW</Text><Text style={styles.paperPage}>PAGE {pageIndex + 1} / {Math.max(1, selected.pagePreviews.length)}</Text></View>
        <View style={styles.paperInner}><Text style={styles.paperBookTitle}>{selected.title}</Text><Text style={[styles.paperText, { fontSize: 14 * fontScale }]} numberOfLines={18}>{pageText}</Text><Text style={styles.paperNumber}>{String(pageIndex + 1).padStart(2, "0")}</Text></View>
      </View>
      <View style={styles.captionCard} accessibilityLiveRegion="polite">
        <Text style={styles.captionLabel}>{captionsEnabled ? "FOLLOW ALONG" : "CAPTIONS OFF"}</Text>
        {captionsEnabled ? <Text style={styles.captionText}>{activeSentence || "Press play to begin listening."}</Text> : <Text style={styles.captionOff}>Enable captions in Settings to follow each sentence.</Text>}
        <View style={styles.captionFooter}><View style={[styles.statusDot, playing && styles.statusDotActive]}/><Text style={styles.captionStatus}>{playing ? "Reading aloud" : paused ? "Paused" : "Ready when you are"}</Text><Text style={styles.captionCount}>{Math.min(currentSentence + 1, selected.sentences.length)} / {selected.sentences.length}</Text></View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: (Math.round(((currentSentence + 1) / Math.max(1, selected.sentences.length)) * 100)) + "%" }]}/></View>
      <View style={styles.progressTextRow}><Text style={styles.bookMeta}>{Math.round(((currentSentence + 1) / Math.max(1, selected.sentences.length)) * 100)}% through the book</Text><Text style={styles.bookMeta}>{Math.max(0, selected.sentences.length - currentSentence - 1)} sentences left</Text></View>
      <View style={styles.transport}>
        <Pressable accessibilityLabel="Previous sentence" style={styles.skipButton} onPress={() => void move(-1)} disabled={currentSentence <= 0}><Text style={styles.skipGlyph}>⏮</Text><Text style={styles.skipLabel}>BACK</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} style={styles.playButton} onPress={() => void togglePlay()}><Text style={styles.playGlyph}>{playing ? "Ⅱ" : "▶"}</Text></Pressable>
        <Pressable accessibilityLabel="Next sentence" style={styles.skipButton} onPress={() => void move(1)} disabled={currentSentence >= selected.sentences.length - 1}><Text style={styles.skipGlyph}>⏭</Text><Text style={styles.skipLabel}>NEXT</Text></Pressable>
      </View>
      <View style={styles.readerSettingsRow}><Text style={styles.bookMeta}>Voice: {provider === "neural" ? (voice || "Jenny Neural") : (voices.find((item) => item.identifier === voice)?.name || "System voice")}</Text><Pressable onPress={() => setScreen("settings")}><Text style={styles.link}>Adjust settings →</Text></Pressable></View>
      {success ? <Pressable style={styles.successBox} onPress={() => setSuccess("")}><Text style={styles.successText}>{success}  ×</Text></Pressable> : null}
      {error ? <Pressable style={styles.errorBox} onPress={() => setError("")}><Text style={styles.errorText}>{error}  ×</Text></Pressable> : null}
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.pageHeading}><Text style={styles.eyebrow}>MAKE IT YOURS</Text><Text style={styles.screenTitle}>Reader settings</Text><Text style={styles.pageDescription}>Choose the voice, reading pace and interaction style that feels right.</Text></View>
      <View style={styles.settingsCard}>
        <Text style={styles.formLabel}>VOICE SOURCE</Text>
        <View style={styles.segmentRow}><Pressable style={[styles.segment, provider === "system" && styles.segmentActive]} onPress={() => setProvider("system")}><Text style={[styles.segmentText, provider === "system" && styles.segmentTextActive]}>Device voice</Text></Pressable><Pressable style={[styles.segment, provider === "neural" && styles.segmentActive]} onPress={() => setProvider("neural")}><Text style={[styles.segmentText, provider === "neural" && styles.segmentTextActive]}>Neural voice</Text></Pressable></View>
        {provider === "system" ? <>
          <Text style={styles.formLabel}>INSTALLED ENGLISH VOICES</Text>
          {voiceList.length === 0 ? <Text style={styles.formHint}>Voice availability depends on Android/iOS and installed language packs. The system default remains available.</Text> : voiceList.map((item) => <Pressable key={item.identifier} style={[styles.voiceOption, voice === item.identifier && styles.voiceOptionSelected]} onPress={() => setVoice(item.identifier)}><View style={styles.voiceAvatar}><Text>{(item.gender || "").toLowerCase().includes("female") ? "♀" : (item.gender || "").toLowerCase().includes("male") ? "♂" : "♫"}</Text></View><View style={styles.voiceInfo}><Text style={styles.voiceName}>{item.name}</Text><Text style={styles.formHint}>{item.language} · {item.quality || "System voice"}</Text></View><Text style={styles.voiceRadio}>{voice === item.identifier ? "●" : "○"}</Text></Pressable>)}
          <Text style={styles.formHint}>Installed system voices vary in naturalness. Neural voices sound more expressive but require your configured service and an internet connection.</Text>
        </> : <>
          <Text style={styles.formLabel}>NEURAL VOICE</Text>
          {([{id:"en-US-JennyNeural",name:"Jenny",detail:"US English · Female"},{id:"en-US-GuyNeural",name:"Guy",detail:"US English · Male"},{id:"en-GB-SoniaNeural",name:"Sonia",detail:"UK English · Female"},{id:"en-GB-RyanNeural",name:"Ryan",detail:"UK English · Male"},{id:"en-IN-NeerjaNeural",name:"Neerja",detail:"Indian English · Female"},{id:"en-IN-PrabhatNeural",name:"Prabhat",detail:"Indian English · Male"}]).map((option) => <Pressable key={option.id} style={[styles.voiceOption, voice === option.id && styles.voiceOptionSelected]} onPress={() => setVoice(option.id)}><View style={styles.voiceAvatar}><Text>{option.detail.includes("Female") ? "♀" : "♂"}</Text></View><View style={styles.voiceInfo}><Text style={styles.voiceName}>{option.name}</Text><Text style={styles.formHint}>{option.detail}</Text></View><Text style={styles.voiceRadio}>{voice === option.id ? "●" : "○"}</Text></Pressable>)}
          <Text style={styles.formLabel}>READALOUD SERVICE URL</Text><TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.field} value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="https://your-service.example"/>
          <Text style={styles.formLabel}>SERVICE ACCESS TOKEN</Text><TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.field} value={apiToken} onChangeText={setApiToken} placeholder="Provided by your service administrator"/>
          <Text style={styles.formHint}>Do not enter credentials for a service you do not trust. Sentence text is sent to this server and then to its configured voice provider.</Text>
        </>}
        <Text style={styles.formLabel}>READING SPEED · {rate.toFixed(1)}×</Text>
        <View style={styles.segmentRow}>{[0.8,1,1.15,1.3].map((value) => <Pressable key={value} style={[styles.rateOption, rate === value && styles.segmentActive]} onPress={() => setRate(value)}><Text style={[styles.segmentText, rate === value && styles.segmentTextActive]}>{value.toFixed(1)}×</Text></Pressable>)}</View>
        <Text style={styles.formLabel}>VOLUME · {Math.round(volume * 100)}%</Text><View style={styles.segmentRow}>{[0.3,0.55,0.8,1].map((value) => <Pressable key={value} style={[styles.rateOption, volume === value && styles.segmentActive]} onPress={() => setVolume(value)}><Text style={[styles.segmentText, volume === value && styles.segmentTextActive]}>{Math.round(value * 100)}%</Text></Pressable>)}</View>
        <Text style={styles.formLabel}>TEXT SIZE</Text><View style={styles.segmentRow}>{[0.9,1,1.15,1.3].map((value) => <Pressable key={value} style={[styles.rateOption, fontScale === value && styles.segmentActive]} onPress={() => setFontScale(value)}><Text style={[styles.segmentText, fontScale === value && styles.segmentTextActive]}>{value === 0.9 ? "Small" : value === 1 ? "Normal" : value === 1.15 ? "Large" : "XL"}</Text></Pressable>)}</View>
        <View style={styles.preferenceToggle}><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Sentence captions</Text><Text style={styles.formHint}>Show the sentence currently being read.</Text></View><Switch value={captionsEnabled} onValueChange={setCaptionsEnabled} trackColor={{ false: colors.line, true: colors.sky }} thumbColor={colors.surface}/></View>
        <View style={styles.preferenceToggle}><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Sound and haptic feedback</Text><Text style={styles.formHint}>Gentle feedback for player actions.</Text></View><Switch value={soundEffects} onValueChange={setSoundEffects} trackColor={{ false: colors.line, true: colors.sky }} thumbColor={colors.surface}/></View>
        <Pressable style={styles.primaryButton} onPress={() => void saveSettings()}><Text style={styles.primaryButtonText}>Save settings securely</Text></Pressable>
      </View>
    </ScrollView>
  );

  const renderStaticPage = (title: string, eyebrow: string, paragraphs: string[]) => (
    <ScrollView contentContainerStyle={styles.screenContent}><View style={styles.pageHeading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.screenTitle}>{title}</Text></View><View style={styles.legalCard}>{paragraphs.map((paragraph, index) => <Text key={index} style={styles.legalParagraph}>{paragraph}</Text>)}<Pressable style={styles.importOutline} onPress={() => setScreen("home")}><Text style={styles.importOutlineText}>Back to home</Text></Pressable></View></ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background}/>
      {renderHeader()}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {screen === "home" && renderHome()}
        {screen === "library" && renderLibrary()}
        {screen === "reader" && renderReader()}
        {screen === "settings" && renderSettings()}
        {screen === "about" && renderStaticPage("A little more story in your day.", "WHY READALOUD EXISTS", [
          "ReadAloud is being built to make novels, books, reports and long documents easier to enjoy through listening. It pairs a calm reading player with page previews and sentence-by-sentence captions so readers can stay oriented as the voice moves through a book.",
          "The product is created by PerezChris99. The goal is to make long-form reading more accessible, comfortable and flexible across desktop and mobile devices, while keeping a reader's personal library private by default.",
          "ReadAloud is in active development. Voice quality depends on installed device voices or a configured neural speech provider. Some document formats use the optional extraction service."
        ])}
        {screen === "privacy" && renderStaticPage("Privacy at ReadAloud", "LEGAL · PRIVACY", [
          "ReadAloud stores the indexed text of imported books and the reading position in local application storage on this device. The original document is not deleted or modified by importing it.",
          "Most supported text formats are indexed locally. On mobile, PDF extraction and image OCR use the configured ReadAloud API because the native client does not contain an on-device PDF/OCR engine. A document is not sent to that service unless you configure a service endpoint and import a format that requires it.",
          "If neural voice mode is enabled, the sentence currently being read is sent to the configured ReadAloud API, which forwards it to its configured speech provider. The API is designed not to retain uploaded document content or generated audio. Your service operator and its provider may process data under their own terms.",
          "The app does not currently require an account and the client does not implement advertising analytics. Deleting a book removes its local extracted text and saved reading index. Cloud backup or cross-device synchronisation is not currently provided.",
          "Before public release, the publisher must add a monitored legal/support contact and have this notice reviewed for the jurisdictions and third-party providers actually used."
        ])}
        {screen === "terms" && renderStaticPage("Terms of use", "LEGAL · TERMS", [
          "Use ReadAloud only with documents you own or are authorised to access and process. You remain responsible for copyright, licensing, and any restrictions imposed by a document's owner.",
          "ReadAloud is provided as an in-development application. Document extraction, optical character recognition, installed voices and third-party neural voice providers can make mistakes or be unavailable. Do not rely on generated speech as the authoritative version of a legal, medical, financial, academic or safety-critical document.",
          "Neural speech and remote extraction require a service endpoint and may incur third-party charges. The operator must configure authentication, rate limits, provider billing protections and privacy terms before offering that service publicly.",
          "The publisher should add a legal/support contact, governing-law provisions, commercial-use terms, and appropriate liability language after qualified legal review before public distribution."
        ])}
      </KeyboardAvoidingView>
      {renderTabBar()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.background },
  brand: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: colors.ink, fontSize: 21, fontWeight: "900", letterSpacing: -3, marginRight: 3 },
  brandName: { color: colors.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.7 },
  brandTag: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: 1 },
  avatarButton: { width: 37, height: 37, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, color: "#B28E12" },
  screenContent: { paddingHorizontal: 18, paddingBottom: 26, gap: 14 },
  hero: { position: "relative", overflow: "hidden", backgroundColor: "#FFF9DF", borderColor: "#F0E4AE", borderWidth: 1, borderRadius: 24, paddingHorizontal: 23, paddingVertical: 26, gap: 13 },
  heroOrbOne: { position: "absolute", width: 190, height: 190, borderRadius: 100, right: -75, top: -83, backgroundColor: "#F4CF4F55" },
  heroOrbTwo: { position: "absolute", width: 145, height: 145, borderRadius: 80, right: 30, bottom: -105, backgroundColor: "#8ECDE955" },
  eyebrow: { color: "#90824D", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: colors.ink, fontSize: 31, lineHeight: 37, fontWeight: "900", letterSpacing: -1.1 },
  heroCopy: { color: colors.secondary, fontSize: 13, lineHeight: 20, maxWidth: 310 },
  primaryButton: { backgroundColor: colors.yellow, paddingHorizontal: 17, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", minWidth: 165, marginTop: 2 },
  primaryButtonText: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  supported: { fontSize: 9, lineHeight: 15, color: "#948A61" },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 10, marginBottom: 1 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSub: { color: colors.muted, fontSize: 10, marginTop: 4 },
  link: { color: colors.skyDeep, fontSize: 11, fontWeight: "800" },
  bookCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  bookCover: { width: 47, height: 63, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  coverYellow: { backgroundColor: colors.yellowSoft }, coverBlue: { backgroundColor: "#DFF4FC" }, coverSmoke: { backgroundColor: "#EDF0F4" },
  bookCoverText: { fontSize: 11, fontWeight: "900", color: colors.secondary },
  bookInfo: { flex: 1, gap: 4 },
  bookTitle: { color: colors.ink, fontWeight: "800", fontSize: 12, lineHeight: 17 },
  bookMeta: { color: colors.muted, fontSize: 9 },
  smallProgress: { height: 3, backgroundColor: "#EDF0F3", borderRadius: 3, overflow: "hidden", marginTop: 2 },
  smallProgressFill: { height: 3, backgroundColor: colors.skyDeep },
  cardArrow: { color: "#A6B0BA", fontSize: 24, paddingHorizontal: 3 },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 24, alignItems: "center", gap: 9 },
  emptyIcon: { fontSize: 28, color: "#C4A52C" }, emptyTitle: { fontWeight: "800", color: colors.ink, fontSize: 14 }, emptyCopy: { fontSize: 11, lineHeight: 17, textAlign: "center", color: colors.secondary },
  featureStrip: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#D8EFF8", backgroundColor: "#F0FAFE", flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 4 },
  featureIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#D8F2FC", alignItems: "center", justifyContent: "center" }, featureText: { flex: 1, gap: 5 }, featureTitle: { fontWeight: "800", color: colors.ink, fontSize: 12 }, featureCopy: { fontSize: 10, lineHeight: 16, color: colors.secondary },
  linksRow: { flexDirection: "row", justifyContent: "center", gap: 22, paddingVertical: 10 },
  tabBar: { flexDirection: "row", gap: 4, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 5 : 8, paddingHorizontal: 10 },
  tab: { flex: 1, alignItems: "center", gap: 2, borderRadius: 12, paddingVertical: 6 }, tabActive: { backgroundColor: colors.yellowSoft }, tabGlyph: { fontSize: 18, color: "#8290A1" }, tabGlyphActive: { color: "#79641C" }, tabLabel: { fontSize: 9, color: colors.muted, fontWeight: "600" }, tabLabelActive: { color: "#6A581D", fontWeight: "900" },
  indexCard: { padding: 13, borderRadius: 14, borderWidth: 1, borderColor: "#E9E1BD", backgroundColor: colors.surface, gap: 11 },
  indexRow: { flexDirection: "row", alignItems: "center", gap: 10 }, indexCopy: { flex: 1, gap: 3 }, indexTitle: { color: colors.ink, fontWeight: "800", fontSize: 11 }, indexSub: { color: colors.muted, fontSize: 9 }, indexPercent: { color: "#88701F", fontWeight: "800", fontSize: 11 },
  progressTrack: { height: 5, borderRadius: 5, overflow: "hidden", backgroundColor: "#EDF0F3" }, progressFill: { height: 5, backgroundColor: colors.skyDeep },
  errorBox: { backgroundColor: "#FFF2F2", borderColor: "#EFCFCF", borderWidth: 1, borderRadius: 12, padding: 12 }, errorText: { color: colors.red, fontSize: 11, lineHeight: 17 },
  successBox: { backgroundColor: "#EAF8F0", borderColor: "#C7E8D4", borderWidth: 1, borderRadius: 12, padding: 12 }, successText: { color: colors.green, fontSize: 11, lineHeight: 17 },
  pageHeading: { paddingTop: 8, gap: 8 }, screenTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, fontWeight: "900" }, pageDescription: { color: colors.secondary, fontSize: 11, lineHeight: 17 },
  importOutline: { borderWidth: 1, borderColor: "#D7EAF2", backgroundColor: "#F5FCFF", borderRadius: 12, padding: 14, alignItems: "center" }, importOutlineText: { color: colors.skyDeep, fontSize: 11, fontWeight: "800" },
  readerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, readerTitleArea: { flex: 1, gap: 6 }, deleteText: { color: colors.red, fontSize: 11, fontWeight: "700", paddingTop: 4 },
  paperCard: { backgroundColor: colors.surface, borderRadius: 17, padding: 13, borderWidth: 1, borderColor: colors.line, gap: 12 },
  paperTopline: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, paperLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, paperPage: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  paperInner: { backgroundColor: colors.paper, borderWidth: 1, borderColor: "#EEE9DD", padding: 20, minHeight: 260, borderRadius: 8 }, paperBookTitle: { color: "#B0AA9C", fontSize: 9, fontWeight: "800", letterSpacing: 1, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F0ECE3" }, paperText: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", color: "#53524B", lineHeight: 24, marginTop: 15 }, paperNumber: { color: "#B6B0A3", fontSize: 9, textAlign: "right", marginTop: 12 },
  captionCard: { backgroundColor: colors.skySoft, borderColor: "#DCEFF8", borderWidth: 1, borderRadius: 17, padding: 18, gap: 10 }, captionLabel: { color: colors.skyDeep, fontWeight: "900", letterSpacing: 1.3, fontSize: 9 }, captionText: { fontSize: 20, fontWeight: "800", lineHeight: 29, color: "#314C61" }, captionOff: { color: colors.secondary, fontSize: 11, lineHeight: 18 },
  captionFooter: { flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: "#D8EBF3", paddingTop: 10 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#A8B8C3" }, statusDotActive: { backgroundColor: colors.green }, captionStatus: { fontSize: 9, color: colors.secondary, flex: 1 }, captionCount: { color: colors.secondary, fontSize: 9, fontWeight: "700" },
  progressTextRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32, paddingVertical: 4 }, skipButton: { alignItems: "center", gap: 4, padding: 5 }, skipGlyph: { color: "#75879A", fontSize: 24 }, skipLabel: { color: colors.muted, fontWeight: "900", fontSize: 8, letterSpacing: 1 }, playButton: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center", shadowColor: colors.yellow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 11, elevation: 3 }, playGlyph: { fontSize: 25, color: "#54451B", fontWeight: "900" },
  readerSettingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  settingsCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 11 }, formLabel: { fontSize: 9, color: colors.muted, fontWeight: "900", letterSpacing: 1.1, marginTop: 6 }, segmentRow: { flexDirection: "row", gap: 7 }, segment: { flex: 1, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, borderRadius: 10, alignItems: "center" }, segmentActive: { borderColor: "#E5D27B", backgroundColor: colors.yellowSoft }, segmentText: { color: colors.secondary, fontSize: 10, fontWeight: "700" }, segmentTextActive: { color: "#77621A" }, rateOption: { flex: 1, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  voiceOption: { flexDirection: "row", gap: 10, alignItems: "center", borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 10 }, voiceOptionSelected: { borderColor: colors.sky, backgroundColor: "#F2FAFE" }, voiceAvatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.skySoft, alignItems: "center", justifyContent: "center" }, voiceInfo: { flex: 1, gap: 3 }, voiceName: { color: colors.ink, fontWeight: "800", fontSize: 11 }, voiceRadio: { color: colors.skyDeep, fontSize: 15 }, formHint: { fontSize: 9, lineHeight: 15, color: colors.muted }, field: { backgroundColor: "#FBFCFD", borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 12, color: colors.ink },
  preferenceToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#F0F2F4", paddingTop: 12, marginTop: 2 }, preferenceCopy: { flex: 1, gap: 4 }, preferenceTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  legalCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 18, gap: 15 }, legalParagraph: { fontSize: 12, lineHeight: 21, color: colors.secondary },
});
