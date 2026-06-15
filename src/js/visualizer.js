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

    if (this.style === "bars") this._frameBars(data, playing);
    else if (this.style === "grid") this._frameGrid(data, playing);
    else this._frameTunnel(data, playing);

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.scene.rotation.y = Math.sin(this.t * 0.15) * 0.12;
    this.renderer.render(this.scene, this.camera);
  }

  _band(data, c) {
    if (!data) return 0;
    const i = Math.floor((c / this.cols) * data.length);
    return data[i] / 255;
  }

  _setCell(i, x, y, z, s, lit) {
    this._dummy.position.set(x, y, z);
    this._dummy.scale.setScalar(Math.max(0.04, s));
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this._dummy.matrix);
    const col = this._tmpColor || (this._tmpColor = new THREE.Color());
    if (lit) col.copy(this.accent);
    else col.setRGB(0.09, 0.09, 0.09);
    this.mesh.setColorAt?.(i, col);
    const a = this.mesh.instanceColor.array;
    a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b;
  }

  _frameBars(data, playing) {
    for (let c = 0; c < this.cols; c++) {
      let amp = this._band(data, c);
      if (!playing) amp = 0.12 + 0.08 * Math.sin(this.t * 2 + c * 0.5);
      const lit = Math.round(amp * this.rows);
      for (let r = 0; r < this.rows; r++) {
        const i = r * this.cols + c;
        const p = this._basePos[i];
        const on = r < lit;
        this._setCell(i, p.x, p.y, 0, on ? 0.9 : 0.5, on);
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
