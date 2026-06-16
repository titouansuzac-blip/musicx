// Bibliothèque : morceaux de démo génératifs + import de fichiers locaux.
// Chaque morceau de démo embarque une "recette" musicale jouée par le moteur
// Web Audio (player.js), pour fonctionner totalement hors-ligne sans assets.

import { putFile, getAllFiles, deleteFile } from "./db.js";

const PALETTE = {
  orange: "#ff5a36",
  purple: "#8b5cf6",
  blue: "#2f6bff",
  green: "#2fcf6b",
  yellow: "#ffc42e",
  pink: "#ff7ac6",
  red: "#ff3b3b",
};

// Gammes (demi-tons relatifs à la fondamentale)
const SCALES = {
  minorPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const DEMO_TRACKS = [
  {
    id: "demo-neon",
    title: "Neon Grid",
    artist: "pulse engine",
    album: "Pixel Dreams",
    color: PALETTE.orange,
    duration: 168,
    recipe: { root: 49, scale: "minorPent", bpm: 112, mood: "drive", wave: "sawtooth" },
  },
  {
    id: "demo-violet",
    title: "Violet Hours",
    artist: "pulse engine",
    album: "Pixel Dreams",
    color: PALETTE.purple,
    duration: 192,
    recipe: { root: 45, scale: "dorian", bpm: 92, mood: "dream", wave: "triangle" },
  },
  {
    id: "demo-cobalt",
    title: "Cobalt Run",
    artist: "pulse engine",
    album: "Synthwave Sketches",
    color: PALETTE.blue,
    duration: 150,
    recipe: { root: 52, scale: "minorPent", bpm: 128, mood: "drive", wave: "square" },
  },
  {
    id: "demo-lime",
    title: "Acid Lime",
    artist: "pulse engine",
    album: "Synthwave Sketches",
    color: PALETTE.green,
    duration: 176,
    recipe: { root: 50, scale: "lydian", bpm: 120, mood: "bounce", wave: "sawtooth" },
  },
  {
    id: "demo-gold",
    title: "Golden Static",
    artist: "pulse engine",
    album: "Pixel Dreams",
    color: PALETTE.yellow,
    duration: 158,
    recipe: { root: 48, scale: "major", bpm: 104, mood: "bounce", wave: "triangle" },
  },
  {
    id: "demo-rose",
    title: "Rose Machine",
    artist: "pulse engine",
    album: "Afterglow",
    color: PALETTE.pink,
    duration: 184,
    recipe: { root: 53, scale: "dorian", bpm: 100, mood: "dream", wave: "sine" },
  },
];

export const PLAYLISTS = [
  { id: "pl-focus", title: "Deep Focus", color: PALETTE.blue, trackIds: ["demo-violet", "demo-rose"] },
  { id: "pl-drive", title: "Night Drive", color: PALETTE.orange, trackIds: ["demo-neon", "demo-cobalt", "demo-lime"] },
  { id: "pl-all", title: "Tout pulse.", color: PALETTE.purple, trackIds: DEMO_TRACKS.map((t) => t.id) },
];

export function getScale(name) {
  return SCALES[name] || SCALES.minorPent;
}

// ---- Bibliothèque vivante (démo + fichiers importés) ----
let tracks = [...DEMO_TRACKS];
const listeners = new Set();

export function getTracks() { return tracks; }
export function getTrackById(id) { return tracks.find((t) => t.id === id) || null; }
export function onLibraryChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(tracks)); }

const PALETTE_VALUES = Object.values(PALETTE);
let importCounter = 0;

function makeFileTrack(rec) {
  return {
    id: rec.id,
    title: rec.title,
    artist: rec.artist,
    album: rec.album,
    color: rec.color,
    duration: rec.duration || 0, // affiné au chargement par <audio>
    file: true,
    url: URL.createObjectURL(rec.blob),
  };
}

const AUDIO_EXT = /\.(mp3|m4a|m4b|mp4|aac|wav|wave|aif|aiff|aifc|flac|caf|alac|oga|ogg|opus|wma|3gp)$/i;

// Vrai si le fichier est (probablement) audio. iOS laisse souvent file.type
// vide pour les fichiers venant de Fichiers/iCloud : on se rabat sur
// l'extension, et on accepte par défaut quand le type est inconnu.
function isAudioFile(file) {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("audio/")) return true;
  if (AUDIO_EXT.test(file.name)) return true;
  return t === "";
}

// Importe des fichiers : persiste le Blob en IndexedDB puis ajoute les pistes.
export async function importFiles(fileList) {
  const added = [];
  for (const file of fileList) {
    if (!isAudioFile(file)) continue;
    const i = importCounter++;
    const record = {
      id: `file-${Date.now()}-${i}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      artist: "Vos fichiers",
      album: "Importé",
      color: PALETTE_VALUES[i % PALETTE_VALUES.length],
      blob: file,
      duration: 0,
      addedAt: Date.now(),
    };
    try { await putFile(record); }
    catch (e) { console.warn("IndexedDB indisponible — fichier non persistant", e); }
    const track = makeFileTrack(record);
    tracks = [track, ...tracks];
    added.push(track);
  }
  if (added.length) emit();
  return added;
}

// Réhydrate les fichiers stockés au démarrage (recrée les URLs d'objet).
export async function loadStoredFiles() {
  let recs = [];
  try { recs = await getAllFiles(); }
  catch { return []; }
  if (!recs.length) return [];
  recs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  importCounter = Math.max(importCounter, recs.length);
  const stored = recs.map(makeFileTrack);
  tracks = [...stored, ...DEMO_TRACKS];
  emit();
  return stored;
}

// Supprime une piste importée (révoque l'URL + efface de la base).
export async function removeTrack(id) {
  const t = getTrackById(id);
  if (!t || !t.file) return;
  if (t.url) URL.revokeObjectURL(t.url);
  tracks = tracks.filter((x) => x.id !== id);
  try { await deleteFile(id); } catch {}
  emit();
}

// ---- Pochettes pixel-art générées (esthétique des références) ----
const coverCache = new Map();
export function generateCover(track, size = 256) {
  if (coverCache.has(track.id)) return coverCache.get(track.id);
  const cells = 8;
  const cell = size / cells;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  ctx.fillStyle = track.color;
  ctx.fillRect(0, 0, size, size);

  // Hash déterministe depuis l'id pour un motif stable
  let seed = 0;
  for (let i = 0; i < track.id.length; i++) seed = (seed * 31 + track.id.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const dark = "rgba(13,13,13,0.92)";
  const light = "rgba(244,241,233,0.9)";

  // Motif symétrique type "icône pixel" (smiley/œil des références)
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells / 2; x++) {
      if (rand() > 0.5) {
        ctx.fillStyle = rand() > 0.7 ? light : dark;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.fillRect((cells - 1 - x) * cell, y * cell, cell, cell);
      }
    }
  }

  // Cadre
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(2, size / 64);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);

  const url = c.toDataURL("image/png");
  coverCache.set(track.id, url);
  return url;
}
