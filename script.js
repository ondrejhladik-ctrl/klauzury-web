/* Ondřej Hladík — Klauzurní práce (rastr je ve sdíleném dither.js) */

// ─ Grain overlay ──────────────────────────────────────────
(function () {
  const g = document.createElement('canvas');
  g.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;opacity:.038;';
  document.body.appendChild(g);
  const ctx = g.getContext('2d');
  const resize = () => { g.width = innerWidth; g.height = innerHeight; };
  resize(); window.addEventListener('resize', resize);
  let f = 0;
  (function tick() {
    if (++f % 3 === 0) {
      const id = ctx.createImageData(g.width, g.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.random() * 255;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
    }
    requestAnimationFrame(tick);
  })();
})();

// makeGlyph (šipka, otazník, kruh) je ve sdíleném dither.js; tady jen navěsit kurzor nad klikacím prvkem
const glyphHover = { enter: () => cur.classList.add('on-panel'), leave: () => cur.classList.remove('on-panel') };

// ─ Šipka pod kazetou: klik odkryje zbytek ─────────────────
document.body.classList.add('gated');
const arrowBtn = document.getElementById('arrow');
const arrow = makeGlyph(document.getElementById('adith'), 60, 90, (c) => {
  c.fillRect(22, 0, 16, 54);                                             // dřík
  c.beginPath(); c.moveTo(2, 50); c.lineTo(58, 50); c.lineTo(30, 88);   // hrot
  c.closePath(); c.fill();
}, arrowBtn, glyphHover);
let revealed = false;

// ─ Otazník vpravo nahoře = odkaz na explikaci ─────────────
const qLink = document.getElementById('qlink');
let qmark = null;
(document.fonts ? document.fonts.load('80px Anton') : Promise.resolve()).then(() => {
  qmark = makeGlyph(document.getElementById('qdith'), 48, 72, (c, W, H) => {
    c.font = '84px Anton, Impact, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', W / 2, H / 2 + 3);
  }, qLink, glyphHover);
});

// ─ Kruh pod otazníkem = efekty (jen když hraje) ───────────
const fxBtn  = document.getElementById('fxbtn');
const fxWrap = document.getElementById('fx');
const fxRing = makeGlyph(document.getElementById('fxdith'), 54, 54, (c, W, H) => {
  c.beginPath(); c.arc(W / 2, H / 2, 20, 0, Math.PI * 2);
  c.lineWidth = 12; c.strokeStyle = c.fillStyle; c.stroke();
}, fxBtn, glyphHover);
let fxOpen = false;
fxBtn.addEventListener('click', () => {
  fxOpen = !fxOpen;
  fxWrap.classList.toggle('open', fxOpen);
  fxWrap.setAttribute('aria-hidden', String(!fxOpen));
  fxBtn.setAttribute('aria-expanded', String(fxOpen));
});

// ─ Lišty efektů ───────────────────────────────────────────
// Svislé rastrované lišty: dřík s rozsvíceným pásem po aktuální hodnotu, popisek pod ním.
// Tahem (nebo klikem) se mění hodnota 0–1; efekt aplikuje applyFx() přes Web Audio.
const fxState = { volume: .8, bass: .5, reso: 0, drive: 0 };
const fxSliders = [...document.querySelectorAll('.fx-slider')].map(el => {
  const key = el.dataset.fx, W = 66, H = 252, canvas = el.querySelector('canvas');
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const ctx = src.getContext('2d');
  const dith = createDither(canvas, { cell: 3, gap: 1, black: .05, white: .9, blur: 1, width: () => W });
  dith.setImage(src);
  const sl = { key, el, dith, hover: false, dragging: false, next: 0 };
  const track = { x: 24, y: 12, w: 18, h: 228 };
  sl.paint = () => {
    const v = fxState[key];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.filter = 'blur(1.5px)';
    ctx.fillStyle = 'rgb(95,95,95)';                                          // dřík
    ctx.fillRect(track.x, track.y, track.w, track.h);
    const lit = Math.round(track.h * v / 3) * 3;                              // rozsvícený pás po řádcích rastru
    ctx.fillStyle = sl.hover || sl.dragging ? '#fff' : 'rgb(225,225,225)';
    ctx.fillRect(track.x - 3, track.y + track.h - lit, track.w + 6, lit);
    ctx.fillRect(track.x - 12, track.y + track.h - lit - 5, track.w + 24, 10); // jezdec
    ctx.filter = 'none';
  };
  sl.tick = now => {
    if (now < sl.next) return;
    sl.next = now + 90;
    sl.paint(); dith.sample(); dith.render(0, sl.hover || sl.dragging ? .5 : .3);
  };
  const setFromEvent = e => {
    const r = canvas.getBoundingClientRect(), k = r.height / H;
    const v = 1 - ((e.clientY - r.top) / k - track.y) / track.h;
    fxState[key] = Math.min(1, Math.max(0, v));
    applyFx();
  };
  el.addEventListener('pointerdown', e => { sl.dragging = true; el.setPointerCapture(e.pointerId); setFromEvent(e); });
  el.addEventListener('pointermove', e => { if (sl.dragging) setFromEvent(e); });
  const stop = () => { sl.dragging = false; };
  el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop);
  el.addEventListener('mouseenter', () => { sl.hover = true; });
  el.addEventListener('mouseleave', () => { sl.hover = false; });
  return sl;
});

