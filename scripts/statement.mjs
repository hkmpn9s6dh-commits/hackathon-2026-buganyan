/**
 * 创作说明 → PDF（简章要求：PDF、≤50MB、500 字以内）
 *
 * 用同一套字体与同一条 chromod 打印，避免「图是这套字，说明是另一套字」。
 * 缩略图先行由 py 压好放 .tmp/thumbs/，这里直接 base64 内联。
 *
 * 用法：node scripts/statement.mjs
 * 产出：submission/创作说明.pdf
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(ROOT, "docs", "创作说明.md"), "utf8");

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
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

// 极简 md → html：只认标题、空行分段、**加粗**
const lines = md.split(/\r?\n/);
let body = "";
let title = "";
for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith("# ")) {
    title = esc(line.slice(2));
    continue;
  }
  if (line.startsWith("## ")) {
    body += `<h2>${esc(line.slice(3))}</h2>`;
    continue;
  }
  if (line.startsWith("**") && line.endsWith("**")) {
    body += `<p class="kicker">${esc(line.replace(/\*\*/g, ""))}</p>`;
    continue;
  }
  body += `<p>${bold(line)}</p>`;
}

const thumbs = ["01-关", "02-絮", "03-桑", "04-织"]
  .map((n, i) => {
    const f = path.join(ROOT, ".tmp", "thumbs", `${String(i + 1).padStart(2, "0")}.jpg`);
    if (!fs.existsSync(f)) return "";
    return `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${esc(n)}</figcaption></figure>`;
  })
  .join("");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="${new URL("file://" + path.join(ROOT, "assets", "fonts", "fonts.css").replace(/\\/g, "/")).href}">
<style>
  @page{size:A4;margin:22mm 20mm}
  *{box-sizing:border-box}
  body{font-family:"Noto Serif SC",serif;font-weight:300;color:#14181d;font-size:10.6pt;line-height:1.95;margin:0}
  h1{font-weight:600;font-size:30pt;letter-spacing:.14em;margin:0 0 4mm}
  .kicker{font-family:"Noto Sans SC",sans-serif;font-weight:300;font-size:9.4pt;letter-spacing:.18em;color:#7a6a45;margin:0 0 8mm}
  h2{font-weight:600;font-size:11pt;letter-spacing:.08em;margin:7mm 0 2mm;padding-bottom:1.5mm;border-bottom:.5pt solid #cfc6b2}
  p{margin:0 0 1.5mm;text-align:justify}
  b{font-weight:600}
  .row{display:flex;gap:4mm;margin-top:9mm;padding-top:5mm;border-top:.5pt solid #cfc6b2;width:100%}
  figure{margin:0;flex:1 1 0;min-width:0}
  figure img{width:100%;max-width:100%;height:auto;display:block;border:.4pt solid #cfc6b2}
  figcaption{font-family:"Noto Sans SC",sans-serif;font-size:8pt;color:#6b6b6b;margin-top:1.5mm;letter-spacing:.1em}
  .foot{position:fixed;bottom:0;left:0;right:0;font-family:"Noto Sans SC",sans-serif;font-size:7.6pt;color:#8a8a8a;letter-spacing:.12em}
</style></head><body>
<h1>${title || "不敢验"}</h1>
${body}
<div class="row">${thumbs}</div>
<div class="foot">不敢验 · 关／絮／桑／织 · 3508×4961 · 300dpi</div>
</body></html>`;

fs.writeFileSync(path.join(ROOT, ".tmp", "statement.html"), html, "utf8");

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.emulateMedia({ media: "print" });
await page.goto("file://" + path.join(ROOT, ".tmp", "statement.html").replace(/\\/g, "/"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(ROOT, ".tmp", "statement.png"), fullPage: true });
const out = path.join(ROOT, "submission", "创作说明.pdf");
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "22mm", bottom: "22mm", left: "20mm", right: "20mm" } });
await browser.close();

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`✓ submission/创作说明.pdf  ${kb} KB`);
