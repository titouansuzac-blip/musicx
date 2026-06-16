// Moteur audio. Deux modes :
//  - "gen"  : séquenceur Web Audio génératif (morceaux de démo, hors-ligne).
//             Passe par un AnalyserNode -> visualiseur réactif au son.
//  - "file" : <audio> joué EN DIRECT (hors Web Audio). Indispensable sur iOS :
//             dès qu'un flux passe par le Web Audio, le système le suspend
//             quand l'écran se verrouille. En jouant l'élément <audio> en
//             natif, la lecture continue en veille (+ contrôles Media Session).
//             Le visualiseur est alors décoratif (spectre de synthèse).

import { getScale } from "./library.js";

const BIN_COUNT = 64; // = fftSize 128 / 2

export class Player {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.freqData = new Uint8Array(BIN_COUNT);

    this.track = null;
    this.mode = "gen";
    this.isPlaying = false;
    this.volume = 0.8;

    // file mode
    this.audioEl = null;
    this._pendingSeek = 0;

    // gen mode
    this._gen = null;
    this._raf = null;

    this._listeners = {};
  }

  // --- mini event emitter ---
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return this; }
  emit(evt, payload) { this._listeners[evt]?.forEach((fn) => fn(payload)); }

  // Élément <audio> pour les fichiers importés. NON connecté au Web Audio :
  // joue en natif pour survivre à la mise en veille (iOS).
  _ensureEl() {
    if (this.audioEl) return;
    this.audioEl = new Audio();
    this.audioEl.preload = "auto";
    this.audioEl.volume = this.volume;
    this.audioEl.addEventListener("ended", () => this.emit("ended"));
    this.audioEl.addEventListener("loadedmetadata", () => {
      if (this.track) this.track.duration = this.audioEl.duration || this.track.duration;
      if (this._pendingSeek) {
        try { this.audioEl.currentTime = this._pendingSeek; } catch {}
        this._pendingSeek = 0;
      }
      this.emit("trackchange", this.track);
    });
  }

  // Contexte Web Audio : créé uniquement pour le séquenceur génératif.
  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  getFrequencyData() {
    if (this.mode === "file") { this._fillDecorative(); return this.freqData; }
    if (!this.analyser) return this.freqData; // que des zéros tant que pas de ctx
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  // Spectre de synthèse pour les fichiers (pas d'analyse possible hors Web Audio).
  // Anime tant que ça joue, retombe doucement en pause.
  _fillDecorative() {
    const d = this.freqData;
    const n = d.length;
    if (!this.isPlaying) {
      for (let i = 0; i < n; i++) d[i] = Math.max(0, d[i] - 12);
      return;
    }
    const t = this.audioEl?.currentTime || 0;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const env = Math.pow(1 - f, 1.3); // plus d'énergie dans les graves
      const w = Math.sin(t * (2 + i * 0.25) + i * 0.7) * Math.sin(t * 1.7 + i * 0.13);
      const v = env * (0.35 + 0.65 * Math.abs(w));
      d[i] = Math.max(0, Math.min(255, v * 230));
    }
  }

  getLevel() {
    const d = this.getFrequencyData();
    if (!d) return 0;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    return sum / d.length / 255;
  }

  // Énergie par bande : graves / médiums / aigus (0..1) + niveau global.
  getBands() {
    const d = this.getFrequencyData();
    if (!d) return { bass: 0, mid: 0, treble: 0, level: 0 };
    const n = d.length;
    const avg = (a, b) => {
      let s = 0;
      for (let i = a; i < b; i++) s += d[i];
      return (s / Math.max(1, b - a)) / 255;
    };
    return {
      bass: avg(0, Math.max(1, Math.floor(n * 0.12))),
      mid: avg(Math.floor(n * 0.12), Math.floor(n * 0.45)),
      treble: avg(Math.floor(n * 0.45), n),
      level: avg(0, n),
    };
  }

  async load(track, { autoplay = false, startTime = 0 } = {}) {
    this._stopGen();
    this.track = track;
    this.mode = track.file ? "file" : "gen";

    if (this.mode === "file") {
      this._ensureEl();
      this._pendingSeek = startTime || 0;
      this.audioEl.src = track.url;
      this.audioEl.load();
    } else {
      this._ensureCtx();
      this._gen = this._buildGen(track, startTime || 0);
    }

    this.emit("trackchange", track);
    if (autoplay) await this.play();
    else this.emit("pause");
  }

  async play() {
    if (!this.track) return;

    if (this.mode === "file") {
      this._ensureEl();
      await this.audioEl.play();
    } else {
      this._ensureCtx();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      const g = this._gen;
      g.ctxStart = this.ctx.currentTime;
      g.nextNoteTime = this.ctx.currentTime + 0.05;
      g.step = Math.round((g.offset / (60 / g.bpm / 4))) % 64;
      this._genTimer = setInterval(() => this._scheduler(), 25);
    }
    this.isPlaying = true;
    this.emit("play");
    this._startRaf();
  }

  pause() {
    if (this.mode === "file") {
      this.audioEl?.pause();
    } else if (this._gen) {
      this._gen.offset = this.getCurrentTime();
      clearInterval(this._genTimer);
      this._genTimer = null;
      this._silenceGen();
    }
    this.isPlaying = false;
    this.emit("pause");
    this._stopRaf();
  }

  toggle() { this.isPlaying ? this.pause() : this.play(); }

  seek(time) {
    const dur = this.getDuration();
    const t = Math.max(0, Math.min(time, dur));
    if (this.mode === "file") {
      this.audioEl.currentTime = t;
    } else if (this._gen) {
      this._gen.offset = t;
      if (this.isPlaying) {
        this._gen.ctxStart = this.ctx.currentTime;
        this._gen.step = Math.round(t / (60 / this._gen.bpm / 4)) % 64;
      }
    }
    this.emit("timeupdate", { time: t, duration: dur });
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audioEl) this.audioEl.volume = this.volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    this.emit("volume", this.volume);
  }

  getCurrentTime() {
    if (this.mode === "file") return this.audioEl?.currentTime || 0;
    if (!this._gen) return 0;
    if (this.isPlaying) return this._gen.offset + (this.ctx.currentTime - this._gen.ctxStart);
    return this._gen.offset;
  }

  getDuration() {
    if (this.mode === "file") return this.audioEl?.duration || this.track?.duration || 0;
    return this.track?.duration || 0;
  }

  // ---- rAF position loop ----
  _startRaf() {
    cancelAnimationFrame(this._raf);
    const tick = () => {
      const time = this.getCurrentTime();
      const dur = this.getDuration();
      this.emit("timeupdate", { time, duration: dur });
      if (this.mode === "gen" && dur && time >= dur) {
        this.pause();
        this.emit("ended");
        return;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  _stopRaf() { cancelAnimationFrame(this._raf); }

  // ============================================================
  // Séquenceur génératif
  // ============================================================
  _buildGen(track, offset) {
    const r = track.recipe;
    return {
      bpm: r.bpm,
      scale: getScale(r.scale),
      root: r.root,
      mood: r.mood,
      wave: track.recipe.wave || "sawtooth",
      offset,
      ctxStart: 0,
      nextNoteTime: 0,
      step: 0,
      noise: this._noiseBuffer(),
      voices: new Set(),
    };
  }

  _stopGen() {
    if (this._genTimer) { clearInterval(this._genTimer); this._genTimer = null; }
    this._silenceGen();
    this._gen = null;
  }

  _silenceGen() {
    if (!this._gen) return;
    this._gen.voices.forEach((v) => { try { v.stop(); } catch {} });
    this._gen.voices.clear();
  }

  _noiseBuffer() {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  _scheduler() {
    const g = this._gen;
    if (!g) return;
    const stepDur = 60 / g.bpm / 4; // double-croche
    while (g.nextNoteTime < this.ctx.currentTime + 0.1) {
      this._scheduleStep(g.step, g.nextNoteTime, stepDur);
      g.nextNoteTime += stepDur;
      g.step = (g.step + 1) % 64;
    }
  }

  _scheduleStep(step, time, stepDur) {
    const g = this._gen;
    const beat = step % 16;
    const bar = Math.floor(step / 16);

    // Kick : temps forts
    if (beat % 4 === 0) this._drum(time, "kick");
    // Hat : contretemps
    if (g.mood !== "dream" && beat % 2 === 1) this._drum(time, "hat", 0.12);

    // Basse : début de chaque temps
    if (beat % 4 === 0) {
      const deg = [0, 0, 3, 4][bar % 4];
      const note = g.root - 12 + g.scale[deg % g.scale.length];
      this._synth(this.midiToFreq(note), time, stepDur * 4, { wave: "square", gain: 0.32, cut: 700 });
    }

    // Arpège : pattern selon l'humeur
    const arpEvery = g.mood === "drive" ? 1 : g.mood === "bounce" ? 2 : 4;
    if (step % arpEvery === 0) {
      const idx = (Math.floor(step / arpEvery) * 2) % g.scale.length;
      const oct = 12 * (1 + ((Math.floor(step / 8)) % 2));
      const note = g.root + oct + g.scale[idx];
      this._synth(this.midiToFreq(note), time, stepDur * (arpEvery * 0.9), {
        wave: g.wave, gain: 0.16, cut: 2400,
      });
    }

    // Nappe d'accord : chaque mesure
    if (beat === 0) {
      const deg = [0, 0, 3, 4][bar % 4];
      [0, 2, 4].forEach((s, i) => {
        const note = g.root + g.scale[(deg + s) % g.scale.length] + (i === 0 ? 0 : 0);
        this._synth(this.midiToFreq(note), time, stepDur * 16, {
          wave: "triangle", gain: 0.05, cut: 1600, attack: 0.4, release: 0.6,
        });
      });
    }
  }

  _synth(freq, time, dur, { wave = "sawtooth", gain = 0.2, cut = 2000, attack = 0.01, release = 0.12 } = {}) {
    const g = this._gen;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = wave;
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = cut;
    filter.Q.value = 6;
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(gain, time + attack);
    amp.gain.setTargetAtTime(0, time + dur, release);
    osc.connect(filter).connect(amp).connect(this.master);
    osc.start(time);
    osc.stop(time + dur + release + 0.2);
    g.voices.add(osc);
    osc.onended = () => g?.voices.delete(osc);
  }

  _drum(time, type, gain = 0.5) {
    const g = this._gen;
    if (type === "kick") {
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);
      amp.gain.setValueAtTime(0.6, time);
      amp.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      osc.connect(amp).connect(this.master);
      osc.start(time);
      osc.stop(time + 0.2);
      g.voices.add(osc);
      osc.onended = () => g?.voices.delete(osc);
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = g.noise;
      const amp = this.ctx.createGain();
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      amp.gain.setValueAtTime(gain, time);
      amp.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(hp).connect(amp).connect(this.master);
      src.start(time);
      src.stop(time + 0.06);
      g.voices.add(src);
      src.onended = () => g?.voices.delete(src);
    }
  }
}
