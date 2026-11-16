import { FRAMES } from './frames.js';
import { cloud } from './supabase.js';
import { listFrames, putFrame, removeFrame, migrateFrames } from './store.js';
import { detectFromDataURL } from './detect.js';

/* ── tiny DOM helpers ─────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  kids.flat().forEach((k) => k && node.append(k));
  return node;
}

const FILTERS = {
  none: { label: 'Original', css: '', dot: '#e6dbe9' },
  soft: { label: 'Soft', css: 'brightness(1.06) contrast(.95) saturate(1.06)', dot: '#ffd7e6' },
  film: { label: 'Film', css: 'contrast(1.08) saturate(.9) sepia(.18)', dot: '#e8d0b0' },
  bw: { label: 'B&W', css: 'grayscale(1) contrast(1.05)', dot: '#c9c9d1' },
  warm: { label: 'Warm', css: 'sepia(.25) saturate(1.2) hue-rotate(-8deg)', dot: '#ffc9a0' },
  cool: { label: 'Cool', css: 'saturate(1.12) hue-rotate(10deg) brightness(1.02)', dot: '#b6d8ff' },
  fade: { label: 'Fade', css: 'contrast(.9) brightness(1.08) saturate(.85)', dot: '#efe6dc' },
  vivid: { label: 'Vivid', css: 'saturate(1.4) contrast(1.06)', dot: '#ffb3c7' },
};

const LS_GALLERY = 'snapstyle.gallery';

const CALIBRATE = new URLSearchParams(location.search).get('calibrate') === '1';

const state = {
  mode: 'booth',
  user: null,
  frame: null,
  slots: [],
  photos: [],
  selected: 0,
  filter: 'none',
  myFrames: [],
  stream: null,
  theme: 'All',
  editingId: null,
};

/* ── toast ───────────────────────────────────────────────────── */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ── floaters ────────────────────────────────────────────────── */
(function floaters() {
  const box = $('#floaters');
  const glyphs = ['♡', '✿', '★', '❀', '✦', '♡', '☾'];
  for (let i = 0; i < 14; i++) {
    const s = el('i', { text: glyphs[i % glyphs.length] });
    s.style.left = `${Math.random() * 100}%`;
    s.style.fontSize = `${14 + Math.random() * 16}px`;
    s.style.animationDuration = `${16 + Math.random() * 16}s`;
    s.style.animationDelay = `${-Math.random() * 20}s`;
    s.style.color = ['#f7a8c4', '#c9b6f2', '#ffcfae', '#a9cdf5'][i % 4];
    box.append(s);
  }
})();

/* ── routing ─────────────────────────────────────────────────── */
const SCREENS = ['login', 'home', 'frames', 'booth', 'editor', 'studio', 'gallery'];

function show(name) {
  SCREENS.forEach((s) => $(`#screen-${s}`).classList.toggle('active', s === name));
  if (name !== 'booth') stopCamera();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── auth ────────────────────────────────────────────────────── */
let authMode = 'signin';

function setUser(user) {
  state.user = user;
  const email = user?.email ?? '';
  $('#home-user').textContent = user ? email.split('@')[0] : 'Guest';
  $('#home-name').textContent = user ? email.split('@')[0] : 'cutie';
  $('#btn-logout').classList.toggle('hidden', !user);
}

$$('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    authMode = tab.dataset.tab;
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('#auth-submit').textContent = authMode === 'signin' ? 'Let’s Snap!' : 'Create account';
    $('#auth-password').setAttribute('autocomplete', authMode === 'signin' ? 'current-password' : 'new-password');
    $('#auth-msg').textContent = '';
  }),
);

$('#pw-toggle').addEventListener('click', () => {
  const pw = $('#auth-password');
  const hidden = pw.type === 'password';
  pw.type = hidden ? 'text' : 'password';
  $('#pw-toggle').textContent = hidden ? '🙈' : '👁';
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const msg = $('#auth-msg');
  msg.className = 'msg';
  if (!email || password.length < 6) {
    msg.textContent = 'Enter your email and a password of 6+ characters.';
    return;
  }
  const btn = $('#auth-submit');
  btn.disabled = true;
  btn.textContent = 'One moment…';
  try {
    if (authMode === 'signin') {
      const user = await cloud.signIn(email, password);
      setUser(user);
      show('home');
      toast('Welcome back 💖');
    } else {
      const { user, session } = await cloud.signUp(email, password);
      if (session && user) {
        setUser(user);
        show('home');
        toast('Account created ✿');
      } else {
        msg.className = 'msg ok';
        msg.textContent = 'Check your inbox to confirm your email, then sign in.';
      }
    }
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'signin' ? 'Let’s Snap!' : 'Create account';
  }
});

$('#btn-google').addEventListener('click', async () => {
  try {
    await cloud.signInWithGoogle();
  } catch (err) {
    $('#auth-msg').textContent = err.message;
  }
});

$('#btn-guest').addEventListener('click', () => {
  setUser(null);
  show('home');
  toast('Guest mode — photos stay on this device');
});

$('#btn-logout').addEventListener('click', async () => {
  await cloud.signOut();
  setUser(null);
  show('login');
});

/* ── frame registry ──────────────────────────────────────────── */
function allFrames() {
  return [...FRAMES, ...state.myFrames];
}

