/* ───────────────────────────────────────────────────────────────
   Automatic photo-window detection for uploaded frame artwork.

   Finds flat rectangular regions — the empty photo areas of a design —
   and returns them in the same normalised slot shape the editor uses:
   { x, y, w, h, rot, radius }.

   Two masks are scanned:
     light  → white / bright windows (most polaroids, camera screens)
     dark   → black windows (black polaroids, film frames)

   For each connected region we fit a rotated rectangle from its second
   moments (PCA), then keep only regions whose pixels actually fill that
   rectangle. That rejects circles (vinyl records), blobs (flowers),
   thin strips (film rails) and text while accepting tilted cards.

   For every accepted window we also look at the paper immediately around
   it. White window on white paper means the art has to be drawn ABOVE the
   photos (otherwise the photo would swallow the frame's own border), so
   `suggestAbove` comes back true and the studio ticks that box for you.
   ─────────────────────────────────────────────────────────────── */

const DEFAULTS = {
  maxSide: 820,
  lightMin: 238,
  darkMax: 48,
  alphaMin: 30,
  minAreaFrac: 0.0035,
  maxAreaFrac: 0.55,
  minSide: 20,
  fillMin: 0.86,
  minAspect: 0.22,
  padPx: 1.5,
  ringOffset: 7,   // px outside the window used to sample the surrounding paper
  whitePaper: 232, // luminance that counts as white paper
};

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

export async function detectFromDataURL(src, opts = {}) {
  const img = await loadImg(src);
  return detectWindows(img, opts);
}

export function detectWindows(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const scale = Math.min(1, o.maxSide / Math.max(img.width, img.height));
  const cw = Math.max(8, Math.round(img.width * scale));
  const ch = Math.max(8, Math.round(img.height * scale));

  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  const px = ctx.getImageData(0, 0, cw, ch).data;

  const n = cw * ch;
  const light = new Uint8Array(n);
  const dark = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = px[p + 3];
    if (a < o.alphaMin) {
      light[i] = 1;
      continue;
    }
    if (a < 235) continue;
    const lum = px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114;
    if (lum >= o.lightMin) light[i] = 1;
    else if (lum <= o.darkMax) dark[i] = 1;
  }

  const found = [
    ...regions(light, cw, ch, o, px),
    ...regions(dark, cw, ch, o, px),
  ];
  // A white polaroid card contains its photo window, so both come back as
  // regions. Keep the inner window and drop the card that wraps it.
  const slots = dedupe(dropEnclosing(found));

  const anyWhite = slots.some((s) => s._whiteOnWhite);
  const anyTransparent = slots.some((s) => s._transparent);
  const anyBright = slots.some((s) => s._above);

  return {
    slots,
    ratio: [img.width, img.height],
    suggestAbove: anyBright,
    whiteOnWhite: anyWhite,
    reason: anyWhite ? 'white' : anyTransparent ? 'transparent' : anyBright ? 'bright' : null,
  };
}

/* ── connected regions → rotated rectangles ──────────────────── */
function regions(mask, cw, ch, o, px) {
  const n = cw * ch;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const out = [];
  const minArea = o.minAreaFrac * n;
  const maxArea = o.maxAreaFrac * n;

  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    let sp = 0;
    stack[sp++] = seed;
    visited[seed] = 1;
    const pix = [];

    while (sp) {
      const idx = stack[--sp];
      pix.push(idx);
      const x = idx % cw;
      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack[sp++] = idx - 1;
      }
      if (x < cw - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack[sp++] = idx + 1;
      }
      if (idx >= cw && mask[idx - cw] && !visited[idx - cw]) {
        visited[idx - cw] = 1;
        stack[sp++] = idx - cw;
      }
      if (idx + cw < n && mask[idx + cw] && !visited[idx + cw]) {
        visited[idx + cw] = 1;
        stack[sp++] = idx + cw;
      }
    }

    if (pix.length < minArea || pix.length > maxArea) continue;

    let mx = 0;
    let my = 0;
    for (let i = 0; i < pix.length; i++) {
      const idx = pix[i];
      const x = idx % cw;
      mx += x;
      my += (idx - x) / cw;
    }
    mx /= pix.length;
    my /= pix.length;

    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (let i = 0; i < pix.length; i++) {
      const idx = pix[i];
      const x = idx % cw;
      const y = (idx - x) / cw;
      const dx = x - mx;
      const dy = y - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);

    let ext = extents(pix, cw, mx, my, angle);
    if (ext.h > ext.w) {
      angle += Math.PI / 2;
      ext = extents(pix, cw, mx, my, angle);
    }

    const fill = pix.length / (ext.w * ext.h);
    if (fill < o.fillMin) continue;
    if (Math.min(ext.w, ext.h) < o.minSide) continue;
    if (Math.min(ext.w, ext.h) / Math.max(ext.w, ext.h) < o.minAspect) continue;

    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const cx = mx + ext.cu * ca - ext.cv * sa;
    const cy = my + ext.cu * sa + ext.cv * ca;

    const wPx = ext.w + o.padPx * 2;
    const hPx = ext.h + o.padPx * 2;

    let x0 = (cx - wPx / 2) / cw;
    let y0 = (cy - hPx / 2) / ch;
    const nw = wPx / cw;
    const nh = hPx / ch;
    if (nw >= 0.98 || nh >= 0.98) continue;
    x0 = Math.max(0, Math.min(1 - nw, x0));
    y0 = Math.max(0, Math.min(1 - nh, y0));

    let rot = (angle * 180) / Math.PI;
    while (rot > 90) rot -= 180;
    while (rot < -90) rot += 180;

    /* ── is the paper around this window white too? ──────────── */
    const insideLum = sampleLum(px, pix, 160);
    const ringLum = ringLuminance(px, cw, ch, mx, my, ext, angle, o.ringOffset);
    const transparent = sampleAlpha(px, pix, 80) < o.alphaMin;

    // White window inside white paper, or a see-through (alpha) window:
    // the artwork has to sit on top, otherwise the photo eats the border.
    // A bright window (white polaroid / camera screen) or a see-through one
    // means the artwork should sit on top; dark windows don't need it.
    const whiteOnWhite = !transparent && insideLum >= o.lightMin && ringLum >= o.whitePaper;
    const above = transparent || insideLum >= o.lightMin;

    out.push({
      x: round(x0),
      y: round(y0),
      w: round(nw),
      h: round(nh),
      rot: Math.round(rot * 10) / 10,
      radius: 0.008,
      _area: nw * nh,
      _above: above,
      _whiteOnWhite: whiteOnWhite,
      _transparent: transparent,
    });
  }
  return out;
}

