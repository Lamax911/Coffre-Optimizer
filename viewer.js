/* ============================================================
   viewer.js – Visualisation 3D (Three.js + OrbitControls)
   Tactile : 1 doigt = rotation, 2 doigts = zoom/déplacement.
   Rendu à la demande (économise la batterie sur mobile).
   ============================================================ */
class Viewer {
  constructor(el, auto = false) {
    this.el = el; this.auto = auto; this.vname = 'persp'; this.dirty = true; this.run = false;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(this.r.domElement);
    this.s = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 1, 8000);
    this.s.add(new THREE.AmbientLight(0xffffff, 0.8));
    const d = new THREE.DirectionalLight(0xffffff, 0.55); d.position.set(250, 450, 300); this.s.add(d);
    this.c = new THREE.OrbitControls(this.cam, this.r.domElement);
    this.c.enableDamping = true; this.c.maxPolarAngle = Math.PI * 0.98;
    if (auto) { this.c.autoRotate = true; this.c.autoRotateSpeed = 1.4; this.c.enableZoom = false; this.c.enablePan = false; this.r.domElement.style.touchAction = 'pan-y'; this.c.enabled = false; }
    this.c.addEventListener('change', () => (this.dirty = true));
    this.g = new THREE.Group(); this.s.add(this.g); this.meshes = [];
    new ResizeObserver(() => this.resize()).observe(el);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.setView(this.vname); this.dirty = true;
  }

  setScene(T, placed) {
    this.T = T;
    this.g.children.slice().forEach((o) => { this.g.remove(o); o.geometry && o.geometry.dispose(); });
    this.meshes = [];
    const box = (b, color, op) => {
      const geo = new THREE.BoxGeometry(b.dx, b.dy, b.dz);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: op < 1, opacity: op }));
      m.position.set(b.x + b.dx / 2 - T.L / 2, b.y + b.dy / 2, b.z + b.dz / 2 - T.W / 2);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0b1f4d, transparent: true, opacity: 0.5 })));
      this.g.add(m); return m;
    };
    const tr = { x: 0, y: 0, z: 0, dx: T.L, dy: T.H, dz: T.W };
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(T.L, T.H, T.W)), new THREE.LineBasicMaterial({ color: 0x1d4ed8 }));
    frame.position.set(0, T.H / 2, 0); this.g.add(frame);
    box({ x: 0, y: -1, z: 0, dx: T.L, dy: 1, dz: T.W }, 0xcbd5e1, 1);       // plancher
    box({ x: -2, y: 0, z: 0, dx: 2, dy: T.H, dz: T.W }, 0x64748b, 0.35);     // dossier des sièges
    (T.obs || []).forEach((o) => box(o, 0x6b7280, 0.9));                      // passages de roue
    placed.forEach((b) => { const m = box(b, b.it.color, 1); m.userData.key = b.it.key; this.meshes.push(m); });
    this.setView(this.vname); this.dirty = true;
  }

  setVis(fn) { this.meshes.forEach((m, i) => (m.visible = fn(i, m.userData.key))); this.dirty = true; }

  setView(name) {
    this.vname = name; const T = this.T; if (!T) return;
    const a = this.cam.aspect || 1, base = Math.max(T.L, T.W, T.H) * 2.3 * (a < 1 ? Math.pow(1 / a, 0.6) : 1);
    const pos = { persp: [0.75, 0.7, 0.85], front: [1, 0, 0], side: [0, 0, 1], top: [0.001, 1, 0] }[name] || [1, 1, 1];
    const n = new THREE.Vector3(...pos).normalize().multiplyScalar(base);
    this.c.target.set(0, T.H / 2, 0);
    this.cam.position.copy(n.add(this.c.target));
    this.c.update(); this.dirty = true;
  }

  start() { if (this.run) return; this.run = true; this.resize(); const loop = () => { if (!this.run) return; requestAnimationFrame(loop); this.c.update(); if (this.dirty || this.auto) { this.r.render(this.s, this.cam); this.dirty = false; } }; loop(); }
  stop() { this.run = false; }
}
