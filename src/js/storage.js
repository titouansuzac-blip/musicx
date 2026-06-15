// Persistance légère de l'état du lecteur (localStorage).
const KEY = "pulse.state.v1";

const DEFAULTS = {
  trackId: null,
  time: 0,
  volume: 0.8,
  view: "library",
  vizStyle: "bars",
  autoplayNext: true,
  bgPixels: true,
  shuffle: false,
  repeat: "off", // off | all | one
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

let cache = null;
let lastWrite = 0;
let trailing = null;

function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  lastWrite = Date.now();
}

// Throttle "leading + trailing" : écrit immédiatement si >500ms depuis la
// dernière écriture, sinon programme une écriture différée. Garantit une
// sauvegarde périodique même pendant un flux continu de timeupdate.
export function saveState(patch) {
  cache = { ...(cache || loadState()), ...patch };
  const now = Date.now();
  if (now - lastWrite >= 500) {
    flush();
  } else if (!trailing) {
    trailing = setTimeout(() => { trailing = null; flush(); }, 500 - (now - lastWrite));
  }
  return cache;
}
