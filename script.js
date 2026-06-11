/* Ondřej Hladík — Klauzurní práce */

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
document.querySelectorAll('.panel img, .obj').forEach(el => io.observe(el));

// ─ Custom cursor ──────────────────────────────────────────
const cur = document.getElementById('cur');
let overCassette = false;

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

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  audioCtx.createMediaElementSource(aud).connect(analyser);
  analyser.connect(audioCtx.destination);
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
const cimg  = document.getElementById('cimg');
const hero  = document.getElementById('hero');
let caseOpen = false;
let tRX = 0, tRY = 0;
let cRX = 0, cRY = 0;
let animTime = 0;
let clickT = -1;

function swapCassetteImg(src, cb) {
  cimg.style.transition = 'opacity .35s ease';
  cimg.style.opacity = '0';
  setTimeout(() => {
    cimg.src = src;
    cimg.style.opacity = '1';
    setTimeout(() => { cimg.style.transition = ''; }, 380);
    if (cb) cb();
  }, 300);
}

function openCase() {
  if (caseOpen) return;
  caseOpen = true;
  swapCassetteImg('assets/photo-tape.jpg');
}

function closeCase() {
  if (!caseOpen) return;
  caseOpen = false;
  swapCassetteImg('assets/photo-case-front.png');
}

cimg.addEventListener('mouseenter', () => { overCassette = true;  setCursorState(true,  playing); });
cimg.addEventListener('mouseleave', () => { overCassette = false; setCursorState(false, playing); });

cimg.addEventListener('click', () => {
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
const wCanvas = document.getElementById('waveform');
const wCtx    = wCanvas.getContext('2d');

function syncWaveformSize() {
  const dpr = Math.min(devicePixelRatio, 2);
  wCanvas.width  = wCanvas.offsetWidth  * dpr;
  wCanvas.height = wCanvas.offsetHeight * dpr;
  wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
syncWaveformSize();
window.addEventListener('resize', syncWaveformSize);

// ─ Animation loop ─────────────────────────────────────────
let wAlpha = 0;

(function loop() {
  requestAnimationFrame(loop);
  animTime += .007;

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

  cimg.style.transform = `rotateX(${(cRX + clickRX).toFixed(3)}deg) rotateY(${cRY.toFixed(3)}deg) translateY(${floatY.toFixed(2)}px) scale(${clickScale.toFixed(4)})`;

  // Waveform
  wAlpha += playing ? (.09 * (1 - wAlpha)) : (-.07 * wAlpha);
  wAlpha  = Math.max(0, Math.min(1, wAlpha));

  const cw = wCanvas.offsetWidth, ch = wCanvas.offsetHeight;
  wCtx.clearRect(0, 0, cw, ch);

  if (wAlpha > .01) {
    if (playing && analyser) analyser.getByteFrequencyData(freqData);
    const n  = freqData ? freqData.length : 64;
    const bw = cw / n;
    for (let i = 0; i < n; i++) {
      const val = freqData ? freqData[i] / 255 : .04;
      const h   = Math.max(.04, val) * ch;
      wCtx.fillStyle = `rgba(136,153,210,${(wAlpha * (.25 + val * .75)).toFixed(3)})`;
      wCtx.fillRect(i * bw + .5, ch - h, Math.max(1, bw - 1.5), h);
    }
  }
})();
