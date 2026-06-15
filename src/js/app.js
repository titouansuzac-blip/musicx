// Bootstrap : relie bibliothèque, moteur audio, visualiseur, UI et persistance.
import { Player } from "./player.js";
import { Visualizer } from "./visualizer.js";
import * as Lib from "./library.js";
import { loadState, saveState } from "./storage.js";
import * as UI from "./ui.js";
import { $, $$ } from "./ui.js";
import { showLaunch } from "./launch.js";

const state = loadState();
const player = new Player();

// File d'attente courante
let queue = Lib.getTracks().map((t) => t.id);
let queueIndex = 0;

// ---- Visualiseurs (mini dans le dock + plein écran) ----
let vizMini = null, vizFull = null;

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

function getAccent() {
  const t = player.track;
  return t ? t.color : "#ff5a36";
}

function applyAccent() {
  const hex = getAccent();
  UI.setAccent(hex);
  vizMini?.setAccent(hex);
  vizFull?.setAccent(hex);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", hex);
}

// ============================================================
// Lecture
// ============================================================
function playTrack(track, { autoplay = true, startTime = 0, launch = false } = {}) {
  queueIndex = Math.max(0, queue.indexOf(track.id));
  player.load(track, { autoplay, startTime });
  applyAccent();
  refreshLibrary();
  updateMediaSession();
  if (launch) showLaunch(track);
}

function playByIndex(i, launch = false) {
  if (!queue.length) return;
  queueIndex = (i + queue.length) % queue.length;
  const t = Lib.getTrackById(queue[queueIndex]);
  if (t) playTrack(t, { launch });
}

function next(launch = false) { playByIndex(queueIndex + 1, launch); }
function prev(launch = false) {
  if (player.getCurrentTime() > 3) { player.seek(0); return; }
  playByIndex(queueIndex - 1, launch);
}

// ============================================================
// Rendu
// ============================================================
function refreshLibrary() {
  UI.renderLibrary(Lib.getTracks(), player.track?.id, (t) => {
    queue = Lib.getTracks().map((x) => x.id);
    playTrack(t, { launch: true });
  });
}

function refreshPlaylists() {
  UI.renderPlaylists(Lib.PLAYLISTS, (pl, tracks) => {
    if (!tracks.length) return;
    queue = pl.trackIds.slice();
    playTrack(tracks[0], { launch: true });
    UI.switchView("library");
    state.view = "library"; saveState({ view: "library" });
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
  if (state.autoplayNext) next();
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

  // Barre de progression (clic + glissé)
  bindScrubber($("#progress-bar"), (pct) => player.seek(pct * player.getDuration()));
  // Volume
  bindScrubber($("#volume-bar"), (pct) => player.setVolume(pct));
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

  // Import de fichiers
  $("#file-input").addEventListener("change", (e) => {
    const added = Lib.importFiles(e.target.files);
    if (added.length) {
      queue = Lib.getTracks().map((t) => t.id);
      playTrack(added[0], { launch: true });
    }
    e.target.value = "";
  });

  // Paramètres
  $("#viz-style").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const style = b.dataset.style;
    $$("#viz-style button").forEach((x) => x.classList.toggle("is-active", x === b));
    vizMini?.setStyle(style); vizFull?.setStyle(style);
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
  });
}

function bindScrubber(el, onChange) {
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
}

function closeSidebar() {
  $("#sidebar").classList.remove("is-open");
  $("#scrim").classList.remove("is-open");
}

// ============================================================
// Init
// ============================================================
function restore() {
  player.setVolume(state.volume);
  UI.updateVolume(state.volume);
  if (state.vizStyle) {
    $$("#viz-style button").forEach((b) => b.classList.toggle("is-active", b.dataset.style === state.vizStyle));
  }
  $("#autoplay-next").checked = state.autoplayNext;
  $("#bg-pixels").checked = state.bgPixels;

  const t = state.trackId ? Lib.getTrackById(state.trackId) : null;
  const first = t || Lib.getTracks()[0];
  if (first) {
    queueIndex = queue.indexOf(first.id);
    // chargé en pause, reprise possible à la position sauvegardée
    player.load(first, { autoplay: false, startTime: t ? state.time : 0 });
    applyAccent();
    UI.updateProgress(t ? state.time : 0, first.duration);
  }
  UI.switchView(state.view || "library");
  if (state.view === "visual") { ensureFullViz(); vizFull?.start(); }
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function main() {
  initVisualizers();
  bindControls();
  setupMediaSession();
  refreshLibrary();
  refreshPlaylists();
  Lib.onLibraryChange(() => { refreshLibrary(); refreshPlaylists(); });
  restore();
  registerSW();
}

main();
