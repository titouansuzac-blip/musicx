// Bootstrap : relie bibliothèque, moteur audio, visualiseur, UI et persistance.
import { Player } from "./player.js";
import { Visualizer } from "./visualizer.js";
import * as Lib from "./library.js";
import { loadState, saveState } from "./storage.js";
import * as UI from "./ui.js";
import { $, $$ } from "./ui.js";
import { showLaunch, setBeatSource } from "./launch.js";

const state = loadState();
const player = new Player();

// File d'attente : `queue` est l'ordre de lecture effectif (ids).
// `baseQueue` mémorise l'ordre avant mélange pour pouvoir le restaurer.
let queue = [];
let baseQueue = [];
let queueIndex = 0;
let shuffle = !!state.shuffle;
let repeat = state.repeat || "off"; // off | all | one
let searchQuery = "";
let queueOpen = false;

// ---- Visualiseurs (mini dock + vue Visualiseur + vue lecture) ----
let vizMini = null, vizFull = null, vizNp = null;

function initVisualizers() {
  try {
    vizMini = new Visualizer($("#visualizer-mini"), player, { style: state.vizStyle, accent: getAccent() });
    vizMini.start();
  } catch (e) { console.warn("Visualiseur mini indisponible", e); }
}

function ensureFullViz() {
  if (vizFull) return;
  try {
    vizFull = new Visualizer($("#visualizer-full"), player, { style: state.vizStyle, accent: getAccent() });
  } catch (e) { console.warn("Visualiseur plein écran indisponible", e); }
}

function ensureNpViz() {
  if (vizNp) return;
  try {
    vizNp = new Visualizer($("#np-visualizer"), player, { style: state.vizStyle, accent: getAccent() });
  } catch (e) { console.warn("Visualiseur lecture indisponible", e); }
}

function getAccent() {
  const t = player.track;
  return t ? t.color : "#ff5a36";
}

function applyAccent() {
  const hex = getAccent();
  UI.setAccent(hex);
  vizMini?.setAccent(hex);
  vizFull?.setAccent(hex);
  vizNp?.setAccent(hex);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", hex);
}

// ---- Vue lecture plein écran ----
let npOpen = false;
let npLastFocus = null;

function setBackgroundInert(on) {
  for (const sel of ["#sidebar", "#main", "#dock"]) {
    const el = $(sel);
    if (el) el.inert = on;
  }
}

function openNowPlaying() {
  if (!player.track) return;
  npLastFocus = document.activeElement;
  npOpen = true;
  const np = $("#nowplaying");
  np.hidden = false;
  void np.offsetWidth;
  np.classList.add("is-open");
  ensureNpViz();
  vizNp?.start();
  setBackgroundInert(true);
  $("#np-close").focus();
}
function closeNowPlaying() {
  npOpen = false;
  const np = $("#nowplaying");
  np.classList.remove("is-open");
  vizNp?.stop();
  setBackgroundInert(false);
  setTimeout(() => { if (!npOpen) np.hidden = true; }, 360);
  npLastFocus?.focus?.();
}

// ============================================================
// Lecture & file d'attente
// ============================================================
function currentId() { return queue[queueIndex]; }

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mélange `baseQueue` en gardant le morceau courant en tête.
function applyShuffle(keepId) {
  const rest = baseQueue.filter((id) => id !== keepId);
  shuffleInPlace(rest);
  queue = keepId != null && baseQueue.includes(keepId) ? [keepId, ...rest] : rest;
}

// Définit une nouvelle file à partir d'une liste, démarrant sur startId.
function setQueue(ids, startId) {
  baseQueue = ids.slice();
  queue = ids.slice();
  if (shuffle) applyShuffle(startId);
  queueIndex = Math.max(0, queue.indexOf(startId));
}

function playCurrent(launch) {
  const t = Lib.getTrackById(currentId());
  if (!t) return;
  player.load(t, { autoplay: true });
  applyAccent();
  refreshLibrary();
  updateMediaSession();
  renderQueuePanel();
  if (launch) showLaunch(t);
}

function playFromList(ids, startId, launch = true) {
  setQueue(ids, startId);
  playCurrent(launch);
}

