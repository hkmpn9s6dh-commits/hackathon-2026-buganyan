/**
 * 织纹合成：把一张底版「织」成一条横幅。
 *
 * 为什么不用滤镜：滤镜只是在图上盖一层网格，放大看是照片。这里是把画面按平纹组织
 * （一上一下）重新排成经纬色块——每 6 像素一根线，3508 宽就是 585 根经线，
 * A3 上正好每厘米约二十经二十纬。缩小看是人，放大看是布。
 *
 * 三种状态：
 *   weave —— 正常平纹
 *   warp  —— 只有经线、没有纬线（mask 区域）：断纬的那一寸、还没织完的绸
 *   floss —— 还没上机的一团絮（02 号整幅）
 *
 * 挂到 window 上，供 render.mjs 用 addScriptTag 注入。
 */

const PALETTE = [
  [11, 20, 32],    // 墨
  [23, 39, 60],    // 深靛
  [39, 74, 92],    // 靛
  [74, 111, 117],  // 石青
  [169, 179, 166], // 灰绿
  [236, 227, 207]  // 丝白
];

/** 六档是「锚」，真正排色用 11 档：限色要像织锦，但不能把明暗压成台阶把细节吃掉 */
const RAMP = (() => {
  const out = [];
  for (let i = 0; i < PALETTE.length - 1; i++) {
    out.push(PALETTE[i]);
    out.push(PALETTE[i].map((v, k) => Math.round((v + PALETTE[i + 1][k]) / 2)));
  }
  out.push(PALETTE[PALETTE.length - 1]);
  return out;
})();

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 亮度 → 调色板档位（六档），带一点点抖动，免得出现整齐的色阶带 */
function step(l, jitter) {
  const anchors = RAMP.map((c) => lum(c[0], c[1], c[2]));
  const v = l + jitter;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(anchors[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const css = (c, k = 1) =>
  `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;

async function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("底版加载失败"));
    im.src = src;
  });
}

function drawWarpOnly(ctx, { x0, x1, y0, y1, cell, src, W, H, forceDark }) {
  const cols = Math.round(W / cell);
  const i0 = Math.max(0, Math.floor(x0 * cols));
  const i1 = Math.min(cols, Math.ceil(x1 * cols));
  const r0 = Math.max(0, Math.floor(y0 * (H / cell)));
  const r1 = Math.min(Math.ceil(H / cell), Math.ceil(y1 * (H / cell)));
  const jr = mulberry32(97531);
  const wide = cell * 0.58;

  // 底：这一寸没有纬线，只剩机底
  ctx.fillStyle = css(RAMP[0]);
  ctx.fillRect(i0 * cell, r0 * cell, (i1 - i0) * cell, (r1 - r0) * cell);

  // 经线是一根到底的：按列画，颜色随高度变（底版上的明暗还在，只是被抽掉了纬）
  for (let i = i0; i < i1; i++) {
    const wob = Math.sin(i * 1.7) * 1.2;
    for (let j = r0; j < r1; j++) {
      let c;
      if (forceDark) {
        const r = jr();
        c = r > 0.9 ? RAMP[4] : r > 0.55 ? RAMP[2] : RAMP[0];
      } else {
        const idx = src ? src(i, j) : 1;
        c = RAMP[Math.max(0, Math.min(RAMP.length - 2, idx - 2))];
      }
      ctx.fillStyle = css(c);
      ctx.fillRect(i * cell + (cell - wide) / 2 + wob, j * cell, wide, cell + 0.8);
    }
    // 一根线的高光边
    ctx.fillStyle = css(RAMP[8], forceDark ? 0.12 : 0.2);
    ctx.fillRect(i * cell + (cell - wide) / 2 + wob, r0 * cell, 1.2, (r1 - r0) * cell);
  }

  // 断口：上下两端的线头参差
  ctx.lineWidth = 1.8;
  for (let k = 0; k < i1 - i0; k += 3) {
    const x = i0 * cell + k * cell + cell / 2;
    ctx.strokeStyle = css(RAMP[8], 0.35 + jr() * 0.3);
    const len = 8 + jr() * 30;
    ctx.beginPath();
    ctx.moveTo(x, r0 * cell - len * 0.4);
    ctx.lineTo(x, r0 * cell + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, r1 * cell + len * 0.4);
    ctx.lineTo(x, r1 * cell - len);
    ctx.stroke();
  }
}

async function paintWeave(canvas, opts) {
  const { plate, mask, W, H } = opts;
  const cell = opts.cell || 6;
  const cols = Math.round(W / cell);
  const rows = Math.round(H / cell);
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  const img = await loadImage(plate);
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0, cols, rows);
  const px = octx.getImageData(0, 0, cols, rows).data;
  const at = (i, j) => {
    const ii = Math.max(0, Math.min(cols - 1, i));
    const jj = Math.max(0, Math.min(rows - 1, j));
    const k = (jj * cols + ii) * 4;
    return step(lum(px[k], px[k + 1], px[k + 2]), 0);
  };

  // 一、先打纬：整行连过去，每格一段，接缝只在一格之间
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = at(i, j);
      const shade = 0.88 + 0.04 * Math.sin(i * 0.9 + j * 1.7);
      ctx.fillStyle = css(RAMP[idx], shade);
      ctx.fillRect(i * cell, j * cell + cell * 0.12, cell + 0.8, cell * 0.8);
      // 纬线是圆的：上沿一线亮，下沿一线暗
      ctx.fillStyle = css(RAMP[idx], shade * 1.24);
      ctx.fillRect(i * cell, j * cell + cell * 0.12, cell + 0.8, 1.5);
      ctx.fillStyle = css(RAMP[idx], shade * 0.74);
      ctx.fillRect(i * cell, j * cell + cell * 0.86, cell + 0.8, 1.6);
    }
  }

  // 二、再压经：一上一下，压在纬上的那半格才看得见经线，跨过上下两行把它接成一根
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if ((i + j) % 2 !== 0) continue;
      const idx = at(i, j);
      const w = cell * (0.62 + 0.08 * Math.sin(i * 2.3));
      const x = i * cell + (cell - w) / 2;
      const shade = 1.02 + 0.05 * Math.sin(j * 0.8 + i);
      ctx.fillStyle = css(RAMP[idx], shade);
      ctx.fillRect(x, j * cell - cell * 0.3, w, cell * 1.62);
      ctx.fillStyle = css(RAMP[idx], shade * 1.32);
      ctx.fillRect(x, j * cell - cell * 0.3, 1.2, cell * 1.62);
      ctx.fillStyle = css(RAMP[idx], shade * 0.8);
      ctx.fillRect(x + w - 1.2, j * cell - cell * 0.3, 1.2, cell * 1.62);
    }
  }

  if (mask && mask.kind === "warp") {
    drawWarpOnly(ctx, { ...mask, cell, src: at, W, H });
  }

  // 布边
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
}

async function paintFloss(canvas, opts) {
  const { W, H } = opts;
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;
  const rnd = mulberry32(55201);
  const PAPER = [239, 231, 214];
  const INK = [20, 28, 38];

  ctx.fillStyle = css(PAPER);
  ctx.fillRect(0, 0, W, H);

  // 絮是有体积的：先铺一层很软的明暗，免得几千根线看起来像同一层纸上的划痕
  const blobs = [
    [0.18, 0.34, 0.34, 0.16],
    [0.46, 0.62, 0.42, 0.13],
    [0.78, 0.40, 0.30, 0.15],
    [0.62, 0.18, 0.26, 0.10]
  ];
  for (const [bx, by, br, ba] of blobs) {
    const g = ctx.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, br * W);
    g.addColorStop(0, `rgba(60,72,88,${ba})`);
    g.addColorStop(1, "rgba(60,72,88,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 絮：几千根极细的丝，压在纸上是墨——不是光
  const N = 9000;
  for (let n = 0; n < N; n++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 30 + rnd() * 170;
    const a = rnd() * Math.PI;
    const bend = (rnd() - 0.5) * len * 1.4;
    ctx.strokeStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},${(0.05 + rnd() * 0.1).toFixed(3)})`;
    ctx.lineWidth = 0.9 + rnd() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
      y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len
    );
    ctx.stroke();
  }

  // 下缘：絮开始被纺成经线，从乱到直
  const gy = H - 320;
  const grad = ctx.createLinearGradient(0, gy, 0, H);
  grad.addColorStop(0, "rgba(239,231,214,0)");
  grad.addColorStop(1, "rgba(196,186,164,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, gy, W, 320);
  const colsN = Math.round(W / 6);
  for (let i = 0; i < colsN; i++) {
    if (rnd() < 0.42) continue;
    const x = i * 6 + 3 + (rnd() - 0.5) * 2;
    const top = gy + rnd() * rnd() * 260;
    ctx.strokeStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},${(0.12 + rnd() * 0.16).toFixed(3)})`;
    ctx.lineWidth = 1.1 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // 卵：几十粒，朱色，有薄薄一圈影子才立得起来
  for (let n = 0; n < 26; n++) {
    const cluster = n / 26;
    const cx = W * (0.16 + cluster * 0.30) + (rnd() - 0.5) * W * 0.05;
    const cy = H * (0.50 + Math.sin(cluster * 3.1) * 0.10) + (rnd() - 0.5) * H * 0.06;
    const r = 13 + rnd() * 7;
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, cy + 3, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40,52,66,0.18)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.92, rnd() * 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(168,55,44)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.28, cy - r * 0.3, r * 0.32, r * 0.24, rnd() * 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239,231,214,0.5)";
    ctx.fill();
  }

  // 一根金线横过整幅：它还不是布，只是一根线
  ctx.strokeStyle = "rgba(154,116,44,0.85)";
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.415);
  ctx.bezierCurveTo(W * 0.3, H * 0.40, W * 0.7, H * 0.435, W, H * 0.418);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
}

async function paintPlain(canvas, opts) {
  // 对照组：底版直接量化后平铺，不排经纬——用来验证「织」到底有没有比不织好
  const { plate, W, H } = opts;
  const cell = opts.cell || 6;
  const cols = Math.round(W / cell);
  const rows = Math.round(H / cell);
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;
  const img = await loadImage(plate);
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0, cols, rows);
  const px = octx.getImageData(0, 0, cols, rows).data;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4;
      ctx.fillStyle = css(PALETTE[step(lum(px[k], px[k + 1], px[k + 2]), 0)]);
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
}

window.__paintBand = async function (canvas, opts) {
  if (opts.mode === "floss") await paintFloss(canvas, opts);
  else if (opts.mode === "plain") await paintPlain(canvas, opts);
  else await paintWeave(canvas, opts);
  return { mode: opts.mode, w: canvas.width, h: canvas.height };
};