// ─ Obří nápis v pozadí (CLICK / PLAY / STOP) ──────────────
// Nápis z Antonu přes rastr: uprostřed plný, ke stranám mu klesá jas až do nuly a silné chvění bodů
// ho tam drolí na jednotlivé pixely. CLICK nad šipkou a otazníkem, PLAY nad kazetou (STOP, když hraje).
const clickBg   = document.getElementById('click-bg');
const clickDith = createDither(clickBg, { cell: 3, gap: 1, black: .02, white: .8, blur: 3, width: () => Math.min(innerWidth * .96, 1600) });
const bigWords  = {};
let clickReady = false, clickOff = 0, bigWord = null;
(document.fonts ? document.fonts.load('400px Anton') : Promise.resolve()).then(() => {
  for (const word of ['CLICK', 'PLAY', 'STOP']) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const px = 400, font = `${px}px Anton, Impact, sans-serif`;
    x.font = font;
    const m = x.measureText(word), pad = px * .1;
    c.width  = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight + pad * 2);
    c.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + pad * 2);
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.font = font; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.fillText(word, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
    const g = x.createLinearGradient(0, 0, c.width, 0);      // rozpuštění do stran
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.36, 'rgba(0,0,0,0)');
    g.addColorStop(.64, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    bigWords[word] = c;
  }
  clickReady = true;
});
function showBigWord(word) {
  if (word === bigWord || !clickReady) return;
  bigWord = word;
  if (word) clickDith.setImage(bigWords[word]);
}

// ─ Cutscéna po spuštění kazety ────────────────────────────
// 0 s klik: všechno zčerná · 0,5 s: vynoří se obličej (zavřené oči) · 1,2–2,4 s: oči se postupně
// otevírají (otevřená fotka se odkrývá pruhem od linie očí nahoru a dolů, jako víčka) ·
// 2,8 s střih: otevřená pusa · 3,15–4,1 s: řev (třese se, rastr šumí) ·
// 4,1 s: obličej mizí a nastupuje otevírání obalu — sekvence snímků assets/case-1.jpg, case-2.jpg, …
// (v pořadí za sebou, tvrdé střihy, stejný rastr) · 8,5 s: tma se zvedá a v heru je otevřená kazeta.
// Bez snímků obalu se jde z obličeje rovnou na kazetu. Hudba nabíhá s obličejem.
const cut      = document.getElementById('cut');
const cutFace  = document.getElementById('cut-face');
const cutCase  = document.getElementById('cut-case');
// jemnější rastr (2 px) a větší rám, aby byl obal čitelný
const caseDith = createDither(cutCase, { cell: 2, gap: 1, black: .08, white: .82, blur: 2, width: () => Math.min(innerWidth * .7, innerHeight * .96 * .75) });
const cutDith  = createDither(cutFace, { cell: 3, gap: 1, black: .34, white: .97, gamma: 1.15, blur: 3, width: () => Math.min(innerWidth * .9, innerHeight * .9 * .8) });
const faceSrc  = {};
const faceMix  = document.createElement('canvas'), faceMixCtx = faceMix.getContext('2d');
const faceTmp  = document.createElement('canvas'), faceTmpCtx = faceTmp.getContext('2d');
let cutActive = false, cutT0 = 0, cutOff = 0, cutTimers = [];

