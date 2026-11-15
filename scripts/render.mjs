/**
 * 版式渲染 + 构建护栏（fail-closed：任一断言不过就不出图）
 *
 * 用法：node scripts/render.mjs [--only 04]
 * 产出：output/01.png … output/04.png，3508×4961（A3 300dpi）
 *
 * 这里的断言不是走形式：
 *  - 字体没真加载 → 静默回落系统字体，字全变而图照样出（踩过）
 *  - 织纹周期不对 → 说明 cell 与 A3 的厘米对不上，「每厘米二十经」就是假话
 *  - 断纬区没有变成竖条 → 概念塌了，但那片区域照样好看，肉眼很难发现
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 3508;
const H = 4961;
const SAFE = 220;
const BAND_H = 2054;
const CELL = 6;

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "plates.json"), "utf8"));
const varIdx = process.argv.indexOf("--variant");
const variant = varIdx > -1 ? process.argv[varIdx + 1] : null;
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const sheets = (only ? DATA.sheets.filter((s) => s.id === only) : DATA.sheets).map((s) => ({ ...s }));
if (variant) {
  // 闸 D 用：把 01 换成对照组（plain=不织；fine=更细的经纬），其余不动
  for (const s of sheets) {
    if (s.id !== "01") continue;
    if (variant === "plain") s.mode = "plain";
    if (variant === "fine") s.cell = 3;
    s.id = `01-${variant}`;
    s.outDir = "proof/gate-d";
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sheetHtml(s) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "assets", "fonts", "fonts.css")).href}">
<style>
  :root{
    --ink:#0f141a; --paper:#f4efe4; --gold:#a8853f; --vermilion:#a8372c;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:var(--paper);}
  body{font-family:"Noto Serif SC",serif;-webkit-font-smoothing:antialiased;}
  #stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--paper)}
  #band{position:absolute;left:0;top:0;width:${W}px;height:${BAND_H}px;display:block}
  .threads{position:absolute;left:0;top:${BAND_H}px;width:${W}px;height:170px;pointer-events:none}
  .num{position:absolute;left:${SAFE}px;top:2228px;font-weight:300;font-size:88px;letter-spacing:.34em;color:var(--gold)}
  .title{position:absolute;left:${SAFE}px;top:2306px;font-weight:600;font-size:462px;line-height:1.5;color:var(--ink)}
  .rule{position:absolute;left:${SAFE}px;top:3050px;width:780px;height:3px;background:rgba(15,20,26,.22)}
  .quote{position:absolute;left:${SAFE}px;top:3118px;width:2040px;font-weight:300;font-size:124px;line-height:1.84;color:rgba(15,20,26,.92)}
  .note{position:absolute;left:${SAFE}px;top:3648px;width:2040px;font-family:"Noto Sans SC",sans-serif;font-weight:300;font-size:68px;line-height:2.04;color:rgba(15,20,26,.66)}
  .swatch{position:absolute;left:2260px;top:3838px;width:1028px;height:604px;display:block}
  .swcap{position:absolute;left:2260px;top:4466px;width:1028px;font-family:"Noto Sans SC",sans-serif;font-weight:300;font-size:38px;line-height:1.6;color:rgba(15,20,26,.58)}
  .source{position:absolute;left:${SAFE}px;top:4188px;width:2500px;font-family:"Noto Sans SC",sans-serif;font-weight:300;font-size:42px;line-height:1.7;color:rgba(15,20,26,.46)}
  .foot{position:absolute;left:${SAFE}px;top:4682px;width:${W - SAFE * 2}px;font-family:"Noto Sans SC",sans-serif;font-weight:300;font-size:40px;color:rgba(15,20,26,.40);display:flex;justify-content:space-between}
  .foot .r{text-align:right}
</style></head>
<body><div id="stage">
  <canvas id="band" width="${W}" height="${BAND_H}"></canvas>
  <svg class="threads" viewBox="0 0 ${W} 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
  <div class="num" data-safe>${esc(s.num)}</div>
  <div class="title" data-safe data-fit>${esc(s.title)}</div>
  <div class="rule" data-safe></div>
  <div class="quote" data-safe data-fit>${s.quote.map(esc).join("<br>")}</div>
  <div class="note" data-safe data-fit>${esc(s.note)}</div>
  <canvas class="swatch" id="swatch" width="1028" height="604" data-safe></canvas>
  <div class="swcap" data-safe>局部 · 放大三倍　一厘米见方约二十经二十纬</div>
  <div class="source" data-safe data-fit>${esc(s.source)}</div>
  <div class="foot" data-safe>
    <span>《${esc(DATA.work)}》${esc(DATA.subtitle)} · ${esc(s.seq)}／四</span>
    <span class="r">丝路图景 · 数字漫插</span>
  </div>
</div></body></html>`;
}

/** 从布边垂下来的经线：让图与下面的字不是两块，而是一台机上的东西 */
function threadSvg(W, n) {
  let out = "";
  const count = typeof n === "object" ? n.count : n;
  const span = typeof n === "object" ? n.span : null;
  for (let i = 0; i < count; i++) {
    const t = span ? span[0] + (span[1] - span[0]) * (i / count) : i / count;
    const x = (span ? t : i / count) * W;
    // 断纬区的经线接着往下垂，别的幅只是浅浅一线，不抢字
    const len = span ? 170 : 170;
    const a = span ? 0.1 + 0.09 * Math.sin(i * 1.3) ** 2 : 0.16 - (i % 7) * 0.012;
    out += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${len}" stroke="rgba(15,20,26,${Math.max(0.03, a).toFixed(3)})" stroke-width="${span ? 2.6 : 2}"/>`;
  }
  return out;
}