function thumbFor(frame, opts = {}) {
  const card = el('button', { class: 'frame-card', type: 'button' });
  card.style.aspectRatio = `${frame.ratio[0]} / ${frame.ratio[1]}`;
  const img = el('img', {
    src: frame.thumb || frame.bg || frame.art || frame.fg,
    alt: frame.name,
    loading: 'lazy',
  });
  card.append(img);
  if (frame.fg) {
    const fg = el('img', { src: frame.fg, alt: '' });
    fg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none';
    card.append(fg);
  }
  card.append(el('span', { class: 'tag' }, el('span', { text: frame.name }), el('b', { text: `${frame.slots.length}` })));
  if (opts.editable) {
    card.append(
      el('span', {
        class: 'del edit',
        text: '✎',
        title: 'Edit windows',
        onclick: (e) => {
          e.stopPropagation();
          editMyFrame(frame);
        },
      }),
    );
  }
  if (opts.deletable) {
    const del = el('span', {
      class: 'del',
      text: '✕',
      onclick: async (e) => {
        e.stopPropagation();
        state.myFrames = state.myFrames.filter((f) => f.id !== frame.id);
        await removeFrame(frame.id);
        renderPicker();
        renderMyGrid();
        renderHomeStrip();
        toast('Frame removed');
      },
    });
    card.append(del);
  }
  card.addEventListener('click', () => chooseFrame(frame));
  return card;
}

function renderHomeStrip() {
  const strip = $('#home-strip');
  strip.innerHTML = '';
  allFrames().slice(0, 10).forEach((f) => {
    const mini = el('button', { class: 'mini', type: 'button', 'aria-label': f.name });
    mini.append(el('img', { src: f.thumb || f.bg || f.art || f.fg, alt: f.name, loading: 'lazy' }));
    if (f.fg) {
      const fg = el('img', { src: f.fg, alt: '' });
      fg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
      mini.style.position = 'relative';
      mini.append(fg);
    }
    mini.addEventListener('click', () => chooseFrame(f));
    strip.append(mini);
  });
}

function renderPicker() {
  const frames = allFrames();
  const themes = ['All', ...new Set(frames.map((f) => f.theme))];
  if (!themes.includes(state.theme)) state.theme = 'All';

  const tabs = $('#frame-tabs');
  tabs.innerHTML = '';
  themes.forEach((t) => {
    const b = el('button', { class: 'ft' + (t === state.theme ? ' active' : ''), type: 'button', text: t });
    b.addEventListener('click', () => {
      state.theme = t;
      renderPicker();
    });
    tabs.append(b);
  });

  const grid = $('#frame-grid');
  grid.innerHTML = '';
  const list = state.theme === 'All' ? frames : frames.filter((f) => f.theme === state.theme);
  list.forEach((f) => grid.append(thumbFor(f, { deletable: f.id.startsWith('my-') })));
  $('#frame-count').textContent = `${list.length} frames`;
}

function chooseFrame(frame) {
  if (!frame.slots.length) {
    toast('This frame has no windows yet.');
    return;
  }
  state.frame = frame;
  state.slots = frame.slots.map(() => ({ src: null, scale: 1, ox: 0, oy: 0 }));
  state.photos = [];
  state.selected = 0;
  state.filter = 'none';

  if (state.mode === 'booth') {
    show('booth');
    $('#booth-title').textContent = frame.name;
    renderShots();
    startCamera();
  } else {
    show('editor');
    renderEditor();
    if (!CALIBRATE) setTimeout(() => $('#file-editor').click(), 120);
  }
}

/* ── camera booth ────────────────────────────────────────────── */
async function startCamera() {
  const video = $('#video');
  const note = $('#cam-note');
  note.classList.add('hidden');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1706 } },
      audio: false,
    });
    // The user may have left the booth while the camera was still starting.
    if (!$('#screen-booth').classList.contains('active')) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    note.classList.remove('hidden');
    note.textContent = 'Camera blocked — upload photos instead (or allow camera access).';
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  const v = $('#video');
  if (v && v.srcObject) v.srcObject = null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function countdown(seconds = 3) {
  const box = $('#countdown');
  for (let i = seconds; i > 0; i--) {
    box.textContent = String(i);
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
    await sleep(680);
  }
  box.textContent = '';
}

async function takeShot() {
  const video = $('#video');
  if (!video.videoWidth) {
    toast('No camera — use “Upload photos” instead.');
    return;
  }
  const btn = $('#btn-shutter');
  btn.disabled = true;
  await countdown(3);
  const w = video.videoWidth;
  const h = video.videoHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  const flash = $('#flash');
  flash.classList.remove('on');
  void flash.offsetWidth;
  flash.classList.add('on');

  addPhoto(cv.toDataURL('image/jpeg', 0.92));
  btn.disabled = false;
}

function nextEmptySlot() {
  const i = state.slots.findIndex((s) => !s.src);
  return i === -1 ? -1 : i;
}

function addPhoto(src) {
  state.photos.push(src);
  const i = nextEmptySlot();
  if (i !== -1) {
    state.slots[i].src = src;
    state.slots[i].scale = 1;
    state.slots[i].ox = 0;
    state.slots[i].oy = 0;
  }
  renderShots();
  if ($('#screen-editor').classList.contains('active')) {
    renderStage();
    renderTray();
  }
  updateBoothCount();
}

function renderShots() {
  const strip = $('#captured-strip');
  strip.innerHTML = '';
  state.photos.forEach((src) => {
    const s = el('div', { class: 'shot' });
    s.append(el('img', { src, alt: '' }));
    strip.append(s);
  });
  updateBoothCount();
}

