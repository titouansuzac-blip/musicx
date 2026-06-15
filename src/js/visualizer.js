// Visualiseur 3D Three.js — grille de "pixels" (cubes instanciés) réactifs
// à la musique. 3 styles : bars (barres pixel), grid (grille), tunnel.

import * as THREE from "three";

export class Visualizer {
  constructor(canvas, player, { style = "bars", accent = "#ff5a36" } = {}) {
    this.canvas = canvas;
    this.player = player;
    this.style = style;
    this.accent = new THREE.Color(accent);
    this.running = false;
    this.t = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(3, 6, 5);
    this.scene.add(dir);

    this._buildMesh();
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
  }

  setAccent(hex) {
    this.accent = new THREE.Color(hex);
  }

  setStyle(style) {
    if (style === this.style) return;
    this.style = style;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose?.(); }
    this._buildMesh();
  }

  _gridDims() {
    if (this.style === "bars") return { cols: 24, rows: 14 };
    if (this.style === "grid") return { cols: 16, rows: 16 };
    return { cols: 16, rows: 8 }; // tunnel : segments par anneau, anneaux
  }

  _buildMesh() {
    const { cols, rows } = this._gridDims();
    this.cols = cols; this.rows = rows;
    this._smooth = new Float32Array(cols); // lissage par colonne
    this._colVals = new Float32Array(cols);
    const count = cols * rows;

    const geo = new THREE.BoxGeometry(0.82, 0.82, 0.82);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.45, metalness: 0.1,
      emissive: 0x000000, emissiveIntensity: 0.9,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    this._dummy = new THREE.Object3D();
    this._basePos = [];

    if (this.style === "tunnel") {
      // anneaux concentriques s'enfonçant en Z
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ang = (c / cols) * Math.PI * 2;
          const rad = 3.2;
          this._basePos.push({
            x: Math.cos(ang) * rad,
            y: Math.sin(ang) * rad,
            z: -r * 1.4,
            ring: r, seg: c,
          });
        }
      }
      this.camera.position.set(0, 0, 6);
      this.camera.lookAt(0, 0, -4);
    } else {
      // grille planaire centrée
      const gw = cols, gh = rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this._basePos.push({
            x: c - gw / 2 + 0.5,
            y: r - gh / 2 + 0.5,
            z: 0, col: c, row: r,
          });
        }
      }
      const fit = Math.max(cols, rows);
      this.camera.position.set(cols * 0.18, rows * 0.12, fit * 0.95);
      this.camera.lookAt(0, this.style === "bars" ? -1 : 0, 0);
    }

    this.scene.add(this.mesh);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._frame();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _frame() {
    this.t += 0.016;
    const data = this.player.getFrequencyData();
    const playing = this.player.isPlaying;

    // Valeurs lissées par colonne, calculées une seule fois par frame.
    this._colVals = this._colVals || new Float32Array(this.cols);
    for (let c = 0; c < this.cols; c++) this._colVals[c] = this._sample(data, c);

    if (this.style === "bars") this._frameBars(data, playing);
    else if (this.style === "grid") this._frameGrid(data, playing);
    else this._frameTunnel(data, playing);

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.scene.rotation.y = Math.sin(this.t * 0.15) * 0.12;
    this.renderer.render(this.scene, this.camera);
  }

  // Échantillonne+lisse une bande pour la colonne c (mapping logarithmique :
  // les graves occupent plus de colonnes ; attaque rapide / déclin lent).
  // À n'appeler qu'une fois par colonne et par frame (mute le lissage).
  _sample(data, c) {
    if (!data) return 0;
    const f = c / Math.max(1, this.cols - 1);
    const i = Math.min(data.length - 1, Math.floor(Math.pow(f, 1.7) * (data.length - 1)));
    const raw = data[i] / 255;
    const prev = this._smooth ? this._smooth[c] : raw;
    const k = raw > prev ? 0.55 : 0.12; // attaque vs déclin
    const v = prev + (raw - prev) * k;
    if (this._smooth) this._smooth[c] = v;
    return v;
  }

  // Lecture non destructive de la valeur lissée d'une colonne.
  _band(_data, c) {
    return this._colVals ? this._colVals[c] || 0 : 0;
  }

  // Couleur d'une cellule allumée : mélange accent -> blanc selon t (0..1),
  // pour que les pointes (énergie aiguë) tirent vers le clair.
  _litColor(t) {
    const col = this._tmpColor || (this._tmpColor = new THREE.Color());
    col.copy(this.accent);
    if (t > 0) col.lerp(this._white || (this._white = new THREE.Color(0xffffff)), t * 0.65);
    return col;
  }

  _setCell(i, x, y, z, s, color) {
    this._dummy.position.set(x, y, z);
    this._dummy.scale.setScalar(Math.max(0.04, s));
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this._dummy.matrix);
    let col;
    if (color === false) { col = this._dim || (this._dim = new THREE.Color(0.09, 0.09, 0.09)); }
    else if (color === true || color === undefined) { col = this.accent; }
    else { col = color; }
    this.mesh.setColorAt?.(i, col);
    const a = this.mesh.instanceColor.array;
    a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b;
  }

  _frameBars(data, playing) {
    for (let c = 0; c < this.cols; c++) {
      let amp = this._band(data, c);
      if (!playing) amp = 0.10 + 0.07 * Math.sin(this.t * 2 + c * 0.5);
      const lit = Math.round(amp * this.rows);
      for (let r = 0; r < this.rows; r++) {
        const i = r * this.cols + c;
        const p = this._basePos[i];
        const on = r < lit;
        // pointe plus claire au sommet de chaque colonne
        const tip = on ? Math.max(0, (r - lit * 0.55) / Math.max(1, this.rows)) : 0;
        this._setCell(i, p.x, p.y, 0, on ? 0.92 : 0.5, on ? this._litColor(tip * 2) : false);
      }
    }
  }

  _frameGrid(data, playing) {
    const level = playing ? this.player.getLevel() : 0.15;
    for (let i = 0; i < this._basePos.length; i++) {
      const p = this._basePos[i];
      const dist = Math.hypot(p.x, p.y) / 11;
      const band = this._band(data, p.col);
      const wave = Math.sin(this.t * 3 - dist * 6) * 0.5 + 0.5;
      const v = playing ? band * (1 - dist * 0.4) + wave * level * 0.6 : wave * 0.25;
      const lit = v > 0.35;
      this._setCell(i, p.x, p.y, v * 1.4, 0.6 + v, lit);
    }
  }

  _frameTunnel(data, playing) {
    for (let i = 0; i < this._basePos.length; i++) {
      const p = this._basePos[i];
      const band = this._band(data, p.seg);
      const z = ((p.z + this.t * 3) % (this.rows * 1.4)) - this.rows * 1.4 + 4;
      const pulse = playing ? band : 0.15 + 0.1 * Math.sin(this.t * 2 + p.ring);
      const rad = 3.2 - pulse * 1.2;
      const ang = (p.seg / this.cols) * Math.PI * 2 + this.t * 0.2;
      const lit = pulse > 0.3;
      this._setCell(i, Math.cos(ang) * rad, Math.sin(ang) * rad, z, 0.5 + pulse, lit);
    }
  }

  _resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 150;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this._ro?.disconnect();
    this.renderer.dispose();
  }
}
