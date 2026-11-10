/* ============================================================
   script.js – Interface, état, sauvegarde (LocalStorage), résultats
   ============================================================ */
'use strict';
const KEY = 'coffre-optimizer-v1';
const PAL = ['#2563eb', '#e11d48', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#ea580c', '#db2777'];
const LABELS = ['Accueil', 'Véhicule', 'Bagages', 'Calcul', 'Résultat', '3D'];
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
const r1 = (n) => Math.round(n * 10) / 10;

const S = { trunk: { L: '', W: '', H: '', shelf: '', fold: false, extra: '', arch: false, aw: '', ah: '', al: '', ad: '', irr: false }, items: [], step: 1 };
let editing = null, RES = null, SEL = 0, viewer = null, hero = null, hidden = new Set(), stepMode = false, stepN = 0, timer = null;

const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ trunk: S.trunk, items: S.items })); } catch (e) {} };
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) { Object.assign(S.trunk, d.trunk); S.items = d.items || []; } } catch (e) {} };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }

/* ---------- Navigation ---------- */
function go(n) {
  clearTimeout(timer);
  if (n >= 3 && eff().err) { toast(eff().err); n = 2; }
  if (n >= 4 && !S.items.length) { toast('Ajoutez au moins un bagage.'); n = 3; }
  if (n >= 5 && !RES) n = 4;
  S.step = n;
  $$('.page').forEach((p, i) => (p.hidden = i + 1 !== n));
  $('#prog').hidden = n === 1;
  $('#barfill').style.width = (n / 6) * 100 + '%';
  $('#steps').innerHTML = LABELS.map((l, i) => `<li class="${i + 1 === n ? 'on' : ''}">${l}</li>`).join('');
  $('#steplabel').textContent = `Étape ${n}/6 : ${LABELS[n - 1]}`;
  n === 1 ? hero && hero.start() : hero && hero.stop();
  if (n === 3) renderBags();
  if (n === 4) { compute(); timer = setTimeout(() => S.step === 4 && go(5), 700); }
  if (n === 5) renderResult();
  if (n === 6) initView(); else viewer && viewer.stop();
  window.scrollTo(0, 0);
}

/* ---------- Coffre ---------- */
function eff() {
  const t = S.trunk, m = t.irr ? 3 : 0;
  let L = num(t.L), W = num(t.W), H = num(t.H);
  if (!(L > 0 && W > 0 && H > 0)) return { err: 'Renseignez la longueur, la largeur et la hauteur du coffre.' };
  const sh = num(t.shelf); if (sh > 0) H = Math.min(H, sh);
  if (t.fold && num(t.extra) > 0) L += num(t.extra);
  L -= m; W -= m; H -= m;
  const obs = [];
  if (t.arch) {
    const aw = num(t.aw), ah = num(t.ah), al = num(t.al), ad = num(t.ad) || 0;
    if (aw > 0 && ah > 0 && al > 0 && 2 * aw < W) [0, W - aw].forEach((z) => obs.push({ x: ad, y: 0, z, dx: al, dy: Math.min(ah, H), dz: aw, obstacle: true }));
  }
  return { L, W, H, obs };
}
function bindTrunk() {
  $$('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    el.type === 'checkbox' ? (el.checked = S.trunk[k]) : (el.value = S.trunk[k]);
    el.addEventListener('input', () => { S.trunk[k] = el.type === 'checkbox' ? el.checked : el.value; subs(); save(); RES = null; });
  });
  subs();
}
function subs() { $('#s-fold').hidden = !S.trunk.fold; $('#s-arch').hidden = !S.trunk.arch; }