function updateBoothCount() {
  if (!state.frame) return;
  const filled = state.slots.filter((s) => s.src).length;
  $('#booth-count').textContent = `${filled} / ${state.slots.length}`;
}

$('#btn-shutter').addEventListener('click', () => takeShot());

$('#btn-upload-booth').addEventListener('click', () => $('#file-booth').click());
$('#file-booth').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const f of files) addPhoto(await normalizePhoto(await fileToDataURL(f)));
  if (state.photos.length) toast('Added your photos');
});

$('#btn-booth-done').addEventListener('click', () => {
  if (!state.photos.length) {
    toast('Take or upload at least one photo first.');
    return;
  }
  show('editor');
  renderEditor();
});

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ── editor ──────────────────────────────────────────────────── */
const stage = $('#stage');
let drag = null;

function sizeStage() {
  const wrap = $('#stage-wrap');
  if (!state.frame || !wrap) return;
  const [rw, rh] = state.frame.ratio;
  const maxW = wrap.clientWidth;
  const maxH = wrap.clientHeight;
  const scale = Math.min(maxW / rw, maxH / rh);
  stage.style.width = `${Math.round(rw * scale)}px`;
  stage.style.height = `${Math.round(rh * scale)}px`;
}

/* ── frame layers ────────────────────────────────────────────────
   When a design is white-on-white the artwork has to sit above the
   photos, so the frame's own border stays crisp. To keep the photos
   visible we punch the detected windows out of that overlay. */
function frameBg(f) {
  if (f.art) return f.artAbove ? plainWhite() : f.art;
  return f.bg || plainWhite();
}

function frameOverlay(f) {
  return f.artAbove ? f.art || f.fg : f.fg || null;
}

function punchWindows(ctx, slots, w, h) {
  ctx.globalCompositeOperation = 'destination-out';
  for (const s of slots) {
    const pw = s.w * w;
    const ph = s.h * h;
    ctx.save();
    ctx.translate(s.x * w + pw / 2, s.y * h + ph / 2);
    if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
    roundRectPath(ctx, -pw / 2, -ph / 2, pw, ph, Math.min(pw, ph) * (s.radius || 0) * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

async function paintOverlay(canvas, src, slots, host) {
  try {
    const img = await loadImage(src);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    punchWindows(ctx, slots, canvas.width, canvas.height);
  } catch (err) {
    console.warn('overlay failed', err);
  }
}

async function drawOverlay(ctx, src, slots, outW, outH) {
  const img = await loadImage(src);
  const layer = document.createElement('canvas');
  layer.width = outW;
  layer.height = outH;
  const lc = layer.getContext('2d');
  lc.drawImage(img, 0, 0, outW, outH);
  punchWindows(lc, slots, outW, outH);
  ctx.drawImage(layer, 0, 0);
}

function renderEditor() {
  $('#editor-title').textContent = state.frame?.name ?? 'Style';
  renderStage();
  renderTray();
  renderFilters();
  sizeStage();
  updateZoomUI();
}

function renderStage() {
  const f = state.frame;
  if (!f) return;
  stage.innerHTML = '';
  stage.style.background = f.artAbove ? '#ffffff' : 'transparent';

  stage.append(el('img', { class: 'layer bg', src: frameBg(f), alt: '' }));

  f.slots.forEach((s, i) => {
    const st = state.slots[i];
    const node = el('div', {
      class: 'slot' + (i === state.selected ? ' sel' : '') + (st.src ? ' filled' : ''),
      'data-i': String(i),
    });
    node.style.left = `${s.x * 100}%`;
    node.style.top = `${s.y * 100}%`;
    node.style.width = `${s.w * 100}%`;
    node.style.height = `${s.h * 100}%`;
    node.style.borderRadius = `${(s.radius || 0) * 100}%`;
    if (s.rot) node.style.transform = `rotate(${s.rot}deg)`;

    if (st.src) {
      const img = el('img', { class: 'photo', src: st.src, alt: '', draggable: 'false' });
      img.style.transform = `translate(${st.ox}%, ${st.oy}%) scale(${st.scale})`;
      if (FILTERS[state.filter]?.css) img.style.filter = FILTERS[state.filter].css;
      node.append(img);
    } else {
      node.append(el('div', { class: 'empty', text: '+ photo' }));
    }
    stage.append(node);
  });

  const overlaySrc = frameOverlay(f);
  if (overlaySrc) {
    if (f.artAbove) {
      const layer = document.createElement('canvas');
      layer.className = 'layer over';
      stage.append(layer);
      paintOverlay(layer, overlaySrc, f.slots, stage);
    } else {
      stage.append(el('img', { class: 'layer over', src: overlaySrc, alt: '' }));
    }
  }
  $('#slot-hint').textContent = f.slots.length > 1
    ? 'Tap a window, then drag to align it. Pinch-free zoom below.'
    : 'Drag your photo to align it inside the window.';
}

function maxOffset(scale) {
  return (100 * (scale - 1)) / (2 * scale);
}

function selectSlot(i) {
  state.selected = i;
  $$('.slot', stage).forEach((n, k) => n.classList.toggle('sel', k === i));
  updateZoomUI();
}

stage.addEventListener('pointerdown', (e) => {
  const node = e.target.closest('.slot');
  if (!node) return;
  const i = Number(node.dataset.i);
  selectSlot(i);
  const st = state.slots[i];
  if (!st.src) return;
  const r = node.getBoundingClientRect();
  drag = { i, node, x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, w: r.width, h: r.height };
  node.setPointerCapture(e.pointerId);
  node.style.cursor = 'grabbing';
});

stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const st = state.slots[drag.i];
  const k = 100 / (drag.w * st.scale);
  const lim = maxOffset(st.scale);
  st.ox = clamp(drag.ox + (e.clientX - drag.x) * k, -lim, lim);
  st.oy = clamp(drag.oy + (e.clientY - drag.y) * k, -lim, lim);
  const img = drag.node.querySelector('.photo');
  if (img) img.style.transform = `translate(${st.ox}%, ${st.oy}%) scale(${st.scale})`;
});

['pointerup', 'pointercancel'].forEach((evt) =>
  stage.addEventListener(evt, () => {
    if (!drag) return;
    drag.node.style.cursor = 'grab';
    drag = null;
  }),
);

stage.addEventListener(
  'wheel',
  (e) => {
    const node = e.target.closest('.slot');
    if (!node) return;
    const i = Number(node.dataset.i);
    const st = state.slots[i];
    if (!st.src) return;
    e.preventDefault();
    st.scale = clamp(st.scale - e.deltaY * 0.0016, 1, 3);
    applyTransform(i);
    updateZoomUI();
  },
  { passive: false },
);

/* ── pinch to zoom the selected window (touch) ──────────────── */
const pointers = new Map();
let pinch = null;

function pinchDistance() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

stage.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size !== 2) return;
  drag = null;
  const st = state.slots[state.selected];
  if (st && st.src) pinch = { start: pinchDistance(), scale: st.scale };
});

stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || pointers.size < 2) return;
  const st = state.slots[state.selected];
  if (!st || !st.src) return;
  const d = pinchDistance();
  if (!d || !pinch.start) return;
  st.scale = clamp((pinch.scale * d) / pinch.start, 1, 3);
  const lim = maxOffset(st.scale);
  st.ox = clamp(st.ox, -lim, lim);
  st.oy = clamp(st.oy, -lim, lim);
  applyTransform(state.selected);
  updateZoomUI();
});

['pointerup', 'pointercancel'].forEach((evt) =>
  stage.addEventListener(evt, (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  }),
);

function applyTransform(i) {
  const st = state.slots[i];
  const node = stage.querySelector(`.slot[data-i="${i}"]`);
  const img = node?.querySelector('.photo');
  if (!img) return;
  img.style.transform = `translate(${st.ox}%, ${st.oy}%) scale(${st.scale})`;
}

function updateZoomUI() {
  const st = state.slots[state.selected];
  const zoom = $('#zoom');
  if (!zoom) return;
  zoom.value = String(st ? st.scale : 1);
  zoom.disabled = !(st && st.src);
}

$('#zoom').addEventListener('input', (e) => {
  const st = state.slots[state.selected];
  if (!st || !st.src) return;
  st.scale = Number(e.target.value);
  const lim = maxOffset(st.scale);
  st.ox = clamp(st.ox, -lim, lim);
  st.oy = clamp(st.oy, -lim, lim);
  applyTransform(state.selected);
});

$('#btn-reset-slot').addEventListener('click', () => {
  const st = state.slots[state.selected];
  if (!st) return;
  st.scale = 1;
  st.ox = 0;
  st.oy = 0;
  applyTransform(state.selected);
  updateZoomUI();
  toast('Aligned to centre');
});

$('#btn-clear-slot').addEventListener('click', () => {
  const st = state.slots[state.selected];
  if (!st || !st.src) return;
  Object.assign(st, { src: null, scale: 1, ox: 0, oy: 0 });
  renderStage();
  renderTray();
  updateZoomUI();
});

$('#btn-fill-all').addEventListener('click', () => {
  const st = state.slots[state.selected];
  const src = st?.src;
  if (!src) {
    toast('Pick a filled window first.');
    return;
  }
  state.slots.forEach((s, i) => {
    if (!s.src) {
      s.src = src;
      s.scale = 1;
      s.ox = 0;
      s.oy = 0;
    }
  });
  renderStage();
  renderTray();
  toast('Filled every window');
});

function renderTray() {
  const tray = $('#tray');
  tray.innerHTML = '';
  state.photos.forEach((src, i) => {
    const used = state.slots.some((s) => s.src === src);
    const b = el('button', { class: 'ph' + (used ? ' on' : ''), type: 'button', 'aria-label': `Photo ${i + 1}` });
    b.append(el('img', { src, alt: '' }));
    b.addEventListener('click', () => {
      const st = state.slots[state.selected];
      if (!st) return;
      st.src = src;
      st.scale = 1;
      st.ox = 0;
      st.oy = 0;
      renderStage();
      renderTray();
      updateZoomUI();
      const next = nextEmptySlot();
      if (next !== -1) selectSlot(next);
    });
    tray.append(b);
  });
  const add = el('button', { class: 'ph add', type: 'button', text: '+' });
  add.addEventListener('click', () => $('#file-editor').click());
  tray.append(add);
}

$('#btn-add-photo').addEventListener('click', () => $('#file-editor').click());
$('#file-editor').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const f of files) addPhoto(await normalizePhoto(await fileToDataURL(f)));
  renderStage();
  renderTray();
  updateZoomUI();
});