// auto = enchaînement automatique (fin de morceau) ; sinon action manuelle.
function advance(auto, launch) {
  if (!queue.length) return;
  let i = queueIndex + 1;
  if (i >= queue.length) {
    if (repeat === "all" || !auto) i = 0; // les actions manuelles bouclent
    else { player.pause(); return; }      // fin de file en lecture auto
  }
  queueIndex = i;
  playCurrent(launch);
}

function next(launch = false) { advance(false, launch); }
function prev(launch = false) {
  if (player.getCurrentTime() > 3) { player.seek(0); return; }
  if (!queue.length) return;
  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  playCurrent(launch);
}

function toggleShuffle() {
  shuffle = !shuffle;
  const cur = currentId();
  if (shuffle) applyShuffle(cur);
  else queue = baseQueue.slice();
  queueIndex = Math.max(0, queue.indexOf(cur));
  saveState({ shuffle });
  UI.updateModes({ shuffle, repeat });
  renderQueuePanel();
}

function cycleRepeat() {
  repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
  saveState({ repeat });
  UI.updateModes({ shuffle, repeat });
}

// ---- Manipulation de la file depuis le panneau ----
function renderQueuePanel() {
  UI.renderQueue(queue, queueIndex, Lib.getTrackById, {
    onJump: (i) => { queueIndex = i; playCurrent(true); },
    onRemove: (i) => removeFromQueue(i),
    onReorder: (from, to) => reorderQueue(from, to),
  });
}

function removeFromQueue(i) {
  const cur = currentId();
  if (queue[i] === cur) return; // on ne retire pas le morceau en cours
  queue.splice(i, 1);
  queueIndex = queue.indexOf(cur);
  if (!shuffle) baseQueue = queue.slice();
  renderQueuePanel();
}

function reorderQueue(from, to) {
  const cur = currentId();
  const [id] = queue.splice(from, 1);
  queue.splice(to, 0, id);
  queueIndex = queue.indexOf(cur);
  if (!shuffle) baseQueue = queue.slice();
  renderQueuePanel();
}

// Garde la file cohérente après un changement de bibliothèque (suppression).
function syncQueueWithLibrary() {
  const ids = new Set(Lib.getTracks().map((t) => t.id));
  const cur = currentId();
  queue = queue.filter((id) => ids.has(id));
  baseQueue = baseQueue.filter((id) => ids.has(id));
  queueIndex = Math.max(0, queue.indexOf(cur));
  renderQueuePanel();
}

// ============================================================
// Rendu
// ============================================================
function visibleTracks() {
  const all = Lib.getTracks();
  if (!searchQuery) return all;
  const q = searchQuery.toLowerCase();
  return all.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
}

function refreshLibrary() {
  const list = visibleTracks();
  UI.renderLibrary(list, player.track?.id, (t) => {
    playFromList(list.map((x) => x.id), t.id, true);
  }, {
    total: Lib.getTracks().length,
    query: searchQuery,
    onRemove: (t) => handleRemove(t),
  });
}

async function handleRemove(track) {
  const wasCurrent = currentId() === track.id;
  if (wasCurrent) player.pause();
  await Lib.removeTrack(track.id); // émet -> syncQueueWithLibrary ajuste la file
  if (wasCurrent) {
    const nt = Lib.getTrackById(currentId());
    if (nt) { player.load(nt, { autoplay: false }); applyAccent(); }
  }
}

function refreshPlaylists() {
  UI.renderPlaylists(Lib.PLAYLISTS, (pl, tracks) => {
    if (!tracks.length) return;
    playFromList(pl.trackIds.slice(), pl.trackIds[0], true);
    UI.switchView("library");
    saveState({ view: "library" });
  });
}

// ============================================================
// Évènements moteur
// ============================================================
player.on("trackchange", (t) => {
  UI.setNowPlaying(t);
  applyAccent();
});
player.on("play", () => { UI.updatePlayButton(true); saveState({ trackId: player.track?.id }); navigator.mediaSession && (navigator.mediaSession.playbackState = "playing"); });
player.on("pause", () => { UI.updatePlayButton(false); navigator.mediaSession && (navigator.mediaSession.playbackState = "paused"); });
player.on("timeupdate", ({ time, duration }) => {
  UI.updateProgress(time, duration);
  saveState({ trackId: player.track?.id, time });
});
player.on("volume", (v) => { UI.updateVolume(v); saveState({ volume: v }); });
player.on("ended", () => {
  if (repeat === "one") { player.seek(0); player.play(); return; }
  if (state.autoplayNext) advance(true, false);
  else UI.updatePlayButton(false);
});