// uprostřed plno, ke všem krajům do ztracena: eliptický přechod, který na okraji dosáhne černé
// (nahoře a dole stejně jako po stranách), plus rozpuštění do stran
function vignette(x, w, h) {
  x.save();
  x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);      // jednotkový kruh = elipsa vepsaná do rámu
  const r = x.createRadialGradient(0, 0, .5, 0, 0, 1);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = r; x.fillRect(-1, -1, 2, 2);
  x.restore();
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(.32, 'rgba(0,0,0,0)');
  g.addColorStop(.68, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.95)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
// snímky jsou z jedné série, zarovnané podle očí do stejného rámu (800×997);
// closed = open s vsazenými zavřenými víčky (z dřívější fotky, expozice dorovnaná)
Promise.all(['open', 'closed', 'mouth', 'scream'].map(k => loadImage(`assets/face-${k}.jpg`))).then(([a, b, m, sc]) => {
  if (!a || !b) return;
  faceSrc.open = a; faceSrc.closed = b; faceSrc.mouth = m; faceSrc.scream = sc;
  faceMix.width = faceTmp.width = a.naturalWidth; faceMix.height = faceTmp.height = a.naturalHeight;
  paintFace(0);
  cutDith.setImage(faceMix);
});

// p = 0 zavřené oči … 1 otevřené: otevřená fotka se odkrývá pruhem kolem linie očí s měkkými okraji;
// frame = 'mouth' | 'scream' místo toho ukáže celý snímek (řev se ještě třese)
function paintFace(p, frame) {
  const W = faceMix.width, H = faceMix.height;
  if (frame && faceSrc[frame]) {
    faceMixCtx.fillStyle = '#000'; faceMixCtx.fillRect(0, 0, W, H);
    const j = frame === 'scream' ? 9 : 0;
    faceMixCtx.drawImage(faceSrc[frame], (Math.random() - .5) * j, (Math.random() - .5) * j);
    vignette(faceMixCtx, W, H);
    return;
  }
  faceMixCtx.drawImage(faceSrc.closed, 0, 0);
  if (p > 0) {
    const eye = H * .38, half = H * .11 * p, feather = H * .05;
    faceTmpCtx.globalCompositeOperation = 'source-over';
    faceTmpCtx.clearRect(0, 0, W, H);
    faceTmpCtx.drawImage(faceSrc.open, 0, 0);
    const g = faceTmpCtx.createLinearGradient(0, eye - half - feather, 0, eye + half + feather);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(feather / (2 * (half + feather)), 'rgba(0,0,0,1)');
    g.addColorStop(1 - feather / (2 * (half + feather)), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    faceTmpCtx.globalCompositeOperation = 'destination-in';
    faceTmpCtx.fillStyle = g; faceTmpCtx.fillRect(0, 0, W, H);
    faceMixCtx.drawImage(faceTmp, 0, 0);
  }
  vignette(faceMixCtx, W, H);
}

// ─ Otevírání obalu: sekvence snímků ───────────────────────
// Snímky assets/case-1.jpg, case-2.jpg, … (načítají se, dokud další existuje). Každý se srovná
// do stejného rámu 3:4 (výřez na střed), zvedne se kontrast a přidají hrany (Sobel) jako světlé linky,
// aby byl tmavý obal v rastru čitelný; nakonec stejná vinětace jako obličej. Přehrávají se za sebou tvrdými střihy.
// edgeBoost (hrany Sobel) je ve sdíleném dither.js
const CASE_DUR = 7.2;                                       // délka celé sekvence v s (~0,8 s na snímek)
const caseFrames = [];
let caseT0 = 0, caseIdx = -1;
(async () => {
  for (let i = 1; i <= 16; i++) {
    const im = await loadImage(`assets/case-${i}.jpg`);
    if (!im) break;
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    const k = Math.max(c.width / im.naturalWidth, c.height / im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.filter = 'contrast(1.6) brightness(1.15) saturate(.6)';
    x.drawImage(im, (c.width - w) / 2, (c.height - h) / 2, w, h);
    x.filter = 'none';
    edgeBoost(x, c.width, c.height);
    vignette(x, c.width, c.height);
    caseFrames.push(c);
  }
  if (!caseFrames.length) console.warn('Chybí assets/case-1.jpg… — cutscéna přeskočí otevírání obalu.');
})();

function startCutscene() {
  cutActive = true; cutT0 = performance.now(); caseT0 = 0; caseIdx = -1;
  cutTimers.forEach(clearTimeout); cutTimers = [];
  const T = (ms, fn) => cutTimers.push(setTimeout(fn, ms));
  cut.classList.add('on');                                            // zčerná
  cur.classList.add('hidden');
  aud.volume = 0;
  T(500,  () => cut.classList.add('face'));                           // obličej
  T(4100, () => cut.classList.remove('face'));                        // obličej pryč…
  const hasCase = caseFrames.length > 0, endAt = hasCase ? 4200 + CASE_DUR * 1000 : 4100;
  if (hasCase) T(4200, () => { caseT0 = performance.now(); cut.classList.add('case'); });   // …a otevírání obalu
  T(endAt - 600, () => swapCassetteImg('assets/photo-tape.jpg'));                              // pod tmou vyměnit kazetu v heru
  T(endAt, () => { cut.classList.add('ending'); cut.classList.remove('case'); });               // poslední snímek se pomalu rozpouští…
  T(endAt + 200, () => { cut.classList.remove('on'); cur.classList.remove('hidden'); });       // …a tma se zvedá, pod ní otevřená kazeta
  T(endAt + 1900, () => { cut.classList.remove('ending'); cutActive = false; caseT0 = 0; });
}
function stopCutscene() {
  cutTimers.forEach(clearTimeout); cutTimers = [];
  cut.classList.remove('on', 'face', 'case', 'ending');
  cur.classList.remove('hidden');
  cutActive = false; caseT0 = 0;
}

// ─ Rozlet bodů po kliknutí ────────────────────────────────
const burst = document.createElement('canvas');
burst.id = 'burst';
document.body.appendChild(burst);
const bctx = burst.getContext('2d');
let particles = null, burstT0 = 0, burstDone = false;

function explodeArrow() {
  // vykreslit šipku celou a naplno, ať je z čeho střílet
  arrow.paint(1, 255);
  arrow.dith.sample();
  arrow.dith.render(0, 0);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  burst.width  = innerWidth  * dpr;
  burst.height = innerHeight * dpr;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r  = document.getElementById('adith').getBoundingClientRect();
  const { cells, size } = arrow.dith.cells();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  particles = cells.map(([x, y]) => {
    const px = r.left + x, py = r.top + y;
    const ang = Math.atan2(py - cy, px - cx) + (Math.random() - .5) * 1.8;   // od středu ven, s rozptylem
    const sp  = 260 + Math.random() * 560;
    return { x: px, y: py, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: .8 + Math.random() * .8, age: 0, s: size + 1 };
  });
  burstT0 = performance.now();
  burstDone = false;
  burstAcc = 1 / 12; burstAlive = particles.length;   // první krok hned
}

// sekaně: posun jen ~12× za sekundu, body zacvaknuté do mřížky rastru, jas ve 4 stupních
let burstAcc = 0, burstAlive = 0;
function drawBurst(dt, ink) {
  burstAcc += dt;
  if (burstAcc < 1 / 12) return burstAlive;
  const step = burstAcc; burstAcc = 0;
  bctx.clearRect(0, 0, innerWidth, innerHeight);
  let alive = 0;
  const g = 3;
  for (const p of particles) {
    p.age += step;
    if (p.age >= p.life) continue;
    alive++;
    p.x += p.vx * step + (Math.random() - .5) * 6;   // s malým poskakováním
    p.y += p.vy * step + (Math.random() - .5) * 6;
    p.vx *= .9;  p.vy *= .9;
    const a = Math.ceil(Math.sqrt(1 - p.age / p.life) * 4) / 4;
    bctx.fillStyle = `rgba(${ink},${a.toFixed(2)})`;
    bctx.fillRect(Math.round(p.x / g) * g, Math.round(p.y / g) * g, p.s, p.s);
  }
  burstAlive = alive;
  return alive;
}

function revealRest() {
  if (revealed) return;
  revealed = true;
  explodeArrow();
  arrowBtn.classList.add('done');
}

// až po rozletu: odkrýt zbytek a sjet na J-card
function finishReveal() {
  document.body.classList.remove('gated');
  requestAnimationFrame(() => {
    for (const p of panels) if (p.ready) { p.dith.layout(); p.dith.render(0, 0); }   // panely měly za bránou nulovou šířku
    document.getElementById('jcard').scrollIntoView({ behavior: 'smooth' });
  });
}

arrowBtn.addEventListener('click', revealRest);

// ─ Scroll reveals ─────────────────────────────────────────
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const el = e.target;
      const delay = el.dataset.delay ? Number(el.dataset.delay) : 0;
      setTimeout(() => el.classList.add('in'), delay);
      io.unobserve(el);
    }
  });
}, { threshold: .1 });
document.querySelectorAll('.panel').forEach(el => io.observe(el));