function renderFilters() {
  const row = $('#filter-row');
  row.innerHTML = '';
  Object.entries(FILTERS).forEach(([key, f]) => {
    const b = el(
      'button',
      { class: 'chip' + (key === state.filter ? ' on' : ''), type: 'button' },
      el('span', { class: 'dot' }),
      el('span', { text: f.label }),
    );
    b.querySelector('.dot').style.background = f.dot;
    b.addEventListener('click', () => {
      state.filter = key;
      renderFilters();
      $$('.photo', stage).forEach((img) => {
        img.style.filter = f.css || '';
      });
    });
    row.append(b);
  });
}

/* ── export / save ───────────────────────────────────────────── */
const imgCache = new Map();

function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function composeCanvas(outWidth = 1080) {
  const f = state.frame;
  const outW = outWidth;
  const outH = Math.round((outW * f.ratio[1]) / f.ratio[0]);
  const cv = document.createElement('canvas');
  cv.width = outW;
  cv.height = outH;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  const bg = await loadImage(frameBg(f));
  ctx.drawImage(bg, 0, 0, outW, outH);

  const cssFilter = FILTERS[state.filter]?.css || '';

  for (let i = 0; i < f.slots.length; i++) {
    const s = f.slots[i];
    const st = state.slots[i];
    if (!st || !st.src) continue;

    const pw = s.w * outW;
    const ph = s.h * outH;
    const cx = s.x * outW + pw / 2;
    const cy = s.y * outH + ph / 2;

    const img = await loadImage(st.src);
    const ratio = pw / ph;
    const ir = img.width / img.height;
    let dw;
    let dh;
    if (ir > ratio) {
      dh = ph;
      dw = dh * ir;
    } else {
      dw = pw;
      dh = dw / ir;
    }
    dw *= st.scale;
    dh *= st.scale;

    ctx.save();
    ctx.translate(cx, cy);
    if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
    roundRectPath(ctx, -pw / 2, -ph / 2, pw, ph, ((pw + ph) / 2) * (s.radius || 0));
    ctx.clip();
    if (cssFilter) ctx.filter = cssFilter;
    ctx.drawImage(
      img,
      -dw / 2 + (st.ox / 100) * pw * st.scale,
      -dh / 2 + (st.oy / 100) * ph * st.scale,
      dw,
      dh,
    );
    ctx.restore();
  }

  const overlaySrc = frameOverlay(f);
  if (overlaySrc) {
    if (f.artAbove) {
      await drawOverlay(ctx, overlaySrc, f.slots, outW, outH);
    } else {
      const fg = await loadImage(overlaySrc);
      ctx.drawImage(fg, 0, 0, outW, outH);
    }
  }
  return cv;
}

