/* ────────────────────────────────────────────────────────────────
   Frame art + exact photo-window geometry.
   Every slot is authored together with the art that surrounds it,
   so the photo can never sit crooked or outside its window.
   Coordinates are normalised (0..1) against the frame box.
   ──────────────────────────────────────────────────────────────── */

const W = 800;
const H = 1200;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

const uri = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

/* ── tiny vector helpers ─────────────────────────────────────── */
const heart = (x, y, s, fill, op = 1) =>
  `<g fill="${fill}" opacity="${op}">
     <circle cx="${x - s * 0.22}" cy="${y}" r="${s * 0.3}"/>
     <circle cx="${x + s * 0.22}" cy="${y}" r="${s * 0.3}"/>
     <polygon points="${x - s * 0.5},${y + s * 0.06} ${x + s * 0.5},${y + s * 0.06} ${x},${y + s * 0.8}"/>
   </g>`;

const star = (x, y, r, fill, rot = -90, op = 1) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" opacity="${op}"/>`;
};

const flower = (x, y, r, petal, core, petals = 6) => {
  let out = '';
  for (let i = 0; i < petals; i++) {
    const a = ((i * 360) / petals) * (Math.PI / 180);
    out += `<circle cx="${(x + Math.cos(a) * r * 0.6).toFixed(1)}" cy="${(y + Math.sin(a) * r * 0.6).toFixed(1)}" r="${(r * 0.52).toFixed(1)}" fill="${petal}"/>`;
  }
  return out + `<circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(1)}" fill="${core}"/>`;
};

const sparkle = (x, y, s, fill = '#ffffff', op = 1) =>
  `<path d="M${x} ${y - s} Q${x + s * 0.16} ${y - s * 0.16} ${x + s} ${y} Q${x + s * 0.16} ${y + s * 0.16} ${x} ${y + s} Q${x - s * 0.16} ${y + s * 0.16} ${x - s} ${y} Q${x - s * 0.16} ${y - s * 0.16} ${x} ${y - s}Z" fill="${fill}" opacity="${op}"/>`;