// ─ Custom cursor ──────────────────────────────────────────
const cur = document.getElementById('cur');
let overCassette = false;

// 3D ikony kurzoru: obraz se rastruje (bílé body) do hlavního canvasu a kopíruje do husté sady vrstev
// posunutých v hloubce, které CSS natáčí v prostoru. 13 vrstev po 0,75 px (±4,5 px) — dost hustě,
// aby body prošly bokem souvisle bez mezer; krajní vrstvy plný jas, vnitřní ztmavené = stín boku.
const ICO_LAYERS = 13, ICO_STEP = .75;
function makeIcon(el, width, anchor = 'center') {
  const ic = { el, layers: [], master: document.createElement('canvas'), ready: false };
  for (let i = 0; i < ICO_LAYERS; i++) {
    const l = document.createElement('canvas');
    l.setAttribute('aria-hidden', 'true');
    const z = (ICO_LAYERS - 1) / 2 * ICO_STEP - i * ICO_STEP;
    l.style.transform = (anchor === 'top' ? 'translate(-50%, 0)' : 'translate(-50%, -50%)') + ` translateZ(${z}px)`;
    if (i !== 0 && i !== ICO_LAYERS - 1) l.style.filter = 'brightness(.55)';
    el.appendChild(l); ic.layers.push(l);
  }
  ic.dith = createDither(ic.master, { cell: 2, gap: 1, blur: 1, black: .55, white: .95, ink: '#ffffff', width: () => width });
  ic.setSource = src => {
    ic.ready = !!src && ic.dith.setImage(src);
    if (ic.ready) for (const l of ic.layers) {
      l.width = ic.master.width; l.height = ic.master.height;
      l.style.width = ic.master.style.width; l.style.height = ic.master.style.height;
    }
    return ic.ready;
  };
  ic.draw = () => {
    if (!ic.ready) return;
    ic.dith.render(0, .05);
    for (const l of ic.layers) { const c = l.getContext('2d'); c.clearRect(0, 0, l.width, l.height); c.drawImage(ic.master, 0, 0); }
  };
  return ic;
}