function canvasToBlob(cv) {
  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

$('#btn-export').addEventListener('click', async () => {
  if (!state.slots.some((s) => s.src)) {
    toast('Add a photo first.');
    return;
  }
  const btn = $('#btn-export');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const cv = await composeCanvas(1080);
    const blob = await canvasToBlob(cv);
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `snapstyle-${Date.now()}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Saved to your device 💾');
  } catch (err) {
    console.error(err);
    toast('Export failed — try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export';
  }
});

/* ── gallery ─────────────────────────────────────────────────── */
function localGallery() {
  try {
    return JSON.parse(localStorage.getItem(LS_GALLERY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalGallery(url) {
  const list = localGallery();
  list.unshift({ id: `local-${Date.now()}`, url, created_at: new Date().toISOString() });
  const trimmed = list.slice(0, 8);
  try {
    localStorage.setItem(LS_GALLERY, JSON.stringify(trimmed));
    return true;
  } catch {
    toast('Local gallery is full — sign in to save in the cloud.');
    return false;
  }
}

$('#btn-save').addEventListener('click', async () => {
  if (!state.slots.some((s) => s.src)) {
    toast('Add a photo first.');
    return;
  }
  const btn = $('#btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const cv = await composeCanvas(1080);
    const blob = await canvasToBlob(cv);
    if (state.user) {
      try {
        await cloud.saveSnap(blob, {
          frameId: state.frame.id,
          frameName: state.frame.name,
          width: cv.width,
          height: cv.height,
        });
        toast('Saved to your cloud gallery ☁️');
      } catch (err) {
        // Never lose the snap: keep a local copy and say so.
        console.error(err);
        const url = cv.toDataURL('image/jpeg', 0.82);
        saveLocalGallery(url);
        toast('Cloud save failed — kept a copy on this device.');
      }
    } else {
      const url = cv.toDataURL('image/jpeg', 0.82);
      if (saveLocalGallery(url)) toast('Saved on this device — sign in to sync.');
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not save.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to gallery';
  }
});

async function renderGallery() {
  const grid = $('#gallery-grid');
  const msg = $('#gallery-msg');
  grid.innerHTML = '';
  msg.textContent = '';

  let items = [];
  if (state.user) {
    try {
      items = await cloud.listSnaps();
      if (!items.length) msg.textContent = 'No cloud snaps yet. Save one from the editor.';
    } catch (err) {
      msg.textContent = err.message;
    }
  } else {
    items = localGallery();
    msg.textContent = 'Guest mode — saved on this device only. Sign in to keep a cloud gallery.';
  }

  $('#gallery-count').textContent = `${items.length} photos`;
  items.forEach((it) => {
    const cell = el('div', { class: 'cell' });
    cell.append(el('img', { src: it.url, alt: it.name || 'Snap', loading: 'lazy' }));
    cell.append(el('a', { href: it.url, target: '_blank', rel: 'noopener', download: '' }));
    grid.append(cell);
  });
}

/* ── studio: build frames from your own artwork ──────────────── */
const studio = {
  art: null,
  ratio: [2, 3],
  slots: [],
  baseSlots: [],
  trim: 0,
  artAbove: false,
  selected: -1,
  editingId: null,
};

function insetSlot(s, f) {
  if (!f) return { ...s };
  const dw = s.w * f;
  const dh = s.h * f;
  return {
    ...s,
    x: s.x + dw / 2,
    y: s.y + dh / 2,
    w: Math.max(0.01, s.w - dw),
    h: Math.max(0.01, s.h - dh),
  };
}

/** Keep the un-trimmed geometry in sync after a manual drag/resize. */
function syncBase(i) {
  if (!studio.baseSlots[i]) return;
  const s = studio.slots[i];
  const f = studio.trim;
  if (!f) {
    studio.baseSlots[i] = { ...s };
    return;
  }
  const w = s.w / (1 - f);
  const h = s.h / (1 - f);
  studio.baseSlots[i] = { ...s, x: s.x - (w * f) / 2, y: s.y - (h * f) / 2, w, h };
}

/** Re-open a saved frame in the studio to adjust its windows. */
function editMyFrame(frame) {
  const art = frame.art || (frame.artAbove ? frame.fg : frame.bg) || null;
  studio.art = art;
  studio.ratio = frame.ratio || [2, 3];
  studio.slots = frame.slots.map((s) => ({ ...s }));
  studio.baseSlots = studio.slots.map((s) => ({ ...s }));
  studio.trim = 0;
  studio.selected = -1;
  studio.artAbove = !!frame.artAbove;
  studio.editingId = frame.id;

  if (![...$('#studio-theme').options].some((o) => o.value === frame.theme)) {
    $('#studio-theme').append(el('option', { text: frame.theme, value: frame.theme }));
  }
  $('#studio-above').checked = studio.artAbove;
  $('#studio-name').value = frame.name || '';
  $('#studio-theme').value = frame.theme || 'My Frames';
  $('#studio-trim').value = '0';
  $('#studio-status').textContent = 'Editing a saved frame — press “Save frame” to apply.';

  show('studio');
  sizeStudioStage();
  renderStudioStage();
}

function resetStudio() {
  studio.art = null;
  studio.slots = [];
  studio.baseSlots = [];
  studio.selected = -1;
  studio.editingId = null;
  studio.trim = 0;
  studio.artAbove = false;
  $('#studio-art').removeAttribute('src');
  $('#studio-name').value = '';
  $('#studio-windows').innerHTML = '';
  $('#studio-list').innerHTML = '';
  $('#studio-status').textContent = '';
  $('#studio-trim').value = '0';
  $('#studio-above').checked = false;
}

function sizeStudioStage() {
  const wrap = $('#studio-wrap');
  const st = $('#studio-stage');
  const [rw, rh] = studio.ratio;
  const scale = Math.min(wrap.clientWidth / rw, wrap.clientHeight / rh);
  st.style.width = `${Math.round(rw * scale)}px`;
  st.style.height = `${Math.round(rh * scale)}px`;
}

function renderStudioStage() {
  const st = $('#studio-stage');
  const artImg = $('#studio-art');
  if (studio.art) artImg.src = studio.art;
  else artImg.removeAttribute('src');
  const layer = $('#studio-windows');
  layer.innerHTML = '';
  st.style.background = studio.art ? '#f3eef7' : '';
  studio.slots.forEach((s, i) => {
    const w = el('div', { class: 'sw' + (i === studio.selected ? ' sel' : ''), 'data-i': String(i) });
    w.style.left = `${s.x * 100}%`;
    w.style.top = `${s.y * 100}%`;
    w.style.width = `${s.w * 100}%`;
    w.style.height = `${s.h * 100}%`;
    if (s.rot) w.style.transform = `rotate(${s.rot}deg)`;
    w.append(el('span', { class: 'idx', text: String(i + 1) }));
    w.append(el('span', { class: 'handle' }));
    layer.append(w);
  });
  renderStudioList();
}

function renderStudioList() {
  const list = $('#studio-list');
  list.innerHTML = '';
  if (!studio.slots.length) return;
  studio.slots.forEach((s, i) => {
    const item = el('div', { class: 'studio-item' });
    item.append(el('span', { text: `Window ${i + 1}` }));
    const range = el('input', { type: 'range', min: '-45', max: '45', step: '1', value: String(s.rot || 0) });
    range.addEventListener('input', (e) => {
      studio.slots[i].rot = Number(e.target.value);
      studio.selected = i;
      renderStudioStage();
    });
    item.append(range);
    item.append(
      el('button', {
        type: 'button',
        text: '✕',
        onclick: () => {
          studio.slots.splice(i, 1);
          studio.selected = -1;
          renderStudioStage();
        },
      }),
    );
    list.append(item);
  });
}

$('#studio-file-btn').addEventListener('click', () => $('#studio-file').click());
$('#studio-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const raw = await fileToDataURL(file);
  const shrunk = await shrinkImage(raw, 1100, 0.84);
  studio.art = shrunk;
  const img = await loadImage(shrunk);
  studio.ratio = [img.width, img.height];
  studio.slots = [];
  studio.baseSlots = [];
  studio.trim = 0;
  studio.selected = -1;
  studio.editingId = null;
  studio.artAbove = false;
  $('#studio-above').checked = false;
  $('#studio-trim').value = '0';
  $('#studio-status').textContent = '';
  sizeStudioStage();
  renderStudioStage();
  toast('Artwork loaded — press Auto-detect to find the windows.');
});

function shrinkImage(src, maxSide, quality) {
  return new Promise(async (resolve) => {
    const img = await loadImage(src);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k);
    cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    resolve(cv.toDataURL('image/jpeg', quality));
  });
}

/** Small preview used by the frame picker (keeps 60+ frames cheap). */
async function makeThumb(src, side = 260) {
  const img = await loadImage(src);
  const k = side / Math.max(img.width, img.height);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * k));
  cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.8);
}

/** Downscale huge uploads so editing and storage stay fast. */
async function normalizePhoto(src, maxSide = 1600) {
  try {
    const img = await loadImage(src);
    if (Math.max(img.width, img.height) <= maxSide) return src;
    const k = maxSide / Math.max(img.width, img.height);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k);
    cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.9);
  } catch {
    return src;
  }
}

$('#studio-add').addEventListener('click', () => {
  if (!studio.art) {
    toast('Upload artwork first.');
    return;
  }
  studio.slots.push({ x: 0.2, y: 0.2, w: 0.4, h: 0.3, rot: 0 });
  studio.selected = studio.slots.length - 1;
  renderStudioStage();
});

$('#studio-detect').addEventListener('click', async () => {
  const status = $('#studio-status');
  if (!studio.art) {
    toast('Upload artwork first.');
    return;
  }
  status.textContent = 'Looking for photo windows…';
  try {
    const { slots, suggestAbove, reason } = await detectFromDataURL(studio.art);
    if (!slots.length) {
      status.textContent = 'No windows found — use “+ Add window” to place them yourself.';
      return;
    }
    studio.slots = slots.map(({ _above, _whiteOnWhite, _transparent, ...s }) => s);
    studio.baseSlots = studio.slots.map((s) => ({ ...s }));
    studio.trim = 0;
    $('#studio-trim').value = '0';
    studio.selected = -1;

    if (suggestAbove) {
      studio.artAbove = true;
      $('#studio-above').checked = true;
    }

    renderStudioStage();
    const note = suggestAbove
      ? reason === 'white'
        ? ' White-on-white frame: “Art sits above photos” switched on for you.'
        : reason === 'transparent'
          ? ' See-through frame: “Art sits above photos” switched on for you.'
          : ' Bright windows: “Art sits above photos” switched on for you.'
      : '';
    status.textContent = `Found ${slots.length} window${slots.length === 1 ? '' : 's'} — nudge a box only if it needs it.${note}`;
    toast(`Detected ${slots.length} window${slots.length === 1 ? '' : 's'} ✨`);
  } catch (err) {
    console.error(err);
    status.textContent = 'Detection failed — add the windows manually.';
  }
});

$('#studio-bulk-btn').addEventListener('click', () => $('#studio-bulk-file').click());

$('#studio-bulk-file').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  const status = $('#studio-status');
  const theme = $('#studio-theme').value;
  let added = 0;
  const skipped = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    status.textContent = `Importing ${i + 1} of ${files.length}…`;
    try {
      const raw = await fileToDataURL(file);
      const art = await shrinkImage(raw, 1100, 0.86);
      const { slots, ratio, suggestAbove } = await detectFromDataURL(art);
      if (!slots.length) {
        skipped.push(file.name);
        continue;
      }
      const frame = {
        id: `my-${Date.now()}-${i}`,
        name:
          (file.name || 'Frame')
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[-_]+/g, ' ')
            .slice(0, 28) || 'Frame',
        theme,
        ratio,
        art,
        artAbove: !!suggestAbove,
        bg: null,
        fg: null,
        thumb: await makeThumb(art).catch(() => null),
        slots: slots.map(({ _above, _whiteOnWhite, _transparent, ...s }) => s),
      };
      if (await putFrame(frame)) {
        state.myFrames.push(frame);
        added++;
      } else {
        skipped.push(file.name);
      }
    } catch (err) {
      console.error(err);
      skipped.push(file.name);
    }
  }

  renderMyGrid();
  renderPicker();
  renderHomeStrip();
  status.textContent =
    `Imported ${added} frame${added === 1 ? '' : 's'}` +
    (skipped.length ? ` · ${skipped.length} need manual setup` : '');
  toast(
    added
      ? `${added} frame${added === 1 ? '' : 's'} ready 🖼`
      : 'No windows detected in those files',
  );
});

$('#studio-above').addEventListener('change', (e) => {
  studio.artAbove = e.target.checked;
});

$('#studio-trim').addEventListener('input', (e) => {
  const value = Number(e.target.value);
  if (!studio.baseSlots.length) {
    if (value > 0) toast('Auto-detect windows first.');
    e.target.value = '0';
    return;
  }
  studio.trim = value;
  studio.slots = studio.baseSlots.map((s) => insetSlot(s, value));
  renderStudioStage();
});

let swDrag = null;

$('#studio-windows').addEventListener('pointerdown', (e) => {
  const node = e.target.closest('.sw');
  if (!node) return;
  const i = Number(node.dataset.i);
  studio.selected = i;
  const rect = $('#studio-stage').getBoundingClientRect();
  const resizing = !!e.target.closest('.handle');
  const s = studio.slots[i];
  swDrag = {
    i,
    resizing,
    startX: e.clientX,
    startY: e.clientY,
    orig: { ...s },
    rect,
    node,
  };
  node.setPointerCapture(e.pointerId);
  $$('.sw').forEach((n, k) => n.classList.toggle('sel', k === i));
});

window.addEventListener('pointermove', (e) => {
  if (!swDrag) return;
  const { rect, orig, resizing } = swDrag;
  const dx = (e.clientX - swDrag.startX) / rect.width;
  const dy = (e.clientY - swDrag.startY) / rect.height;
  const s = studio.slots[swDrag.i];
  if (resizing) {
    s.w = clamp(orig.w + dx, 0.05, 1 - s.x);
    s.h = clamp(orig.h + dy, 0.05, 1 - s.y);
  } else {
    s.x = clamp(orig.x + dx, 0, 1 - s.w);
    s.y = clamp(orig.y + dy, 0, 1 - s.h);
  }
  const node = swDrag.node;
  node.style.left = `${s.x * 100}%`;
  node.style.top = `${s.y * 100}%`;
  node.style.width = `${s.w * 100}%`;
  node.style.height = `${s.h * 100}%`;
});

window.addEventListener('pointerup', () => {
  if (!swDrag) return;
  syncBase(swDrag.i);
  swDrag = null;
  renderStudioList();
});

$('#studio-save').addEventListener('click', async () => {
  if (!studio.art) {
    toast('Upload artwork first.');
    return;
  }
  if (!studio.slots.length) {
    toast('Add at least one photo window.');
    return;
  }
  const name = ($('#studio-name').value || '').trim() || 'My frame';
  const theme = $('#studio-theme').value;
  const editing = studio.editingId;
  const frame = {
    id: editing || `my-${Date.now()}`,
    name,
    theme,
    ratio: studio.ratio,
    art: studio.art,
    artAbove: studio.artAbove,
    bg: null,
    fg: null,
    slots: studio.slots.map((s) => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rot: s.rot || 0,
      radius: s.radius || 0.012,
    })),
  };
  frame.thumb = await makeThumb(studio.art).catch(() => null);
  if (!(await putFrame(frame))) {
    toast('Could not save the frame — browser storage is full.');
    return;
  }
  if (editing) {
    const at = state.myFrames.findIndex((f) => f.id === editing);
    if (at >= 0) state.myFrames[at] = frame;
    else state.myFrames.push(frame);
  } else {
    state.myFrames.push(frame);
  }
  renderMyGrid();
  renderPicker();
  renderHomeStrip();
  toast(editing ? 'Frame updated ✂️' : 'Frame saved ✂️');
  resetStudio();
});

function plainWhite() {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="6"><rect width="4" height="6" fill="#ffffff"/></svg>',
  )}`;
}

function renderMyGrid() {
  const grid = $('#studio-mine');
  grid.innerHTML = '';
  state.myFrames.forEach((f) => grid.append(thumbFor(f, { deletable: true, editable: true })));
}

/* ── navigation buttons ──────────────────────────────────────── */
$$('[data-back]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const target = btn.dataset.back;
    if (target === 'frames' && !state.frame) {
      show('home');
      return;
    }
    show(target);
  }),
);