// ============================================================
// Media Session (lecture en arrière-plan / écran verrouillé)
// ============================================================
function updateMediaSession() {
  if (!("mediaSession" in navigator) || !player.track) return;
  const t = player.track;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.artist, album: t.album,
    artwork: [{ src: Lib.generateCover(t, 256), sizes: "256x256", type: "image/png" }],
  });
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => player.play());
  ms.setActionHandler("pause", () => player.pause());
  ms.setActionHandler("previoustrack", () => prev(true));
  ms.setActionHandler("nexttrack", () => next(true));
  ms.setActionHandler("seekto", (d) => d.seekTime != null && player.seek(d.seekTime));
}

// ============================================================
// Contrôles UI
// ============================================================
function bindControls() {
  $("#btn-play").addEventListener("click", () => player.toggle());
  $("#btn-next").addEventListener("click", () => next(true));
  $("#btn-prev").addEventListener("click", () => prev(true));
  $("#btn-shuffle").addEventListener("click", toggleShuffle);
  $("#btn-repeat").addEventListener("click", cycleRepeat);

  // File d'attente
  $("#btn-queue").addEventListener("click", () => toggleQueue());
  $("#queue-close").addEventListener("click", () => toggleQueue(false));
  $("#queue-scrim").addEventListener("click", () => toggleQueue(false));

  // Vue lecture plein écran
  $(".dock__meta").addEventListener("click", openNowPlaying);
  $("#np-close").addEventListener("click", closeNowPlaying);
  $("#np-play").addEventListener("click", () => player.toggle());
  $("#np-next").addEventListener("click", () => next(true));
  $("#np-prev").addEventListener("click", () => prev(true));
  $("#np-shuffle").addEventListener("click", toggleShuffle);
  $("#np-repeat").addEventListener("click", cycleRepeat);
  $("#np-queue").addEventListener("click", () => toggleQueue());

  // Recherche
  const search = $("#search");
  search.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    $("#search-clear").hidden = !searchQuery;
    refreshLibrary();
  });
  $("#search-clear").addEventListener("click", () => {
    search.value = ""; searchQuery = ""; $("#search-clear").hidden = true;
    refreshLibrary(); search.focus();
  });

  // Barre de progression (clic + glissé + clavier)
  const progressPct = () => { const d = player.getDuration(); return d ? player.getCurrentTime() / d : 0; };
  bindScrubber($("#progress-bar"), (pct) => player.seek(pct * player.getDuration()), progressPct);
  bindScrubber($("#np-progress-bar"), (pct) => player.seek(pct * player.getDuration()), progressPct);
  // Volume (clic + glissé + clavier)
  bindScrubber($("#volume-bar"), (pct) => player.setVolume(pct), () => player.volume);
  $("#btn-mute").addEventListener("click", () => {
    player.setVolume(player.volume > 0 ? 0 : 0.8);
  });

  // Navigation
  $$(".nav__item").forEach((btn) =>
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      UI.switchView(view);
      saveState({ view });
      closeSidebar();
      if (view === "visual") { ensureFullViz(); vizFull?.start(); }
      else vizFull?.stop();
    })
  );

  // Menu mobile
  $("#menu-toggle").addEventListener("click", () => {
    const open = $("#sidebar").classList.toggle("is-open");
    $("#scrim").classList.toggle("is-open", open);
  });
  $("#scrim").addEventListener("click", closeSidebar);

  // Import de fichiers (bouton)
  $("#file-input").addEventListener("change", async (e) => {
    await addFiles(e.target.files);
    e.target.value = "";
  });

  // Import par glisser-déposer
  bindDropzone();

  // Paramètres
  $("#viz-style").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const style = b.dataset.style;
    $$("#viz-style button").forEach((x) => x.classList.toggle("is-active", x === b));
    vizMini?.setStyle(style); vizFull?.setStyle(style); vizNp?.setStyle(style);
    saveState({ vizStyle: style });
  });
  $("#autoplay-next").addEventListener("change", (e) => { state.autoplayNext = e.target.checked; saveState({ autoplayNext: e.target.checked }); });
  $("#bg-pixels").addEventListener("change", (e) => { state.bgPixels = e.target.checked; saveState({ bgPixels: e.target.checked }); });

  // Raccourcis clavier
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); player.toggle(); }
    if (e.code === "ArrowRight") next(true);
    if (e.code === "ArrowLeft") prev(true);
    if (e.code === "Escape") { if (npOpen) closeNowPlaying(); else if (queueOpen) toggleQueue(false); }
  });
}