// play/pause z 3D renderů (SVG); když se nenačtou, zůstane plochá SVG náhrada
const curIcons = [...cur.querySelectorAll('.ring .ico')].map(el => {
  const ic = makeIcon(el, 44);
  loadImage(el.dataset.src).then(im => { if (!ic.setSource(im)) cur.classList.add('no-img'); });
  return ic;
});

document.addEventListener('mousemove', e => {
  cur.style.left = e.clientX + 'px';
  cur.style.top  = e.clientY + 'px';
});

function setCursorState(over, isPlaying) {
  cur.classList.toggle('over',    over);
  cur.classList.toggle('playing', isPlaying);
}

// ─ Fold overlay (J-card panels) ───────────────────────────
const foldOverlay = document.getElementById('fold-overlay');
const foldImg     = document.getElementById('fold-img');

// strany obalu v rastru (stejné nastavení jako zavřený obal v heru); při hoveru je rastr pryč a je vidět fotka
const panels = [...document.querySelectorAll('.panel')].map(el => {
  const p = { el, img: el.querySelector('img'), hover: false, ready: false };
  p.dith = createDither(el.querySelector('canvas'), { cell: 3, gap: 1, blur: 3, black: .3, white: .85, ink2: '#2b3f6e', black2: .02, white2: .3 });
  loadImage(p.img.getAttribute('src')).then(im => { p.ready = !!im && p.dith.setImage(im); el.classList.toggle('dithered', p.ready); });
  el.closest('.panel-wrap').addEventListener('mouseenter', () => { p.hover = true; });
  el.closest('.panel-wrap').addEventListener('mouseleave', () => { p.hover = false; });
  return p;
});