$('#go-booth').addEventListener('click', () => {
  state.mode = 'booth';
  show('frames');
  renderPicker();
});

$('#go-collage').addEventListener('click', () => {
  state.mode = 'collage';
  show('frames');
  renderPicker();
  toast('Pick a layout, then choose your photos');
});

$('#go-studio').addEventListener('click', () => {
  show('studio');
  renderMyGrid();
  sizeStudioStage();
  renderStudioStage();
});

$('#go-gallery').addEventListener('click', () => {
  show('gallery');
  renderGallery();
});

/* ── boot ────────────────────────────────────────────────────── */
function cloudNote() {
  const note = $('#cloud-note');
  if (note) note.textContent = 'Connecting to cloud…';
}

async function refreshCloudNote() {
  const note = $('#cloud-note');
  if (!note) return;
  const ready = await cloud.init();
  if (!ready) {
    note.textContent = 'Cloud offline — photos and frames save on this device.';
    return;
  }
  const setup = await cloud.checkSetup();
  const problems = [];
  if (setup.table === 'missing') problems.push('gallery table missing');
  if (setup.bucket === 'missing') problems.push('storage bucket missing');
  note.textContent = problems.length
    ? `Cloud reachable, but setup is incomplete (${problems.join(', ')}). Run supabase/schema.sql, then reload — guest mode still works.`
    : 'Cloud ready — sign in to keep a gallery. Guest photos stay on this device.';
}

window.addEventListener('resize', () => {
  sizeStage();
  sizeStudioStage();
});

async function boot() {
  await migrateFrames();
  state.myFrames = await listFrames();
  renderHomeStrip();
  renderPicker();
  renderMyGrid();
  cloudNote();
  refreshCloudNote();

  cloud.onAuth((user) => {
    setUser(user);
    if (user && $('#screen-login').classList.contains('active')) show('home');
  });

  // ?calibrate=1 outlines every photo window over the artwork.
  if (CALIBRATE) {
    state.mode = 'collage';
    document.body.classList.add('calibrating');
    show('frames');
    toast('Calibration mode — every window outline is visible');
  }
}

boot();