function bindScrubber(el, onChange, getPct) {
  const handle = (e) => {
    const rect = el.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    onChange(Math.max(0, Math.min(1, x / rect.width)));
  };
  let dragging = false;
  el.addEventListener("mousedown", (e) => { dragging = true; handle(e); });
  window.addEventListener("mousemove", (e) => dragging && handle(e));
  window.addEventListener("mouseup", () => (dragging = false));
  el.addEventListener("touchstart", (e) => { handle(e); }, { passive: true });
  el.addEventListener("touchmove", (e) => handle(e), { passive: true });

  // Clavier (rôle slider) : flèches, Page↑/↓, Début/Fin.
  if (getPct) {
    el.addEventListener("keydown", (e) => {
      let p = getPct();
      switch (e.key) {
        case "ArrowRight": case "ArrowUp": p += 0.05; break;
        case "ArrowLeft": case "ArrowDown": p -= 0.05; break;
        case "PageUp": p += 0.1; break;
        case "PageDown": p -= 0.1; break;
        case "Home": p = 0; break;
        case "End": p = 1; break;
        default: return;
      }
      e.preventDefault();
      onChange(Math.max(0, Math.min(1, p)));
    });
  }
}

function closeSidebar() {
  $("#sidebar").classList.remove("is-open");
  $("#scrim").classList.remove("is-open");
}

function toggleQueue(force) {
  queueOpen = force === undefined ? !queueOpen : force;
  $("#queue-panel").classList.toggle("is-open", queueOpen);
  $("#queue-scrim").classList.toggle("is-open", queueOpen);
  $("#btn-queue").classList.toggle("is-on", queueOpen);
  if (queueOpen) renderQueuePanel();
}

async function addFiles(fileList) {
  const added = await Lib.importFiles(fileList);
  if (added.length) {
    playFromList(Lib.getTracks().map((t) => t.id), added[0].id, true);
  }
  return added;
}

function bindDropzone() {
  const dz = $("#dropzone");
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth++; dz.classList.add("is-active");
  });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) dz.classList.remove("is-active");
  });
  window.addEventListener("drop", async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    depth = 0; dz.classList.remove("is-active");
    await addFiles(e.dataTransfer.files);
  });
}

// ============================================================
// Init
// ============================================================
function restore() {
  player.setVolume(state.volume);
  UI.updateVolume(state.volume);
  UI.updateModes({ shuffle, repeat });
  if (state.vizStyle) {
    $$("#viz-style button").forEach((b) => b.classList.toggle("is-active", b.dataset.style === state.vizStyle));
  }
  $("#autoplay-next").checked = state.autoplayNext;
  $("#bg-pixels").checked = state.bgPixels;

  // File initiale = bibliothèque complète
  const all = Lib.getTracks().map((t) => t.id);
  const saved = state.trackId ? Lib.getTrackById(state.trackId) : null;
  const first = saved || Lib.getTracks()[0];
  setQueue(all, first ? first.id : null);

  if (first) {
    // chargé en pause, reprise possible à la position sauvegardée
    player.load(first, { autoplay: false, startTime: saved ? state.time : 0 });
    applyAccent();
    UI.updateProgress(saved ? state.time : 0, first.duration);
  }
  renderQueuePanel();
  UI.switchView(state.view || "library");
  if (state.view === "visual") { ensureFullViz(); vizFull?.start(); }
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// Bouton d'installation : apparaît quand le navigateur propose l'installation.
let deferredPrompt = null;
function setupInstall() {
  const btn = $("#install-btn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    btn.hidden = true;
    deferredPrompt = null;
  });
}

async function main() {
  initVisualizers();
  bindControls();
  setupMediaSession();
  setBeatSource(() => player.getBands().bass); // pulsation du lancement
  await Lib.loadStoredFiles().catch(() => {});
  refreshLibrary();
  refreshPlaylists();
  Lib.onLibraryChange(() => {
    refreshLibrary();
    refreshPlaylists();
    syncQueueWithLibrary();
  });
  restore();
  registerSW();
  setupInstall();
}

main();
