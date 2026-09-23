/* Ondřej Hladík — Klauzurní práce: bodový rastr (Bayer 4×4), sdílený oběma stránkami */

// ─ Dither (bodový rastr) — sdílené jádro pro index i explikaci ─
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

// barva z CSS proměnné --dither-ink (nebo zadaný hex) jako [r, g, b]
function readInk(hex) {
  const c = hex || getComputedStyle(document.documentElement).getPropertyValue('--dither-ink').trim();
  const m = c.match(/^#([0-9a-f]{6})$/i);
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [255, 16, 16];
}

function createDither(canvas, opts = {}) {
  const cell   = opts.cell   ?? 3;      // velikost buňky v CSS px (číslo nebo fn(šířka))
  const gap    = opts.gap    ?? 1;      // mezera mezi body (device px)
  const black  = opts.black  ?? .08;    // pod tímto jasem nic
  const white  = opts.white  ?? .70;    // nad tímto jasem plná plocha
  const gamma  = opts.gamma  ?? 1;
  const invert = opts.invert ?? false;  // tmavá kresba na světlé -> body tam, kde je kresba
  const bg     = opts.bg     ?? '#000'; // podklad pod průhledné části zdroje
  const blur   = opts.blur   ?? 0;      // měkkost plujících rozostřených míst (v buňkách), 0 = vypnuto
  let haze = opts.haze ?? 0, blobScale = 1;   // opar 0–1 (rozostření celého obrazu) a velikost plujících skvrn — jde měnit za běhu
  let inkHex = opts.ink;                // vlastní barva bodů (jinak --dither-ink); jde změnit přes setInk()
  let ink2Hex = opts.ink2;              // druhá, tmavší barva s vlastním tónováním (black2/white2) — střední tóny
  const black2 = opts.black2 ?? .06, white2 = opts.white2 ?? .5;
  const widthOf = opts.width ?? (() => canvas.parentElement.clientWidth);  // CSS šířka výstupu

  const ctx  = canvas.getContext('2d');
  const src  = document.createElement('canvas');   // převzorkovaný zdroj
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const low  = document.createElement('canvas');   // 1 px = 1 buňka
  const lctx = low.getContext('2d');
  const soft = document.createElement('canvas');   // rozostřená verze (zmenšená + bilineárně zvětšená)
  const fctx = soft.getContext('2d');
  const mask = document.createElement('canvas');   // kde rozostřit (měkké skvrny)
  const mctx = mask.getContext('2d');

  let img = null, cols = 0, rows = 0, cellDev = cell, cellCss = cell, gapCss = gap;
  let lum = null, lum2 = null, out = null, grid = null;
  let ink = [255, 16, 16], ink2 = null;
  // tři skvrny s náhodnou fází a rychlostí — pomalu plují po obraze
  const blobs = [0, 1, 2].map(() => ({
    px: Math.random() * 6.28, py: Math.random() * 6.28,
    sx: .05 + Math.random() * .05, sy: .04 + Math.random() * .05,
    r: .3 + Math.random() * .18,
  }));

  function layout() {
    const iw = img && (img.naturalWidth || img.width);
    const ih = img && (img.naturalHeight || img.height);
    if (!iw || !ih) return;
    const dpr  = Math.min(devicePixelRatio || 1, 2);
    const cssW = widthOf();
    if (!cssW) return;
    const cssH = cssW * ih / iw;
    const cellPx = typeof cell === 'function' ? cell(cssW) : cell;
    cellDev = Math.max(1, Math.round(cellPx * dpr));
    cellCss = cellDev / dpr;
    gapCss  = gap / dpr;
    cols = Math.max(1, Math.round(cssW * dpr / cellDev));
    rows = Math.max(1, Math.round(cssH * dpr / cellDev));
    canvas.width  = cols * cellDev;
    canvas.height = rows * cellDev;
    canvas.style.width  = canvas.width  / dpr + 'px';
    canvas.style.height = canvas.height / dpr + 'px';

    low.width = cols; low.height = rows;
    out = lctx.createImageData(cols, rows);
    if (blur) {
      soft.width = Math.max(1, Math.round(cols / blur));
      soft.height = Math.max(1, Math.round(rows / blur));
      mask.width = Math.max(2, Math.round(cols / 4));
      mask.height = Math.max(2, Math.round(rows / 4));
    }

    // mřížka — vyřeže mezery mezi body
    grid = null;
    if (gap > 0 && cellDev > gap) {
      const t = document.createElement('canvas');
      t.width = t.height = cellDev;
      const tc = t.getContext('2d');
      tc.fillStyle = '#000';
      tc.fillRect(cellDev - gap, 0, gap, cellDev);
      tc.fillRect(0, cellDev - gap, cellDev, gap);
      grid = ctx.createPattern(t, 'repeat');
    }
    ink = readInk(inkHex);
    ink2 = ink2Hex ? readInk(ink2Hex) : null;
    sample();
  }

  // jas buňky = průměr ss×ss vzorků zdroje (volá se znovu, když se zdroj mění)
  function sample() {
    if (!img || !cols) return;
    const ss = 3;
    src.width = cols * ss; src.height = rows * ss;
    sctx.imageSmoothingQuality = 'high';
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, src.width, src.height);
    sctx.drawImage(img, 0, 0, src.width, src.height);
    const d = sctx.getImageData(0, 0, src.width, src.height).data;
    if (!lum || lum.length !== cols * rows) lum = new Float32Array(cols * rows);
    if (ink2Hex && (!lum2 || lum2.length !== cols * rows)) lum2 = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        for (let j = 0; j < ss; j++) {
          let o = ((y * ss + j) * src.width + x * ss) * 4;
          for (let i = 0; i < ss; i++, o += 4) sum += .2126 * d[o] + .7152 * d[o + 1] + .0722 * d[o + 2];
        }
        let l = sum / (ss * ss * 255);
        if (invert) l = 1 - l;
        if (lum2) { let m = (l - black2) / (white2 - black2); lum2[y * cols + x] = m < 0 ? 0 : m > 1 ? 1 : m; }
        l = (l - black) / (white - black);
        l = l < 0 ? 0 : l > 1 ? 1 : l;
        lum[y * cols + x] = Math.pow(l, gamma);
      }
    }
  }

  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

  // středy rozsvícených buněk z posledního vykreslení (CSS px uvnitř canvasu) + velikost bodu
  function cells() {
    const list = [];
    if (out) {
      const d = out.data;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          if (d[(y * cols + x) * 4 + 3]) list.push([(x + .5) * cellCss, (y + .5) * cellCss]);
    }
    return { cells: list, size: Math.max(1, cellCss - gapCss) };
  }

  // boost: zesílení jasu (0–1), flicker: náhodné chvění prahu, t: čas v s (pohyb rozostření)
  function render(boost = 0, flicker = 0, t = performance.now() / 1000) {
    if (!lum) return;
    const d = out.data, [r, g, b] = ink;
    const gain = 1 + boost;
    for (let y = 0, j = 0; y < rows; y++) {
      const by = BAYER4[y & 3];
      for (let x = 0; x < cols; x++, j++) {
        const t = (by[x & 3] + .5) / 16;
        // šum jen tam, kde něco je — do černé okolo se nikdy nerozsype
        const n = flicker && lum[j] > 0 ? (Math.random() - .5) * flicker : 0;
        const v = lum[j] * gain + n;
        const o = j * 4;
        if (v > t) { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; }
        else if (ink2 && lum2[j] * gain + n > t) { d[o] = ink2[0]; d[o + 1] = ink2[1]; d[o + 2] = ink2[2]; d[o + 3] = 255; }
        else d[o + 3] = 0;
      }
    }
    lctx.putImageData(out, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
    if (grid) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grid;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (blur) softSpots(t);
  }

  // v místech plujících skvrn nahradí ostré body měkkou verzí
  function softSpots(t) {
    const W = canvas.width, H = canvas.height;
    const mw = mask.width, mh = mask.height;
    mctx.clearRect(0, 0, mw, mh);
    if (haze) { mctx.fillStyle = `rgba(0,0,0,${haze})`; mctx.fillRect(0, 0, mw, mh); }   // základní opar
    for (const b of blobs) {
      const cx = (.5 + .4 * Math.sin(t * b.sx + b.px)) * mw;
      const cy = (.5 + .4 * Math.cos(t * b.sy + b.py)) * mh;
      const r  = b.r * blobScale * Math.max(mw, mh);
      const g  = mctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
      mctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // měkká verze: body zmenšené a bilineárně roztažené se slijí do plochy
    fctx.imageSmoothingEnabled = true;
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, soft.width, soft.height);
    fctx.drawImage(low, 0, 0, soft.width, soft.height);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(mask, 0, 0, soft.width, soft.height);
    // ostré body ve skvrnách odstranit, měkké vložit
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(soft, 0, 0, W, H);
  }

  // false = canvas nejde přečíst (např. file:// v Chromu) -> zůstane fotka
  function setImage(image) {
    img = image;
    try { layout(); } catch (e) { img = null; lum = null; return false; }
    render();
    return true;
  }

  window.addEventListener('resize', () => { if (img) { layout(); render(); } });
  function setSoft(o) { if (o.haze != null) haze = o.haze; if (o.blobScale != null) blobScale = o.blobScale; }
  function setInk(hex, hex2) { inkHex = hex; ink = readInk(hex); if (hex2 !== undefined) { ink2Hex = hex2; ink2 = hex2 ? readInk(hex2) : null; } }
  return { setImage, layout, sample, render, clear, cells, setSoft, setInk };
}

