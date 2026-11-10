/* ============================================================
   packer.js – Rangement 3D (3D Bin Packing)
   Heuristique à « points extrêmes » + multi-stratégies.
   Repère : x = longueur (0 = dossier des sièges), y = hauteur, z = largeur
   (z = 0 : côté droit vu depuis l'ouverture du coffre).
   Les 6 orientations sont testées (2 seulement si « garder debout »).
   Un bagage doit être posé au sol ou reposer à ≥ 70 % sur d'autres bagages.
   ============================================================ */
const Packer = (() => {
  const E = 0.01;

  // Orientations [dx, dy, dz] ; la première est l'orientation d'origine
  const orients = (it) => {
    const { l, w, h } = it;
    const a = [[l, h, w], [w, h, l]];
    if (!it.up) a.push([l, w, h], [w, l, h], [h, l, w], [h, w, l]);
    const seen = new Set();
    return a.filter((o) => !seen.has(o + '') && seen.add(o + ''));
  };

  const overlap = (a, b) =>
    a.x < b.x + b.dx - E && b.x < a.x + a.dx - E &&
    a.y < b.y + b.dy - E && b.y < a.y + a.dy - E &&
    a.z < b.z + b.dz - E && b.z < a.z + a.dz - E;

  // Le bagage est-il suffisamment soutenu ?
  const supported = (b, placed) => {
    if (b.y < E) return true;
    let area = 0;
    for (const q of placed) {
      if (Math.abs(q.y + q.dy - b.y) < E) {
        area += Math.max(0, Math.min(b.x + b.dx, q.x + q.dx) - Math.max(b.x, q.x)) *
                Math.max(0, Math.min(b.z + b.dz, q.z + q.dz) - Math.max(b.z, q.z));
      }
    }
    return area >= 0.7 * b.dx * b.dz;
  };

  // Un passage : place les bagages dans l'ordre donné
  const run = (order, wt, T) => {
    const placed = [...T.obs], out = [], un = [];
    let pts = [{ x: 0, y: 0, z: 0 }];
    for (const it of order) {
      let best = null;
      for (const p of pts) {
        for (const o of it.o) {
          const b = { x: p.x, y: p.y, z: p.z, dx: o[0], dy: o[1], dz: o[2] };
          if (b.x + b.dx > T.L + E || b.y + b.dy > T.H + E || b.z + b.dz > T.W + E) continue;
          const sc = wt[0] * b.x + wt[1] * b.y + wt[2] * b.z + (o === it.o[0] ? 0 : 3);
          if (best && sc >= best.sc) continue;
          if (placed.some((q) => overlap(b, q)) || !supported(b, placed)) continue;
          best = { b, sc };
        }
      }
      if (!best) { un.push(it); continue; }
      const b = Object.assign(best.b, { it });
      placed.push(b); out.push(b);
      const m = new Map();
      [...pts, { x: b.x + b.dx, y: b.y, z: b.z }, { x: b.x, y: b.y + b.dy, z: b.z },
        { x: b.x, y: b.y, z: b.z + b.dz }, { x: b.x + b.dx, y: 0, z: b.z },
        { x: b.x + b.dx, y: b.y, z: 0 }]
        .filter((q) => !(q.x > b.x - E && q.x < b.x + b.dx - E && q.y > b.y - E && q.y < b.y + b.dy - E && q.z > b.z - E && q.z < b.z + b.dz - E))
        .forEach((q) => m.set(q.x.toFixed(1) + '|' + q.y.toFixed(1) + '|' + q.z.toFixed(1), q));
      pts = [...m.values()];
    }
    return { out, un };
  };

  // Ordre de chargement : du sol vers le haut, puis du fond vers l'ouverture
  const finalize = (out) => {
    const s = [...out].sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    s.forEach((b, i) => (b.order = i + 1));
    return s;
  };

  const metrics = (placed) => {
    const ext = { x: 0, y: 0, z: 0 };
    let rot = 0, stack = 0;
    placed.forEach((b) => {
      ext.x = Math.max(ext.x, b.x + b.dx); ext.y = Math.max(ext.y, b.y + b.dy); ext.z = Math.max(ext.z, b.z + b.dz);
      rot += b.dy !== b.it.h ? 2 : b.dx !== b.it.l ? 1 : 0;
      if (b.y > E) stack++;
    });
    return { ext, rot, stack, bound: ext.x * ext.y * ext.z };
  };

  const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  // items : [{key,name,color,l,w,h,up}] ; T : {L,W,H,obs}
  const solve = (items, T) => {
    items = items.map((it) => ({ ...it, o: orients(it) }));
    const vol = (i) => i.l * i.w * i.h;
    const face = (i) => Math.max(i.l * i.w, i.l * i.h, i.w * i.h);
    const orders = [
      [...items].sort((a, b) => vol(b) - vol(a)),
      [...items].sort((a, b) => face(b) - face(a)),
      [...items].sort((a, b) => Math.max(b.l, b.w, b.h) - Math.max(a.l, a.w, a.h)),
      [...items].sort((a, b) => b.h - a.h),
    ];
    const rnd = rng(42);
    for (let k = 0; k < 24; k++) orders.push([...items].sort(() => rnd() - 0.5));
    const weights = [[100, 10, 1], [1, 100, 10], [10, 1, 100], [100, 1, 10]];

    const complete = new Map();
    let partial = null;
    const t0 = performance.now();
    for (const order of orders) {
      for (const wt of weights) {
        const r = run(order, wt, T);
        if (!r.un.length) {
          const sig = r.out.map((b) => b.it.key + [b.x, b.y, b.z, b.dx, b.dy, b.dz].map((n) => Math.round(n)).join(',')).sort().join(';');
          complete.set(sig, r.out);
        } else {
          const v = r.out.reduce((s, b) => s + vol(b.it), 0);
          if (!partial || v > partial.v) partial = { v, ...r };
        }
      }
      if (performance.now() - t0 > 1800 && (complete.size || partial)) break;
    }

    if (!complete.size) {
      const out = partial ? partial.out : [];
      return { complete: false, unplaced: partial ? partial.un : items, solutions: [{ labels: ['Meilleure tentative'], placed: finalize(out), ...metrics(out) }] };
    }
    const sols = [...complete.values()].map((out) => ({ placed: finalize(out), ...metrics(out) }));
    const pick = (fn) => sols.reduce((a, b) => (fn(b) < fn(a) ? b : a));
    const simple = pick((s) => s.stack + s.rot + s.ext.x / 1000);
    const space = pick((s) => s.bound);
    const few = pick((s) => s.rot * 10 + s.stack + s.ext.x / 1000);
    const res = [];
    [[simple, 'Le plus simple à réaliser'], [space, 'Meilleure utilisation de l\'espace'], [few, 'Le moins de manipulations']].forEach(([s, l]) => {
      const f = res.find((r) => r === s);
      if (f) f.labels.push(l); else { s.labels = [l]; res.push(s); }
    });
    return { complete: true, unplaced: [], solutions: res };
  };

  return { solve };
})();