document.querySelectorAll('.panel-wrap').forEach(wrap => {
  wrap.addEventListener('click', () => {
    const src = wrap.dataset.fold;
    if (!src) return;
    foldImg.src = src;
    foldOverlay.classList.add('open');
  });
  wrap.addEventListener('mouseenter', () => cur.classList.add('on-panel'));
  wrap.addEventListener('mouseleave', () => cur.classList.remove('on-panel'));
});

foldOverlay.addEventListener('click', () => {
  foldOverlay.classList.remove('open');
  setTimeout(() => { foldImg.src = ''; }, 500);
});

// ─ Audio ──────────────────────────────────────────────────
const aud = document.getElementById('aud');
let audioCtx, analyser, freqData;
let playing = false;

// řetězec: zdroj -> hlasitost -> basy (lowshelf) -> rezonance (lowpass s vysokým Q) -> drive (waveshaper) -> analyzátor -> výstup
let fxNodes = null;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  const gain  = audioCtx.createGain();
  const bass  = audioCtx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 180;
  const reso  = audioCtx.createBiquadFilter(); reso.type = 'lowpass';  reso.frequency.value = 20000; reso.Q.value = .7;
  const drive = audioCtx.createWaveShaper(); drive.oversample = '2x';
  const post  = audioCtx.createGain();
  audioCtx.createMediaElementSource(aud).connect(gain);
  gain.connect(bass); bass.connect(reso); reso.connect(drive); drive.connect(post); post.connect(analyser);
  analyser.connect(audioCtx.destination);
  fxNodes = { gain, bass, reso, drive, post };
  applyFx();
}

function driveCurve(amount) {
  const n = 1024, c = new Float32Array(n), k = amount * 60;
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = k ? (1 + k) * x / (1 + k * Math.abs(x)) : x; }
  return c;
}
function applyFx() {
  if (!fxNodes) return;
  const t = audioCtx.currentTime, r = .05;
  fxNodes.gain.gain.setTargetAtTime(fxState.volume * fxState.volume, t, r);                 // hlasitost (kvadraticky)
  fxNodes.bass.gain.setTargetAtTime((fxState.bass - .5) * 24, t, r);                        // basy −12…+12 dB
  fxNodes.reso.frequency.setTargetAtTime(20000 * Math.pow(.02, fxState.reso), t, r);         // rezonance: filtr klesá 20 kHz -> 400 Hz…
  fxNodes.reso.Q.setTargetAtTime(.7 + fxState.reso * 14, t, r);                              // …a ostří se
  fxNodes.drive.curve = driveCurve(fxState.drive);
  fxNodes.post.gain.setTargetAtTime(1 / (1 + fxState.drive * 1.2), t, r);                    // drive přidává hlasitost, srovnat
}

function togglePlay() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playing = !playing;
  if (playing) {
    aud.play();
    openCase();
  } else {
    aud.pause();
    closeCase();
  }
  setCursorState(overCassette, playing);
}

aud.addEventListener('ended', () => {
  playing = false;
  setCursorState(overCassette, false);
  closeCase();
});

// ─ Cassette image: closed ↔ open ──────────────────────────
const cwrap = document.getElementById('cwrap');
const cimg  = document.getElementById('cimg');
// obal: světlé body + tmavě modré ve středních tónech, aby zůstala čitelná modrá plocha i postava na ní
const cdith = createDither(document.getElementById('cdith'), { cell: 3, gap: 1, blur: 3, black: .42, white: .9, ink2: '#2b3f6e', black2: .06, white2: .48 });
const hero  = document.getElementById('hero');
let caseOpen = false;
let tRX = 0, tRY = 0;
let cRX = 0, cRY = 0;
let animTime = 0;
let clickT = -1;

