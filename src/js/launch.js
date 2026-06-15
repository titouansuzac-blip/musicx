// Animation de lancement plein écran (inspirée de la vidéo) : grille en
// perspective + disque noir + typographie géante qui pulse en alternant les
// mots du titre, puis se rétracte vers la lecture. Non bloquant : l'audio
// démarre dessous et l'overlay se referme tout seul.
// Les mots pulsent au rythme (basses) et le texte s'ajuste au disque.

let el, discEl, wordEl, captionEl;
let timers = [];
let beatFn = null;     // () => niveau de basses 0..1
let raf = null;

function ensureDom() {
  if (el) return;
  el = document.createElement("div");
  el.className = "launch";
  el.hidden = true;
  el.innerHTML = `
    <div class="launch__disc">
      <div class="launch__sparks"><span>✦</span><span>✦</span><span>✦</span><span>✦</span></div>
      <div class="launch__word"></div>
      <div class="launch__caption"></div>
    </div>
    <div class="launch__mark">pulse.</div>`;
  document.body.appendChild(el);
  discEl = el.querySelector(".launch__disc");
  wordEl = el.querySelector(".launch__word");
  captionEl = el.querySelector(".launch__caption");
  el.addEventListener("click", hide); // taper pour passer
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

// Ajuste la taille du texte pour qu'il tienne dans le disque.
function fitWord() {
  wordEl.style.fontSize = "";
  const maxW = discEl.clientWidth * 0.84;
  const w = wordEl.scrollWidth;
  if (w > maxW) {
    const cur = parseFloat(getComputedStyle(wordEl).fontSize);
    wordEl.style.fontSize = `${Math.max(28, cur * (maxW / w))}px`;
  }
}

function setWord(w) {
  wordEl.textContent = w;
  fitWord();
  wordEl.animate(
    [
      { opacity: 0, transform: "scaleY(1.18) scale(.55) translateY(18px)" },
      { opacity: 1, transform: "scaleY(1.18) scale(1) translateY(0)" },
    ],
    { duration: 260, easing: "cubic-bezier(.2,.95,.25,1)", fill: "backwards" }
  );
}

// Pulsation du disque et du texte au rythme des basses.
function startPulse() {
  cancelAnimationFrame(raf);
  const tick = () => {
    const bass = beatFn ? beatFn() : 0;
    wordEl.style.setProperty("--beat", (1 + bass * 0.18).toFixed(3));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function hide() {
  clearTimers();
  cancelAnimationFrame(raf);
  if (!el) return;
  el.classList.add("is-off");
  el.classList.remove("is-on");
  timers.push(setTimeout(() => {
    el.hidden = true;
    el.classList.remove("is-off");
  }, 420));
}

// Fournit la source du "beat" (niveau de basses) une fois pour toutes.
export function setBeatSource(fn) { beatFn = fn; }

// Affiche l'animation pour un morceau. Retourne immédiatement.
export function showLaunch(track) {
  if (!track) return;
  ensureDom();
  clearTimers();

  el.style.setProperty("--accent", track.color);
  let words = track.title.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 1) words = [words[0], words[0]]; // pulse en 2 temps
  captionEl.textContent = `${track.artist} — ${track.album}`.toUpperCase();

  el.hidden = false;
  el.classList.remove("is-off");
  void el.offsetWidth; // reflow pour relancer les transitions
  el.classList.add("is-on");
  startPulse();

  const startDelay = 280; // après l'apparition du disque
  const per = 460;
  words.forEach((w, i) => {
    timers.push(setTimeout(() => setWord(w), startDelay + i * per));
  });
  const end = startDelay + words.length * per + 260;
  timers.push(setTimeout(hide, end));
}