const browser = await chromium.launch({ executablePath: findChrome() });
fs.mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
let failed = 0;

for (const s of sheets) {
  const htmlPath = path.join(ROOT, ".tmp", `${s.id}.html`);
  fs.writeFileSync(htmlPath, sheetHtml(s), "utf8");
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  // 织纹（异步）
  const platePath = s.plate ? path.join(ROOT, "plates", s.plate) : null;
  const plateUri = platePath
    ? "data:image/png;base64," + fs.readFileSync(platePath).toString("base64")
    : null;
  await page.addScriptTag({ path: path.join(ROOT, "src", "weave.js") });
  await page.evaluate(
    async ({ plateUri, mask, mode, W, BAND_H, CELL }) => {
      await window.__paintBand(document.getElementById("band"), {
        plate: plateUri,
        mask,
        mode,
        W,
        H: BAND_H,
        cell: CELL
      });
    },
    { plateUri, mask: s.mask, mode: s.mode, W, BAND_H, CELL: s.cell || CELL }
  );
  await page.evaluate((svg) => {
    document.querySelector(".threads").innerHTML = svg;
  }, threadSvg(W, s.id === "04" ? { count: 180, span: [0.318, 0.585] } : 292));

  // 样片：从刚织好的那条布上原大截一块，证明「放大看是布」不是嘴上说说
  await page.evaluate(({ sx, sy }) => {
    const band = document.getElementById("band");
    const sw = document.getElementById("swatch");
    const c = sw.getContext("2d");
    c.imageSmoothingEnabled = false;
    // 放大三倍取样（333×196 → 1000×588）：缩到手机上看也能数出经纬
    c.drawImage(band, sx, sy, 343, 202, 0, 0, 1028, 604);
    c.strokeStyle = "rgba(15,20,26,.28)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 1026, 602);
  }, { sx: Math.round((s.swatch?.x ?? 0.4) * W), sy: Math.round((s.swatch?.y ?? 0.4) * BAND_H) });

  const report = await page.evaluate(
    ({ W, H, SAFE, BAND_H, CELL, s }) => {
      const bad = [];

      // 1 字体真加载
      for (const fam of ["Noto Serif SC", "Noto Sans SC"]) {
        if (!document.fonts.check(`120px "${fam}"`, "关絮桑织不敢验")) {
          bad.push({ rule: "font", msg: `字体未加载：${fam}` });
        }
      }

      // 2 溢出
      for (const el of document.querySelectorAll("[data-fit]")) {
        const oy = el.scrollHeight - el.clientHeight;
        const ox = el.scrollWidth - el.clientWidth;
        if (oy > 1 || ox > 1) bad.push({ rule: "overflow", msg: `溢出 ${ox}×${oy}：${el.textContent.trim().slice(0, 14)}` });
      }

      // 3 安全区
      for (const el of document.querySelectorAll("[data-safe]")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < SAFE - 0.5 || r.top < SAFE - 0.5 || r.right > W - SAFE + 0.5 || r.bottom > H - SAFE + 0.5)) {
          bad.push({
            rule: "safe-area",
            msg: `出安全区：${el.textContent.trim().slice(0, 12)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`
          });
        }
      }

      // 4 字号下限（A3 300dpi 上 24px ≈ 2.0mm，再小印不清）
      for (const el of document.querySelectorAll("body *")) {
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TITLE"].includes(el.tagName)) continue;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
        if (!hasText) continue;
        const fs2 = parseFloat(getComputedStyle(el).fontSize);
        if (fs2 < 24) bad.push({ rule: "font-size", msg: `${fs2}px 太小：${el.textContent.trim().slice(0, 14)}` });
      }

      // 5 文案与数据一致 + 作品名的硬规矩
      const text = document.body.innerText.replace(/\s+/g, "");
      for (const k of [s.num, s.title, ...s.quote, s.note, s.source]) {
        if (!text.includes(String(k).replace(/\s+/g, ""))) bad.push({ rule: "copy", msg: `版面上找不到：${String(k).slice(0, 12)}` });
      }
      const cn = /^[\u4e00-\u9fa5]{1,20}$/;
      if (!cn.test(s.title)) bad.push({ rule: "copy", msg: `标题不是 1–20 个汉字：${s.title}` });
      if (/张一|作者|学校|学院|指导/.test(text)) bad.push({ rule: "copy", msg: "版面出现了作者/院校信息（简章禁止）" });

      // 6 画布与织纹
      const cv = document.getElementById("band");
      if (cv.width !== W || cv.height !== BAND_H) bad.push({ rule: "canvas", msg: `画布 ${cv.width}×${cv.height}` });
      const ctx = cv.getContext("2d");

      // 6a 调色板受控：每个像素都要落在六档色的邻域里（否则就是原图盖了层网格，不是织）
      const probe = ctx.getImageData(W * 0.1, BAND_H * 0.55, 120, 120).data;
      const PAL = [
        [11, 20, 32],
        [23, 39, 60],
        [39, 74, 92],
        [74, 111, 117],
        [169, 179, 166],
        [236, 227, 207]
      ];
      let dist = 0;
      let n = 0;
      for (let i = 0; i < probe.length; i += 4) {
        let best = 1e9;
        for (const c of PAL) {
          const d = Math.hypot(probe[i] - c[0], probe[i + 1] - c[1], probe[i + 2] - c[2]);
          if (d < best) best = d;
        }
        dist += best;
        n++;
      }
      const avgDist = dist / n;
      if (s.mode === "weave" && avgDist > 34) {
        bad.push({ rule: "weave", msg: `偏离六色调色板 ${avgDist.toFixed(1)}，不像织（应 ≤34）` });
      }

      // 6b 织纹是周期的：一格 6px，行均值/列均值每隔 6px 必定重现一次。
      // 用自相关而不是「横竖梯度比」——画面内容本身横竖都有，梯度比被判过死刑。
      const grid = (x0, y0, w, h) => {
        const d = ctx.getImageData(x0, y0, w, h).data;
        const rm = new Array(h).fill(0);
        const cm = new Array(w).fill(0);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const l = d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
            rm[y] += l;
            cm[x] += l;
          }
        }
        return { rm: rm.map((v) => v / w), cm: cm.map((v) => v / h) };
      };
      const ac = (arr, lag) => {
        const mu = arr.reduce((a, b) => a + b, 0) / arr.length;
        let num = 0;
        let den = 0;
        for (let i = 0; i + lag < arr.length; i++) num += (arr[i] - mu) * (arr[i + lag] - mu);
        for (let i = 0; i < arr.length; i++) den += (arr[i] - mu) ** 2;
        return num / Math.max(1e-6, den);
      };

      const g = grid(Math.round(W * 0.1), Math.round(BAND_H * 0.5), 240, 240);
      const aRow = ac(g.rm, CELL);
      const aCol = ac(g.cm, CELL);

      if (s.mode === "weave" && !(aRow > 0.25 && aCol > 0.25)) {
        bad.push({ rule: "weave", msg: `周期不对：行自相关 ${aRow.toFixed(2)}、列 ${aCol.toFixed(2)}（应同时 >0.25）` });
      }

      // 6c 断纬区：只剩经线 → 竖着的变化远多于横着的变化
      if (s.mask && s.mask.kind === "warp") {
        const mx = Math.max(0, Math.round(((s.mask.x0 + s.mask.x1) / 2) * W) - 60);
        const my = Math.max(0, Math.round(((s.mask.y0 + s.mask.y1) / 2) * BAND_H) - 60);
        const d = ctx.getImageData(mx, my, 120, 120).data;
        const L = (x, y) => {
          const k = (y * 120 + x) * 4;
          return d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
        };
        let dx = 0;
        let dy = 0;
        for (let y = 1; y < 120; y++) {
          for (let x = 1; x < 120; x++) {
            dx += Math.abs(L(x, y) - L(x - 1, y));
            dy += Math.abs(L(x, y) - L(x, y - 1));
          }
        }
        const ratio = dx / Math.max(1, dy);
        if (ratio < 1.45) bad.push({ rule: "mask", msg: `断纬区横竖变化比 ${ratio.toFixed(2)}，没读成竖条（应 ≥1.45）` });
      }

      // 7 周期：一格 6px，两格一轮（一上一下），A3 上每厘米约 20 经
      const perCm = 118.11 / CELL;
      if (Math.abs(perCm - 20) > 1.5) bad.push({ rule: "weave", msg: `每厘米 ${perCm.toFixed(1)} 经，与版面上的「二十经」不符` });

      return { bad, aRow, aCol, avgDist, perCm };
    },
    { W, H, SAFE, BAND_H, CELL, s }
  );

  for (const e of errors) report.bad.push({ rule: "js", msg: e.slice(0, 140) });

  if (report.bad.length) {
    failed++;
    console.error(`\n✗ ${s.id} 断言失败 ${report.bad.length} 条`);
    for (const b of report.bad) console.error(`   [${b.rule}] ${b.msg}`);
    await page.close();
    continue;
  }

  const outPath = path.join(ROOT, s.outDir || "output", `${s.id}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(
    `✓ ${s.id} ${s.title}  周期 ${report.aRow.toFixed(2)}/${report.aCol.toFixed(2)}  调色板偏离 ${report.avgDist.toFixed(1)}  ${W}×${H}  ${kb} KB`
  );
  await page.close();
}

await browser.close();
if (failed) {
  console.error(`\n共 ${failed} 张未通过，已拒绝出图。`);
  process.exit(1);
}