// načte fotku a vykreslí ji rastrem; <img> zůstává jen jako fallback
function showCassette(src) {
  return loadImage(src).then(im => {
    cimg.src = src;
    const open = src !== 'assets/case-cover.jpg';
    cwrap.classList.toggle('open', open);                              // otevřená kazeta = širší rám
    cdith.setSoft(open ? { haze: .35, blobScale: 1.5 } : { haze: 0, blobScale: 1 });   // otevřená je víc rozostřená
    if (!im) return;
    cwrap.classList.toggle('dithered', cdith.setImage(im));
  });
}
showCassette(cimg.getAttribute('src'));

function swapCassetteImg(src) {
  cwrap.style.transition = 'opacity .35s ease';
  cwrap.style.opacity = '0';
  setTimeout(() => {
    showCassette(src).then(() => {
      cwrap.style.opacity = '1';
      setTimeout(() => { cwrap.style.transition = ''; }, 380);
    });
  }, 300);
}

function openCase() {
  if (caseOpen) return;
  caseOpen = true;
  if (faceSrc.open) startCutscene();                 // kazeta se vymění až pod tmou
  else swapCassetteImg('assets/photo-tape.jpg');
}

function closeCase() {
  if (!caseOpen) return;
  caseOpen = false;
  stopCutscene();
  aud.volume = 1;
  swapCassetteImg('assets/case-cover.jpg');
}

cwrap.addEventListener('mouseenter', () => { overCassette = true;  setCursorState(true,  playing); });
cwrap.addEventListener('mouseleave', () => { overCassette = false; setCursorState(false, playing); });

cwrap.addEventListener('click', () => {
  if (cutActive) return;
  clickT = 0;
  togglePlay();
});

document.addEventListener('mousemove', e => {
  const hr = hero.getBoundingClientRect();
  if (e.clientY > hr.top && e.clientY < hr.bottom) {
    const dx = (e.clientX - hr.left  - hr.width  * .5) / (hr.width  * .5);
    const dy = (e.clientY - hr.top   - hr.height * .5) / (hr.height * .5);
    tRX = -dy * 7;
    tRY =  dx * 11;
  }
});

hero.addEventListener('mouseleave', () => { tRX = 0; tRY = 0; });

// ─ Waveform ───────────────────────────────────────────────
// sloupce se kreslí do zdrojového canvasu, na obrazovku jdou přes rastr
const wCanvas = document.getElementById('waveform');
const wSrc    = document.createElement('canvas');
const wCtx    = wSrc.getContext('2d');
const wWidth  = () => Math.min(innerWidth * .8, 640);   // = CSS šířka #waveform
const wdith   = createDither(wCanvas, { cell: 3, gap: 1, black: .05, white: .9, blur: 3, width: wWidth });
let wShown = false;

function syncWaveformSize() {
  wSrc.width  = Math.round(wWidth());
  wSrc.height = 48;
  wdith.setImage(wSrc);
}
syncWaveformSize();
window.addEventListener('resize', syncWaveformSize);

// ─ Animation loop ─────────────────────────────────────────
let wAlpha = 0;

let lastNow = performance.now();
const burstInk = readInk().join(',');

