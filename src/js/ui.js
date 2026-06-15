// Rendu DOM : grilles, dock, navigation. Pas de logique audio ici.
import { generateCover, getTrackById } from "./library.js";

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export function formatTime(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function setAccent(hex) {
  document.documentElement.style.setProperty("--accent", hex);
}

export function renderLibrary(tracks, currentId, onPlay) {
  const grid = $("#library-grid");
  $("#track-count").textContent = `${tracks.length} morceau${tracks.length > 1 ? "x" : ""}`;
  if (!tracks.length) {
    grid.innerHTML = `<div class="empty">Aucun morceau. Ajoutez des fichiers audio via le bouton +.</div>`;
    return;
  }
  grid.innerHTML = "";
  for (const t of tracks) {
    const card = document.createElement("button");
    card.className = "card" + (t.id === currentId ? " is-playing" : "");
    card.style.setProperty("--card-bg", t.color);
    card.innerHTML = `
      <img class="card__cover" src="${generateCover(t)}" alt="" draggable="false" />
      <div class="card__title">${escapeHtml(t.title)}</div>
      <div class="card__artist">${escapeHtml(t.artist)}</div>
      <span class="card__badge">▶</span>`;
    card.addEventListener("click", () => onPlay(t));
    grid.appendChild(card);
  }
}

export function renderPlaylists(playlists, onOpen) {
  const grid = $("#playlists-grid");
  grid.innerHTML = "";
  for (const pl of playlists) {
    const tracks = pl.trackIds.map(getTrackById).filter(Boolean);
    const card = document.createElement("button");
    card.className = "card";
    card.style.setProperty("--card-bg", pl.color);
    const covers = tracks.slice(0, 4).map((t) => `<img src="${generateCover(t, 96)}" alt="" style="width:50%;aspect-ratio:1;border:1px solid #0d0d0d;image-rendering:pixelated"/>`).join("");
    card.innerHTML = `
      <div class="card__cover" style="display:flex;flex-wrap:wrap;padding:0;overflow:hidden">${covers}</div>
      <div class="card__title">${escapeHtml(pl.title)}</div>
      <div class="card__artist">${tracks.length} morceaux</div>`;
    card.addEventListener("click", () => onOpen(pl, tracks));
    grid.appendChild(card);
  }
}

export function setNowPlaying(track) {
  $("#dock-title").textContent = track ? track.title : "Aucun morceau";
  $("#dock-artist").textContent = track ? track.artist : "—";
  const cover = $("#dock-cover");
  if (track) cover.style.backgroundImage = `url(${generateCover(track)})`;
}

export function updatePlayButton(isPlaying) {
  $("#btn-play").dataset.ico = isPlaying ? "pause" : "play";
}

export function updateProgress(time, duration) {
  const pct = duration ? (time / duration) * 100 : 0;
  $("#progress-fill").style.width = pct + "%";
  $("#progress-knob").style.left = pct + "%";
  $("#time-current").textContent = formatTime(time);
  $("#time-total").textContent = formatTime(duration);
}

export function updateVolume(v) {
  $("#volume-fill").style.width = v * 100 + "%";
  $("#btn-mute").dataset.ico = v === 0 ? "vol-mute" : "vol";
}

export function switchView(view) {
  const titles = {
    library: ["Bibliothèque", "Votre univers sonore"],
    playlists: ["Playlists", "Sélections prêtes à l'emploi"],
    visual: ["Visualiseur", "Le son devient pixels"],
    settings: ["Paramètres", "Personnalisez pulse."],
  };
  $$(".view").forEach((v) => v.classList.remove("is-active"));
  $(`#view-${view}`)?.classList.add("is-active");
  $$(".nav__item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
  const [title, sub] = titles[view] || titles.library;
  $("#view-title").textContent = title;
  $("#view-sub").textContent = sub;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