function extents(pix, cw, mx, my, angle) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < pix.length; i++) {
    const idx = pix[i];
    const x = idx % cw;
    const y = (idx - x) / cw;
    const dx = x - mx;
    const dy = y - my;
    const u = dx * ca + dy * sa;
    const v = -dx * sa + dy * ca;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  return {
    w: Math.max(1, uMax - uMin + 1),
    h: Math.max(1, vMax - vMin + 1),
    cu: (uMin + uMax) / 2,
    cv: (vMin + vMax) / 2,
  };
}

/** Average luminance of (a sample of) the region's own pixels. */
function sampleLum(px, pix, maxSamples) {
  const step = Math.max(1, Math.floor(pix.length / maxSamples));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pix.length; i += step) {
    const p = pix[i] * 4;
    sum += px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114;
    n++;
  }
  return n ? sum / n : 0;
}

function sampleAlpha(px, pix, maxSamples) {
  const step = Math.max(1, Math.floor(pix.length / maxSamples));
  let min = 255;
  for (let i = 0; i < pix.length; i += step) {
    const a = px[pix[i] * 4 + 3];
    if (a < min) min = a;
  }
  return min;
}

/** Median luminance of the paper just outside the fitted rectangle. */
function ringLuminance(px, cw, ch, mx, my, ext, angle, offset) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const hw = ext.w / 2 + offset;
  const hh = ext.h / 2 + offset;
  const samples = [];
  const steps = 14;

  const push = (u, v) => {
    const x = Math.round(mx + u * ca - v * sa);
    const y = Math.round(my + u * sa + v * ca);
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const p = (y * cw + x) * 4;
    samples.push(px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114);
  };

  for (let i = 0; i <= steps; i++) {
    const t = -hw + (i * 2 * hw) / steps;
    push(t, -hh);
    push(t, hh);
  }
  for (let i = 0; i <= steps; i++) {
    const t = -hh + (i * 2 * hh) / steps;
    push(-hw, t);
    push(hw, t);
  }
  if (!samples.length) return 0;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const round = (v) => Math.round(v * 10000) / 10000;

function overlap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const min = Math.min(a.w * a.h, b.w * b.h);
  return min ? inter / min : 0;
}

function area(s) {
  return s.w * s.h;
}

function contains(outer, inner) {
  const pad = 0.012;
  return (
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.w <= outer.x + outer.w + pad &&
    inner.y + inner.h <= outer.y + outer.h + pad
  );
}

/** Remove big regions that merely wrap a smaller window inside them. */
function dropEnclosing(list) {
  return list.filter(
    (a, i) => !list.some((b, j) => i !== j && contains(a, b) && area(b) < area(a) * 0.85),
  );
}

function dedupe(list) {
  const sorted = [...list].sort((a, b) => b._area - a._area);
  const kept = [];
  for (const s of sorted) {
    if (!kept.some((k) => overlap(s, k) > 0.55)) kept.push(s);
  }
  return kept
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s) => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rot: s.rot,
      radius: s.radius,
      _above: s._above,
      _whiteOnWhite: s._whiteOnWhite,
      _transparent: s._transparent,
    }));
}