function loadImage(src) {
  return new Promise(res => {
    const im = new Image();
    im.onload  = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// ořízne průhledné okraje obrázku (vrátí canvas s těsným výřezem)
function trimAlpha(im, pad = 6) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0, i = 3; y < c.height; y++) {
    for (let xx = 0; xx < c.width; xx++, i += 4) {
      if (d[i] > 10) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return im;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const o = document.createElement('canvas');
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

// je prvek aspoň částečně ve viewportu?
function onScreen(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
}

// ─ Rastrované znaky (šipka, otazník) ──────────────────────
// Znak se kreslí do zdrojového canvasu s rozmazanými hranami (rastr se na okrajích rozpadá),
// sekaně ~11× za s: smyčka 2,3 s — 1,1 s odkrývání shora dolů po krocích, do 1,7 drží, pak mizí ve stupních.
// Při hoveru bliká jen znak sám (náhodně zhasne / rozsvítí), okolí zůstává černé.
// dir: 'down' = odkrývá se shora dolů, 'left' = zprava doleva
function makeGlyph(canvas, W, H, paint, hoverEl, onHover, dir = 'down') {
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const ctx = src.getContext('2d');
  const dith = createDither(canvas, { cell: 3, gap: 1, black: .05, white: .9, blur: 2, width: () => W });
  dith.setImage(src);
  const g = { src, dith, hover: false, next: 0 };

  // reveal = kolik je odkryto shora (0–1), l = jas
  g.paint = (reveal, l) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    if (dir === 'left') { const w = Math.round(W * reveal / 3) * 3; ctx.rect(W - w, 0, w, H); }   // po sloupcích rastru
    else ctx.rect(0, 0, W, Math.round(H * reveal / 3) * 3);                                         // po řádcích rastru
    ctx.clip();
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = `rgb(${l},${l},${l})`;
    paint(ctx, W, H);
    ctx.filter = 'none';
    ctx.restore();
  };

  g.tick = now => {
    if (now < g.next) return;
    g.next = now + 90;
    if (g.hover) g.paint(1, Math.random() < .45 ? 0 : 255);
    else {
      const p = (now / 1000) % 2.3;
      const reveal = Math.min(1, Math.floor(p / 1.1 * 8) / 8);
      const fade   = p < 1.7 ? 1 : Math.ceil((1 - (p - 1.7) / .6) * 4) / 4;
      g.paint(reveal, Math.round(255 * fade));
    }
    dith.sample();
    dith.render(0, g.hover ? .8 : .35);
  };

  hoverEl.addEventListener('mouseenter', () => { g.hover = true;  if (onHover) onHover.enter(); });
  hoverEl.addEventListener('mouseleave', () => { g.hover = false; if (onHover) onHover.leave(); });
  return g;
}

// hrany (Sobel) přimíchané jako světlé linky — tvar obalu a kazety pak v rastru drží
function edgeBoost(x, W, H, gain = 1.3) {
  const d = x.getImageData(0, 0, W, H), s = d.data, L = new Float32Array(W * H);
  for (let i = 0, j = 0; i < s.length; i += 4, j++) L[j] = .2126 * s[i] + .7152 * s[i + 1] + .0722 * s[i + 2];
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const i = y * W + xx;
    const gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
    const gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
    const e = Math.min(255, Math.hypot(gx, gy) * .9 * gain), o = i * 4;
    if (e > s[o]) { s[o] = e; s[o + 1] = e; s[o + 2] = e; }
  }
  x.putImageData(d, 0, 0);
}