const tape = (x, y, w, h, rot, fill = '#ffffff', op = 0.62) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${op}" transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"/>`;

const ginghamDef = (id, color, size = 46, base = '#ffffff') => `
  <pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
    <rect width="${size}" height="${size}" fill="${base}"/>
    <rect width="${size}" height="${size / 2}" fill="${color}" opacity=".5"/>
    <rect width="${size / 2}" height="${size}" fill="${color}" opacity=".5"/>
  </pattern>`;

const scriptLines = (color = '#7f90b6', op = 0.28, rows = 24) => {
  let out = `<g stroke="${color}" stroke-width="3" fill="none" opacity="${op}">`;
  for (let i = 0; i < rows; i++) {
    const y = 46 + i * 50;
    out += `<path d="M-30 ${y} q 55 -16 110 0 t 110 0 t 110 0 t 110 0 t 110 0 t 110 0 t 110 0 t 110 0"/>`;
  }
  return out + '</g>';
};

/* ── polaroid card: white card + exact inner photo window ─────── */
function polaroid(x, y, w, h, opts = {}) {
  const {
    rot = 0,
    pad = 20,
    bottom = 60,
    card = '#ffffff',
    photo = '#dfe7f2',
    label = '',
    labelColor = '#93a0b4',
    font = "Georgia, 'Times New Roman', serif",
    radius = 5,
    shadow = 0.14,
  } = opts;

  const cx = x + w / 2;
  const cy = y + h / 2;
  const cardW = w + pad * 2;
  const cardH = h + pad + bottom;

  const art = `
    <g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${x - pad + 4}" y="${y - pad + 8}" width="${cardW}" height="${cardH}" rx="${radius}" fill="#2b2135" opacity="${shadow}"/>
      <rect x="${x - pad}" y="${y - pad}" width="${cardW}" height="${cardH}" rx="${radius}" fill="${card}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${photo}"/>
      ${
        label
          ? `<text x="${x + w / 2}" y="${y + h + (pad + bottom) / 2 + 6}" font-family="${font}" font-size="${Math.max(13, Math.round(w * 0.072))}" fill="${labelColor}" text-anchor="middle" letter-spacing="2">${label}</text>`
          : ''
      }
    </g>`;

  return {
    art,
    slot: { x: x / W, y: y / H, w: w / W, h: h / H, rot, radius: 0.02 },
  };
}

/* ── film strip: black strip, sprocket holes, N exact windows ─── */
function filmStrip(x, y, count, fw, fh, opts = {}) {
  const { gap = 16, rail = 26, rot = 0, frameColor = '#1b1b20', holeColor = '#ffffff' } = opts;
  const totalH = count * fh + (count - 1) * gap;
  const stripH = totalH + rail * 2;
  const cx = x + fw / 2;
  const cy = y + totalH / 2;

  let frames = '';
  const slots = [];
  for (let i = 0; i < count; i++) {
    const fy = y + i * (fh + gap);
    frames += `<rect x="${x}" y="${fy}" width="${fw}" height="${fh}" fill="${frameColor}"/>`;
    frames += `<rect x="${x + 5}" y="${fy + 5}" width="${fw - 10}" height="${fh - 10}" fill="${holeColor}"/>`;
    slots.push({
      x: (x + 5) / W,
      y: (fy + 5) / H,
      w: (fw - 10) / W,
      h: (fh - 10) / H,
      rot,
      radius: 0.01,
    });
  }

  const hw = Math.round(rail * 0.5);
  const hh = 15;
  const step = 30;
  let holes = '';
  for (let yy = y - rail + 9; yy < y + totalH + rail - 10; yy += step) {
    holes += `<rect x="${x - rail + (rail - hw) / 2}" y="${yy}" width="${hw}" height="${hh}" rx="3" fill="${holeColor}"/>`;
    holes += `<rect x="${x + fw + (rail - hw) / 2}" y="${yy}" width="${hw}" height="${hh}" rx="3" fill="${holeColor}"/>`;
  }

  const art = `<g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${x - rail + 4}" y="${y - rail + 8}" width="${fw + rail * 2}" height="${stripH}" fill="#2b2135" opacity="0.13"/>
      <rect x="${x - rail}" y="${y - rail}" width="${fw + rail * 2}" height="${stripH}" fill="${frameColor}"/>
      ${frames}${holes}
    </g>`;

  return { art, slots };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 1 — Ocean Blvd (blue paper, 4 tilted polaroids)
   ═══════════════════════════════════════════════════════════════ */
function oceanBlvd() {
  const cards = [
    polaroid(70, 100, 280, 255, { rot: -7, label: '', pad: 20, bottom: 58 }),
    polaroid(430, 320, 290, 265, { rot: 6, pad: 20, bottom: 58 }),
    polaroid(100, 470, 265, 240, { rot: 5, label: 'OCEAN BLVD', labelColor: '#5f7593', pad: 20, bottom: 56 }),
    polaroid(420, 790, 275, 255, { rot: -6, pad: 20, bottom: 58 }),
  ];

  const body = `
    <defs>
      <linearGradient id="ob" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#dbe8f9"/><stop offset=".5" stop-color="#bed5f0"/><stop offset="1" stop-color="#a2badf"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#ob)"/>
    ${scriptLines('#6f83ad', 0.26)}
    <circle cx="710" cy="610" r="78" fill="#e9e3d2" opacity=".85"/>
    <circle cx="690" cy="592" r="72" fill="#cfdcf1" opacity=".55"/>
    ${flower(680, 120, 128, '#7d9ed3', '#4f6f9f', 8)}
    ${flower(700, 175, 78, '#a8c1e6', '#6d8dba', 7)}
    ${flower(90, 1080, 130, '#6f8fc7', '#3f5f93', 8)}
    ${flower(35, 980, 82, '#9db9e2', '#5f7fae', 7)}
    ${heart(120, 700, 74, '#4a5b8c', 0.9)}
    ${sparkle(645, 470, 22, '#ffffff', 0.9)}
    ${sparkle(300, 900, 16, '#ffffff', 0.8)}
    ${cards.map((c) => c.art).join('')}
    ${star(340, 300, 34, '#5d7bb0', -90, 0.9)}
  `;

  return {
    id: 'ocean-blvd',
    name: 'Ocean Blvd',
    theme: 'Ocean',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: cards.map((c) => c.slot),
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 2 — Wanted poster (1 big window)
   ═══════════════════════════════════════════════════════════════ */
function wantedPoster() {
  const s = { x: 150, y: 300, w: 500, h: 470 };
  const body = `
    <defs>
      <radialGradient id="pg" cx="50%" cy="40%" r="80%">
        <stop offset="0" stop-color="#f0e0c2"/><stop offset="1" stop-color="#dcc59c"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#pg)"/>
    <g opacity=".18" fill="#6d5636">
      <circle cx="90" cy="180" r="90"/><circle cx="720" cy="420" r="120"/>
      <circle cx="180" cy="1000" r="140"/><circle cx="640" cy="1080" r="100"/>
      <circle cx="420" cy="210" r="70"/>
    </g>
    <g opacity=".28" fill="#8a6f48">
      <rect x="0" y="0" width="26" height="${H}"/><rect x="${W - 26}" y="0" width="26" height="${H}"/>
      <rect x="0" y="0" width="${W}" height="20"/><rect x="0" y="${H - 20}" width="${W}" height="20"/>
    </g>
    <text x="400" y="150" font-family="'Times New Roman', Georgia, serif" font-size="112" font-weight="700" fill="#2c2117" text-anchor="middle" letter-spacing="6">WANTED</text>
    <text x="400" y="215" font-family="'Times New Roman', Georgia, serif" font-size="40" font-weight="700" fill="#33261a" text-anchor="middle" letter-spacing="4">DEAD OR ALIVE</text>
    ${star(180, 200, 26, '#2c2117', -90)}
    ${star(620, 200, 26, '#2c2117', -90)}
    <rect x="${s.x - 14}" y="${s.y - 14}" width="${s.w + 28}" height="${s.h + 28}" fill="#2f2619" opacity=".22"/>
    <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#ffffff"/>
    <text x="400" y="880" font-family="'Times New Roman', Georgia, serif" font-size="64" font-weight="700" fill="#2c2117" text-anchor="middle" letter-spacing="2">$1,000,000 REWARD</text>
    <text x="400" y="950" font-family="'Times New Roman', Georgia, serif" font-size="38" font-weight="700" fill="#33261a" text-anchor="middle">Dangerously Cute and</text>
    <text x="400" y="1000" font-family="'Times New Roman', Georgia, serif" font-size="38" font-weight="700" fill="#33261a" text-anchor="middle">Notoriously Good Looking</text>
  `;

  return {
    id: 'wanted',
    name: 'Wanted Poster',
    theme: 'Paper',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: [{ x: s.x / W, y: s.y / H, w: s.w / W, h: s.h / H, rot: 0, radius: 0.01 }],
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 3 — Y2K pink digicam + film strip (1 + 4)
   ═══════════════════════════════════════════════════════════════ */
function y2kPink() {
  const cam = { x: 72, y: 150, w: 252, h: 172 };
  const strip = filmStrip(455, 350, 4, 280, 190, { gap: 18, rail: 26 });

  const body = `
    <defs>${ginghamDef('g3', '#f2b6cd', 44, '#fdf0f5')}</defs>
    <rect width="${W}" height="${H}" fill="url(#g3)"/>
    <rect width="${W}" height="${H}" fill="#ffe9f1" opacity=".35"/>

    <!-- camera body -->
    <g>
      <rect x="34" y="96" width="404" height="300" rx="34" fill="#f0c3d6"/>
      <rect x="34" y="96" width="404" height="300" rx="34" fill="none" stroke="#e2a3bd" stroke-width="6"/>
      <rect x="${cam.x - 12}" y="${cam.y - 12}" width="${cam.w + 24}" height="${cam.h + 24}" rx="10" fill="#3a2b34"/>
      <rect x="${cam.x - 4}" y="${cam.y - 4}" width="${cam.w + 8}" height="${cam.h + 8}" rx="6" fill="#f7e6ee"/>
      <rect x="${cam.x}" y="${cam.y}" width="${cam.w}" height="${cam.h}" fill="#ffffff"/>
      <circle cx="392" cy="180" r="40" fill="#e7b3c8" stroke="#d390ab" stroke-width="4"/>
      <circle cx="392" cy="180" r="20" fill="#8a6f7c"/>
      <rect x="300" y="330" width="120" height="32" rx="16" fill="#e7b3c8"/>
      <text x="120" y="385" font-family="'Trebuchet MS',sans-serif" font-size="17" fill="#a07287" letter-spacing="2">DSC-W130</text>
      <circle cx="330" cy="128" r="10" fill="#f6d7e4"/>
    </g>

    ${strip.art}

    ${flower(560, 300, 74, '#f38fb4', '#e05a8c', 6)}
    ${heart(690, 210, 54, '#f27aa4', 0.9)}
    ${star(120, 470, 30, '#f9b6d1', -90)}
    ${sparkle(600, 640, 20, '#ffffff', 0.9)}
    ${heart(80, 1030, 62, '#f6a6c4', 0.85)}
  `;

  return {
    id: 'y2k-pink',
    name: 'Y2K Digicam',
    theme: 'Pink',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: [
      { x: cam.x / W, y: cam.y / H, w: cam.w / W, h: cam.h / H, rot: 0, radius: 0.01 },
      ...strip.slots,
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 4 — Vinyl + 3 black polaroids
   ═══════════════════════════════════════════════════════════════ */
function vinyl() {
  const cards = [
    polaroid(250, 40, 290, 270, { rot: 8, photo: '#111114', bottom: 62, pad: 22 }),
    polaroid(300, 360, 290, 270, { rot: -7, photo: '#111114', bottom: 62, pad: 22 }),
    polaroid(230, 760, 300, 280, { rot: 6, photo: '#111114', bottom: 62, pad: 22 }),
  ];

  let grooves = '';
  for (let r = 120; r < 430; r += 16) {
    grooves += `<circle cx="230" cy="620" r="${r}" fill="none" stroke="#2c2c31" stroke-width="1.4" opacity=".7"/>`;
  }

  const body = `
    <rect width="${W}" height="${H}" fill="#f5f1ea"/>
    <circle cx="230" cy="620" r="430" fill="#131316"/>
    ${grooves}
    <circle cx="230" cy="620" r="96" fill="#0d0d10"/>
    <circle cx="230" cy="620" r="86" fill="#f2ede6"/>
    <circle cx="230" cy="620" r="10" fill="#c9c3ba"/>
    <text x="230" y="600" font-family="'Trebuchet MS',sans-serif" font-size="15" fill="#8d877e" text-anchor="middle" letter-spacing="2">STEREO</text>
    <text x="230" y="662" font-family="'Trebuchet MS',sans-serif" font-size="13" fill="#a49d93" text-anchor="middle">33 ⅓ RPM</text>
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" opacity=".06"/>
    ${cards.map((c) => c.art).join('')}
    ${sparkle(120, 200, 18, '#ffffff', 0.5)}
  `;

  return {
    id: 'vinyl',
    name: 'Vinyl Nights',
    theme: 'Dark',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: cards.map((c) => c.slot),
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 5 — Double film strip (10)
   ═══════════════════════════════════════════════════════════════ */
function filmTen() {
  const a = filmStrip(55, 70, 5, 290, 200, { gap: 16, rail: 26 });
  const b = filmStrip(425, 70, 5, 290, 200, { gap: 16, rail: 26 });

  const body = `
    <rect width="${W}" height="${H}" fill="#f4f0e9"/>
    <g stroke="#e4ddd0" stroke-width="1" opacity=".8">
      ${Array.from({ length: 26 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="${W}" y2="${i * 50}"/>`).join('')}
      ${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="${H}"/>`).join('')}
    </g>
    ${a.art}${b.art}
    <rect x="0" y="1140" width="${W}" height="60" fill="#f4f0e9"/>
  `;

  return {
    id: 'film-10',
    name: 'Double Film',
    theme: 'Film',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: [...a.slots, ...b.slots],
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 6 — Polaroids on a clothesline (9)
   ═══════════════════════════════════════════════════════════════ */
function clothesline() {
  const cols = [40, 300, 560];
  const rows = [110, 500, 880];
  const rots = [-5, 3, -3, 4, -4, 5, -3, 4, -2];
  const cards = [];
  let pegs = '';
  let k = 0;

  rows.forEach((ry, r) => {
    const sag = r * 10;
    for (let c = 0; c < 3; c++) {
      const cx = cols[c];
      const card = polaroid(cx, ry + sag, 200, 190, {
        rot: rots[k],
        pad: 16,
        bottom: 44,
        photo: '#111114',
        shadow: 0.1,
      });
      cards.push(card);
      pegs += `<g transform="rotate(${rots[k]} ${cx + 100} ${ry + sag + 95})">
        <rect x="${cx + 84}" y="${ry + sag - 26}" width="18" height="52" rx="5" fill="#d8bd96"/>
        <rect x="${cx + 84}" y="${ry + sag - 26}" width="18" height="52" rx="5" fill="none" stroke="#bfa176" stroke-width="1.5"/>
        <rect x="${cx + 84}" y="${ry + sag - 6}" width="18" height="5" fill="#bfa176"/>
      </g>`;
      k++;
    }
  });

  const strings = rows
    .map((ry, r) => {
      const sag = r * 10;
      return `<path d="M-20 ${ry + sag - 16} Q ${W / 2} ${ry + sag + 26} ${W + 20} ${ry + sag - 22}" fill="none" stroke="#d9cbb8" stroke-width="4"/>`;
    })
    .join('');

  let confetti = '';
  const spots = [
    [70, 420], [180, 60], [330, 430], [480, 60], [640, 430], [740, 240],
    [120, 800], [660, 820], [400, 1120], [240, 1160], [90, 640],
  ];
  spots.forEach(([x, y], i) => {
    confetti += heart(x, y, 18 + (i % 3) * 8, i % 2 ? '#e8607f' : '#f3a2b8', 0.5);
  });

  const body = `
    <rect width="${W}" height="${H}" fill="#fdf8f4"/>
    ${confetti}
    ${strings}
    ${cards.map((c) => c.art).join('')}
    ${pegs}
  `;

  return {
    id: 'clothesline',
    name: 'Clothesline',
    theme: 'Polaroid',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: cards.map((c) => c.slot),
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 7 — Teddy scrapbook (5 polaroids + journal card)
   ═══════════════════════════════════════════════════════════════ */
function teddy() {
  const cream = '#f7edda';
  const cards = [
    polaroid(30, 60, 225, 210, { rot: -7, card: cream, photo: '#4b3728', bottom: 52, pad: 18 }),
    polaroid(470, 80, 225, 210, { rot: 7, card: cream, photo: '#4b3728', bottom: 52, pad: 18 }),
    polaroid(40, 420, 215, 200, { rot: 5, card: cream, photo: '#4b3728', bottom: 50, pad: 18 }),
    polaroid(500, 470, 215, 200, { rot: -6, card: cream, photo: '#4b3728', bottom: 50, pad: 18 }),
    polaroid(250, 880, 235, 220, { rot: 3, card: cream, photo: '#4b3728', bottom: 52, pad: 18 }),
  ];

  const journal = { x: 300, y: 330, w: 200, h: 300 };

  const body = `
    <rect width="${W}" height="${H}" fill="#b98f6d"/>
    <rect width="${W}" height="${H}" fill="#a87f5f" opacity=".35"/>
    <g opacity=".2" stroke="#6f5137" stroke-width="2" fill="none">
      ${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 62} 0 q 20 300 -10 600 t 20 600"/>`).join('')}
    </g>
    <g>
      <rect x="${journal.x - 8}" y="${journal.y - 8}" width="${journal.w + 16}" height="${journal.h + 16}" fill="#8a6449"/>
      <rect x="${journal.x}" y="${journal.y}" width="${journal.w}" height="${journal.h}" fill="${cream}"/>
      <rect x="${journal.x + 10}" y="${journal.y + 10}" width="${journal.w - 20}" height="${journal.h - 20}" fill="none" stroke="#d9c6a5" stroke-width="1.5"/>
      <text x="${journal.x + journal.w / 2}" y="${journal.y + 60}" font-family="'Times New Roman',serif" font-size="20" fill="#8b7457" text-anchor="middle" letter-spacing="3">JANE &amp; JOHN</text>
      <text x="${journal.x + journal.w / 2}" y="${journal.y + 96}" font-family="Georgia,serif" font-size="13" fill="#a08a6c" text-anchor="middle" letter-spacing="1">our favourite person</text>
    </g>
    ${cards.map((c) => c.art).join('')}
    ${star(700, 300, 26, '#8a5030', -90, 0.85)}
    ${star(120, 700, 20, '#8a5030', -90, 0.8)}
    ${heart(700, 760, 26, '#c98b6b', 0.9)}
    ${tape(210, 300, 90, 26, 12, '#efe3cf', 0.9)}
    ${tape(560, 700, 80, 24, -10, '#efe3cf', 0.9)}
  `;

  return {
    id: 'teddy',
    name: 'Teddy Scrapbook',
    theme: 'Scrapbook',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: [
      ...cards.map((c) => c.slot),
      { x: journal.x / W, y: journal.y / H, w: journal.w / W, h: journal.h / H, rot: 0, radius: 0.01 },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 8 — Purple watercolour (2)
   ═══════════════════════════════════════════════════════════════ */
function purpleFly() {
  const cards = [
    polaroid(80, 120, 265, 330, { rot: -4, pad: 22, bottom: 70 }),
    polaroid(410, 600, 265, 330, { rot: 5, pad: 22, bottom: 70 }),
  ];

  const body = `
    <rect width="${W}" height="${H}" fill="#efe7f8"/>
    <g opacity=".55">
      <circle cx="120" cy="820" r="220" fill="#dccdf2"/>
      <circle cx="680" cy="260" r="200" fill="#e4d5f7"/>
      <circle cx="420" cy="1080" r="260" fill="#d7c8ef"/>
      <circle cx="620" cy="880" r="160" fill="#e9dcf6"/>
    </g>
    ${scriptLines('#8b7aa8', 0.16, 20)}
    <g opacity=".9">
      ${flower(660, 150, 90, '#c3aee6', '#f4ead9', 6)}
      ${flower(120, 1040, 76, '#bda8e2', '#f4ead9', 6)}
      ${flower(700, 1080, 56, '#cdb9ea', '#f4ead9', 5)}
    </g>
    ${cards.map((c) => c.art).join('')}
    ${heart(120, 640, 46, '#8f7ab5', 0.9)}
    ${heart(660, 520, 40, '#8f7ab5', 0.85)}
    ${sparkle(380, 120, 22, '#ffffff', 0.8)}
    ${sparkle(140, 940, 16, '#ffffff', 0.7)}
    <g opacity=".85" fill="#7d6a9e">
      <ellipse cx="300" cy="760" rx="26" ry="16" transform="rotate(-18 300 760)"/>
      <ellipse cx="334" cy="742" rx="20" ry="12" transform="rotate(14 334 742)"/>
      <ellipse cx="272" cy="742" rx="18" ry="11" transform="rotate(-42 272 742)"/>
    </g>
  `;

  return {
    id: 'purple-fly',
    name: 'Lavender Dream',
    theme: 'Purple',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: cards.map((c) => c.slot),
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 9 — Gingham outline frames (3, art sits ABOVE photos)
   ═══════════════════════════════════════════════════════════════ */
function ginghamOutline() {
  const rects = [
    { x: 70, y: 110, w: 300, h: 330, rot: -3 },
    { x: 290, y: 430, w: 300, h: 330, rot: 4 },
    { x: 110, y: 780, w: 300, h: 330, rot: -2 },
  ];

  const frameArt = (
    body,
  ) => `<g transform="rotate(${body.rot} ${body.x + body.w / 2} ${body.y + body.h / 2})">
      <rect x="${body.x - 26}" y="${body.y - 26}" width="${body.w + 52}" height="${body.h + 52}" rx="4" fill="none" stroke="#ffffff" stroke-width="26"/>
    </g>`;

  const bgBody = `
    <defs>${ginghamDef('g9', '#9cb8e2', 40, '#ffffff')}</defs>
    <rect width="${W}" height="${H}" fill="url(#g9)"/>
    <path d="M0 0 L${W} 0 L${W} 210 Q 560 260 380 180 T 0 250 Z" fill="#3f5d92" opacity=".75"/>
    <path d="M0 ${H} L${W} ${H} L${W} 1010 Q 560 960 360 1040 T 0 980 Z" fill="#3f5d92" opacity=".75"/>
    <g opacity=".35" fill="#ffffff">
      ${Array.from({ length: 26 }, (_, i) => `<circle cx="${20 + (i % 4) * 14}" cy="${200 + i * 34}" r="3"/>`).join('')}
    </g>
    ${flower(690, 300, 70, '#6f8cc4', '#e8eef8', 6)}
    ${star(120, 620, 34, '#4c6ba6', -90, 0.8)}
    ${heart(680, 640, 40, '#7d97c9', 0.9)}
  `;

  const fgBody = `
    ${rects.map(frameArt).join('')}
    ${rects.map((r) => `<g transform="rotate(${r.rot} ${r.x + r.w / 2} ${r.y + r.h / 2})">
        <rect x="${r.x - 6}" y="${r.y - 6}" width="${r.w + 12}" height="${r.h + 12}" fill="none" stroke="#ffffff" stroke-width="4" opacity=".9"/>
      </g>`).join('')}
    ${flower(660, 120, 54, '#7ea0d6', '#e8eef8', 6)}
    ${star(740, 860, 26, '#ffffff', -90, 0.9)}
  `;

  return {
    id: 'gingham-outline',
    name: 'Gingham Frames',
    theme: 'Paper',
    ratio: [2, 3],
    bg: uri(svg(bgBody)),
    fg: uri(svg(fgBody)),
    artAbove: true,
    slots: rects.map((r) => ({
      x: r.x / W,
      y: r.y / H,
      w: r.w / W,
      h: r.h / H,
      rot: r.rot,
      radius: 0.005,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
   FRAME 10 — iPod player (1)
   ═══════════════════════════════════════════════════════════════ */
function ipod() {
  const screen = { x: 60, y: 70, w: 680, h: 690 };

  const body = `
    <rect width="${W}" height="${H}" fill="#1c1c1f"/>
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="76" fill="#2b2b30"/>
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="76" fill="none" stroke="#3d3d44" stroke-width="6"/>
    <rect x="${screen.x - 10}" y="${screen.y - 10}" width="${screen.w + 20}" height="${screen.h + 20}" rx="14" fill="#151518"/>
    <rect x="${screen.x}" y="${screen.y}" width="${screen.w}" height="${screen.h}" rx="8" fill="#ffffff"/>
    <text x="90" y="830" font-family="'Trebuchet MS',sans-serif" font-size="24" fill="#e6e6ea" letter-spacing="1">AirPods</text>
    <g fill="#9a9aa4" transform="translate(660 812)">
      <circle cx="0" cy="0" r="10" fill="none" stroke="#9a9aa4" stroke-width="2.5"/>
      <path d="M0 14 a20 20 0 0 0 -12 -8" fill="none" stroke="#9a9aa4" stroke-width="2.5"/>
      <path d="M0 14 a20 20 0 0 1 12 -8" fill="none" stroke="#9a9aa4" stroke-width="2.5"/>
    </g>
    <rect x="80" y="870" width="640" height="6" rx="3" fill="#57575f"/>
    <rect x="80" y="870" width="180" height="6" rx="3" fill="#d8d8de"/>
    <circle cx="260" cy="873" r="10" fill="#f4f4f8"/>
    <text x="80" y="910" font-family="'Trebuchet MS',sans-serif" font-size="16" fill="#8f8f99">0:07</text>
    <text x="720" y="910" font-family="'Trebuchet MS',sans-serif" font-size="16" fill="#8f8f99" text-anchor="end">-4:06</text>
    <g fill="#f0f0f4">
      <polygon points="250,960 300,985 250,1010"/>
      <rect x="322" y="958" width="12" height="54" rx="4"/>
      <rect x="344" y="958" width="12" height="54" rx="4"/>
      <polygon points="440,960 390,985 440,1010"/>
    </g>
    <g fill="#9a9aa4" transform="translate(120 1075)">
      <path d="M0 0 l-18 12 v-12 l-10 0 v24 l10 0 v-12 l18 12z"/>
      <path d="M10 4 a12 12 0 0 1 0 18" fill="none" stroke="#9a9aa4" stroke-width="2.5"/>
    </g>
    <rect x="170" y="1068" width="420" height="6" rx="3" fill="#57575f"/>
    <rect x="170" y="1068" width="290" height="6" rx="3" fill="#d8d8de"/>
    <circle cx="460" cy="1071" r="12" fill="#f4f4f8"/>
    <g fill="#9a9aa4" transform="translate(660 1080)">
      <path d="M0 0 l18 12 v-12 l10 0 v24 l-10 0 v-12 l-18 12z"/>
      <path d="M-10 4 a12 12 0 0 0 0 18" fill="none" stroke="#9a9aa4" stroke-width="2.5"/>
    </g>
  `;

  return {
    id: 'ipod',
    name: 'iPod Player',
    theme: 'Y2K',
    ratio: [2, 3],
    bg: uri(svg(body)),
    slots: [
      { x: screen.x / W, y: screen.y / H, w: screen.w / W, h: screen.h / H, rot: 0, radius: 0.02 },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════ */
export const FRAMES = [
  oceanBlvd(),
  wantedPoster(),
  y2kPink(),
  vinyl(),
  filmTen(),
  clothesline(),
  teddy(),
  purpleFly(),
  ginghamOutline(),
  ipod(),
];