(function loop() {
  requestAnimationFrame(loop);
  animTime += .007;
  const now = performance.now();
  const dt  = Math.min(.05, (now - lastNow) / 1000);
  lastNow = now;

  // Smooth tilt
  cRX += (tRX - cRX) * .07;
  cRY += (tRY - cRY) * .07;
  const floatY = Math.sin(animTime * .75) * 7;

  // Click bounce animation
  if (clickT >= 0) {
    clickT = Math.min(1, clickT + 0.055);
    if (clickT >= 1) clickT = -1;
  }
  const ce = clickT >= 0 ? Math.sin(clickT * Math.PI) : 0;
  const clickScale = 1 - ce * 0.055;
  const clickRX    = ce * 5;

  cwrap.style.transform = `rotateX(${(cRX + clickRX).toFixed(3)}deg) rotateY(${cRY.toFixed(3)}deg) translateY(${floatY.toFixed(2)}px) scale(${clickScale.toFixed(4)})`;

  // Audio data (jednou za snímek) + úroveň basů
  let bass = 0;
  if (playing && analyser) {
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += freqData[i];
    bass = sum / (8 * 255);
  }

  // Rastry — dýchají s hudbou, lehce se chvějí (jen když jsou vidět)
  if (onScreen(cwrap))   cdith.render(bass * .45, .05);

  // Nad kazetou play/pause (otáčení dělá CSS); jinde je nativní XP kurzor z CSS
  if (overCassette) { const ic = curIcons[playing ? 1 : 0]; if (ic) ic.draw(); }
  if (!revealed && onScreen(arrowBtn)) arrow.tick(now);
  if (qmark && onScreen(qLink)) qmark.tick(now);

  // Strany obalu — rastr běží jen mimo hover (při hoveru je schovaný pod fotkou)
  for (const p of panels) if (p.ready && !p.hover && onScreen(p.el)) p.dith.render(bass * .3, .05);

  // Kruh efektů jen při přehrávání (mimo cutscénu); lišty se překreslují, jen když jsou otevřené
  const ringOn = playing && !cutActive;
  fxBtn.classList.toggle('show', ringOn);
  if (!ringOn && fxOpen) { fxOpen = false; fxWrap.classList.remove('open'); fxWrap.setAttribute('aria-hidden', 'true'); fxBtn.setAttribute('aria-expanded', 'false'); }
  if (ringOn) fxRing.tick(now);
  if (fxOpen) for (const sl of fxSliders) sl.tick(now);

  // Obří nápis — CLICK nad šipkou/otazníkem, PLAY/STOP nad kazetou; po odjetí ještě doznívá, než zhasne
  const word = (arrow.hover || (qmark && qmark.hover) || fxRing.hover) ? 'CLICK' : (overCassette && !cutActive) ? (playing ? 'STOP' : 'PLAY') : null;
  if (word) { showBigWord(word); clickOff = now + 1000; }
  clickBg.classList.toggle('show', !!word);
  if (clickReady && bigWord && now < clickOff) clickDith.render(0, .45);

  // Cutscéna — obličej otevírá oči, pak se otevírá obal (sekaně ~15 snímků/s); hudba nabíhá
  if (cutActive) {
    const t = (now - cutT0) / 1000;
    if (t < 4.9 && faceSrc.open) {
      const p = Math.min(1, Math.max(0, (t - 1.2) / 1.2));
      const frame = t >= 3.15 ? 'scream' : t >= 2.8 ? 'mouth' : null;
      paintFace(1 - Math.pow(1 - p, 3), frame);                     // ease-out
      cutDith.sample(); cutDith.render(bass * .3, frame === 'scream' ? .55 : .3);
    }
    if (caseT0 && caseFrames.length) {                             // snímky obalu za sebou, tvrdé střihy
      const idx = Math.min(caseFrames.length - 1, Math.floor((now - caseT0) / 1000 / CASE_DUR * caseFrames.length));
      if (idx !== caseIdx) { caseIdx = idx; caseDith.setImage(caseFrames[idx]); }
      caseDith.render(bass * .3, .3);
    }
    if (playing) aud.volume = Math.min(1, Math.max(0, (t - .5) / 1.2));
  }

  // Rozlet bodů šipky; po ~0,9 s se odkryje zbytek, zbylé body dolétnou při scrollu
  if (particles) {
    const alive = drawBurst(dt, burstInk);
    if (!alive) { particles = null; bctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  if (revealed && !burstDone && now - burstT0 > 900) { burstDone = true; finishReveal(); }

  // Waveform — jas sloupce = hlasitost, rastr z něj udělá body + měkká místa
  wAlpha += playing ? (.09 * (1 - wAlpha)) : (-.07 * wAlpha);
  wAlpha  = Math.max(0, Math.min(1, wAlpha));

  if (wAlpha > .01) {
    const cw = wSrc.width, ch = wSrc.height;
    wCtx.fillStyle = '#000';
    wCtx.fillRect(0, 0, cw, ch);
    const n  = freqData ? freqData.length : 64;
    const bw = cw / n;
    for (let i = 0; i < n; i++) {
      const val = freqData ? freqData[i] / 255 : .04;
      const h   = Math.max(.04, val) * ch;
      const l   = Math.round(255 * wAlpha * (.25 + val * .75));
      wCtx.fillStyle = `rgb(${l},${l},${l})`;
      wCtx.fillRect(i * bw + .5, ch - h, Math.max(1, bw - 1.5), h);
    }
    if (onScreen(wCanvas)) { wdith.sample(); wdith.render(0, .05); }
    wShown = true;
  } else if (wShown) {
    wdith.clear();
    wShown = false;
  }
})();