/* ---------- Bagages ---------- */
function iso(c, l, w, h) {
  const m = Math.max(l, w, h), k = 36 / m, a = l * k, b = w * k * 0.5, d = h * k, W = a + b + 4, H = d + b + 4;
  const p = (pts, ov) => `<polygon points="${pts}" fill="${c}"/><polygon points="${pts}" fill="${ov}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W * 1.3}" height="${H * 1.3}" aria-hidden="true">` +
    p(`2,${b + 2} ${a + 2},${b + 2} ${a + 2},${d + b + 2} 2,${d + b + 2}`, 'rgba(0,0,0,0)') +
    p(`2,${b + 2} ${b + 2},2 ${a + b + 2},2 ${a + 2},${b + 2}`, 'rgba(255,255,255,.4)') +
    p(`${a + 2},${b + 2} ${a + b + 2},2 ${a + b + 2},${d + 2} ${a + 2},${d + b + 2}`, 'rgba(0,0,0,.25)') + '</svg>';
}
function resetForm() {
  editing = null; $('#formtitle').textContent = 'Nouveau bagage'; $('#i-save').textContent = 'Ajouter ce bagage'; $('#i-cancel').hidden = true;
  ['i-name', 'i-l', 'i-w', 'i-h'].forEach((i) => ($('#' + i).value = ''));
  $('#i-q').value = 1; $('#i-up').checked = false; $('#i-color').value = PAL[S.items.length % PAL.length];
}
function saveItem() {
  const it = { name: $('#i-name').value.trim() || 'Bagage ' + (S.items.length + 1), color: $('#i-color').value, l: num($('#i-l').value), w: num($('#i-w').value), h: num($('#i-h').value), q: Math.round(num($('#i-q').value)), up: $('#i-up').checked };
  if (!(it.l > 0 && it.w > 0 && it.h > 0)) return toast('Renseignez la longueur, la largeur et la hauteur.');
  if (!(it.q >= 1 && it.q <= 50)) return toast('La quantité doit être comprise entre 1 et 50.');
  if (editing) { const i = S.items.findIndex((x) => x.id === editing); S.items[i] = { ...it, id: editing }; }
  else S.items.push({ ...it, id: Date.now() + Math.random() });
  save(); RES = null; resetForm(); renderBags();
}
function renderBags() {
  const tot = S.items.reduce((s, i) => s + i.q, 0), vol = S.items.reduce((s, i) => s + i.q * i.l * i.w * i.h, 0) / 1000;
  $('#recap').innerHTML = `<span>${tot} bagage${tot > 1 ? 's' : ''}</span><span>${r1(vol)} L au total</span>`;
  $('#bags').innerHTML = S.items.length ? S.items.map((i) => `<li class="bag">${iso(i.color, i.l, i.w, i.h)}<div><b>${esc(i.name)}</b> × ${i.q}<small>${i.l} × ${i.w} × ${i.h} cm${i.up ? ' · reste debout' : ''}</small></div><div class="acts"><button class="btn sm sec" data-a="edit" data-id="${i.id}">Modifier</button><button class="btn sm sec" data-a="dup" data-id="${i.id}">Dupliquer</button><button class="btn sm sec" data-a="del" data-id="${i.id}">Supprimer</button></div></li>`).join('') : '<p class="empty">Aucun bagage pour le moment. Ajoutez le premier avec le formulaire.</p>';
}
function bagAction(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const i = S.items.findIndex((x) => String(x.id) === b.dataset.id), it = S.items[i];
  if (b.dataset.a === 'del') S.items.splice(i, 1);
  if (b.dataset.a === 'dup') S.items.splice(i + 1, 0, { ...it, id: Date.now() + Math.random(), name: it.name + ' (copie)' });
  if (b.dataset.a === 'edit') {
    editing = it.id; $('#formtitle').textContent = 'Modifier le bagage'; $('#i-save').textContent = 'Enregistrer'; $('#i-cancel').hidden = false;
    $('#i-name').value = it.name; $('#i-color').value = it.color; $('#i-l').value = it.l; $('#i-w').value = it.w; $('#i-h').value = it.h; $('#i-q').value = it.q; $('#i-up').checked = it.up;
    $('#i-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  save(); RES = null; renderBags();
}

/* ---------- Calcul ---------- */
function expand() {
  const out = [];
  S.items.forEach((i) => { for (let k = 1; k <= i.q; k++) out.push({ key: i.id + '#' + k, name: i.q > 1 ? `${i.name} (${k}/${i.q})` : i.name, color: i.color, l: i.l, w: i.w, h: i.h, up: i.up }); });
  return out;
}
function compute() { const T = eff(); RES = { T, items: expand(), ...Packer.solve(expand(), T) }; SEL = 0; hidden = new Set(); }

/* ---------- Résultat ---------- */
function describe(b, sol, T) {
  const p = [];
  p.push(b.x < 1 ? 'tout au fond, contre le dossier des sièges' : `à ${r1(b.x)} cm du dossier des sièges`);
  if (b.z < 1 && b.z + b.dz > T.W - 1) p.push('sur toute la largeur');
  else if (b.z < 1) p.push('contre le côté droit');
  else if (b.z + b.dz > T.W - 1) p.push('contre le côté gauche');
  else p.push(`à ${r1(b.z)} cm du côté droit`);
  if (b.y < 1) p.push('au sol');
  else {
    const under = sol.placed.filter((q) => Math.abs(q.y + q.dy - b.y) < 0.01 && Math.min(b.x + b.dx, q.x + q.dx) > Math.max(b.x, q.x) && Math.min(b.z + b.dz, q.z + q.dz) > Math.max(b.z, q.z)).map((q) => q.it.name);
    p.push('posé sur ' + (under.length ? esc(under.join(' et ')) : 'le passage de roue') + ` (à ${r1(b.y)} cm du plancher)`);
  }
  const how = b.dy !== b.it.h ? 'couché, ' : '';
  return `${how}posé sur sa face de ${r1(b.dx)} × ${r1(b.dz)} cm (hauteur ${r1(b.dy)} cm), ${b.dx >= b.dz ? 'dans le sens de la longueur du coffre' : 'en travers du coffre'} : ${p.join(', ')}. <span class="mut">(vu depuis l'ouverture du coffre)</span>`;
}
function renderResult() {
  const R = RES, T = R.T, sol = R.solutions[SEL];
  const tv = (T.L * T.W * T.H - T.obs.reduce((s, o) => s + o.dx * o.dy * o.dz, 0)) / 1000;
  const bv = sol.placed.reduce((s, b) => s + b.it.l * b.it.w * b.it.h, 0) / 1000;
  const allv = R.items.reduce((s, i) => s + i.l * i.w * i.h, 0) / 1000;
  const pct = Math.round((bv / tv) * 100), tight = pct >= 80;
  const cls = !R.complete ? 'bad' : tight ? 'warn' : 'ok';
  $('#verdict').innerHTML = `<div class="verdict ${cls}">${!R.complete ? 'Impossible de ranger tous les bagages.' : tight ? 'Rangement possible, mais très serré.' : 'Bonne nouvelle ! Tous vos bagages peuvent rentrer dans votre coffre.'}<p>${R.complete ? 'Calcul fondé sur les dimensions saisies : ce n\'est pas une garantie, vérifiez avec un essai réel.' : `${sol.placed.length} bagage(s) sur ${R.items.length} peuvent être placés.`}</p></div>`;
  $('#soltabs').innerHTML = R.solutions.map((s, i) => `<button class="tab" role="tab" aria-selected="${i === SEL}" data-s="${i}">${R.complete ? 'Solution ' + (i + 1) : 'Meilleure tentative'}</button>`).join('');
  $('#solname').textContent = sol.labels.join(' · ');
  $('#stats').innerHTML = [[R.items.length, 'bagages'], [r1(allv) + ' L', 'volume des bagages'], [r1(tv) + ' L', 'volume estimé du coffre'], [r1(Math.max(0, tv - bv)) + ' L', 'espace restant estimé'], [pct + ' %', 'remplissage'], [R.complete ? 'Oui' : 'Non', 'tout peut rentrer']].map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join('');
  const m = $('#meter'); m.style.width = Math.min(100, pct) + '%'; m.style.background = { ok: '#16a34a', warn: '#f59e0b', bad: '#dc2626' }[cls];
  $('#ins').innerHTML = sol.placed.map((b) => `<li><span class="dot" style="background:${b.it.color}">${b.order}</span><div><b>${esc(b.it.name)}</b> : ${describe(b, sol, T)}</div></li>`).join('') || '<li>Aucun bagage ne peut être placé.</li>';
  const pb = $('#problems'); pb.hidden = R.complete;
  if (!R.complete) {
    const fits = (i) => i.l <= 1e9 && [[i.l, i.h, i.w], [i.w, i.h, i.l], ...(i.up ? [] : [[i.l, i.w, i.h], [i.w, i.l, i.h], [i.h, i.l, i.w], [i.h, i.w, i.l]])].some((o) => o[0] <= T.L && o[1] <= T.H && o[2] <= T.W);
    pb.innerHTML = '<h3>Bagages qui posent problème</h3><ul style="padding-left:20px">' + R.unplaced.map((i) => `<li><b>${esc(i.name)}</b> (${i.l} × ${i.w} × ${i.h} cm) : ${fits(i) ? 'plus assez de place une fois les autres bagages installés.' : `ne rentre dans aucune orientation (coffre utile : ${r1(T.L)} × ${r1(T.W)} × ${r1(T.H)} cm).`}</li>`).join('') + '</ul><p class="mut" style="margin-top:8px">Pistes : rabattre les sièges, retirer un bagage ou en regrouper plusieurs dans un sac souple.</p>';
  }
}

/* ---------- 3D ---------- */
function initView() {
  if (!viewer) viewer = new Viewer($('#v3d'));
  $('#solsel').innerHTML = RES.solutions.map((s, i) => `<option value="${i}">${RES.complete ? `Solution ${i + 1} : ` : ''}${esc(s.labels.join(' · '))}</option>`).join('');
  $('#solsel').value = SEL; loadScene(); viewer.start();
}
function loadScene() {
  const sol = RES.solutions[SEL]; viewer.setScene(RES.T, sol.placed);
  $('#chips').innerHTML = sol.placed.map((b) => `<label class="chip"><input type="checkbox" data-key="${b.it.key}" ${hidden.has(b.it.key) ? '' : 'checked'}><i style="background:${b.it.color}"></i>${esc(b.it.name)}</label>`).join('');
  stepN = stepMode ? 0 : sol.placed.length; applyVis();
}
function applyVis() {
  const n = RES.solutions[SEL].placed.length;
  viewer.setVis((i, k) => !hidden.has(k) && (!stepMode || i < stepN));
  $('#stepbox').hidden = !stepMode;
  $('#steptxt').textContent = stepN ? `Étape ${stepN}/${n} : ${RES.solutions[SEL].placed[stepN - 1].it.name}` : 'Coffre vide';
  $('#prev').disabled = stepN <= 0; $('#next').disabled = stepN >= n;
}

/* ---------- Démarrage ---------- */
function init() {
  load(); bindTrunk();
  $('#start').onclick = () => go(2);
  $('#logo').onclick = (e) => { e.preventDefault(); go(1); };
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(+g.dataset.go); });
  $('#ex-trunk').onclick = () => { Object.assign(S.trunk, { L: 95, W: 100, H: 55 }); bindTrunk(); save(); RES = null; };
  $('#ex-bags').onclick = () => { [['Bagage bleu', '#2563eb', 55, 35, 20], ['Bagage rouge', '#e11d48', 70, 45, 30], ['Bagage vert', '#16a34a', 40, 30, 25]].forEach(([name, color, l, w, h]) => S.items.push({ id: Date.now() + Math.random(), name, color, l, w, h, q: 1, up: false })); save(); RES = null; renderBags(); };
  $('#i-save').onclick = saveItem; $('#i-cancel').onclick = resetForm; $('#bags').onclick = bagAction;
  $('#soltabs').onclick = (e) => { const t = e.target.closest('[data-s]'); if (t) { SEL = +t.dataset.s; renderResult(); } };
  $('#views').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) viewer.setView(b.dataset.v); };
  $('#solsel').onchange = (e) => { SEL = +e.target.value; loadScene(); };
  $('#chips').onchange = (e) => { const k = e.target.dataset.key; e.target.checked ? hidden.delete(k) : hidden.add(k); applyVis(); };
  $('#stepmode').onclick = (e) => { stepMode = !stepMode; e.currentTarget.setAttribute('aria-pressed', stepMode); stepN = stepMode ? 0 : RES.solutions[SEL].placed.length; applyVis(); };
  $('#prev').onclick = () => { stepN--; applyVis(); }; $('#next').onclick = () => { stepN++; applyVis(); };
  resetForm();
  // Démo 3D de l'accueil (calculée avec le vrai algorithme)
  const T = { L: 95, W: 100, H: 55, obs: [] };
  const demo = [['#2563eb', 55, 35, 20], ['#e11d48', 70, 45, 30], ['#16a34a', 40, 30, 25], ['#f59e0b', 45, 30, 20], ['#7c3aed', 30, 25, 25]].map(([color, l, w, h], i) => ({ key: 'd' + i, name: 'd', color, l, w, h, up: false }));
  try { hero = new Viewer($('#heroV'), true); hero.setScene(T, Packer.solve(demo, T).solutions[0].placed); } catch (e) { $('#heroV').hidden = true; }
  go(1);
}
init();
