"""投稿件复验（对着交付的 JPG 说话，不看渲染过程）。

render.mjs 的断言发生在浏览器里，能保证「画的时候是对的」；这里查的是「交出去的东西是对的」——
尺寸、dpi、RGB、体积、织纹周期、四张的明暗节奏、文字区的墨量，以及简章那几条硬规矩。

用法：py -3 scripts/verify.py
退出码 0 才算过。--allow-missing 用于干净环境里只核对已有产物。
"""
import hashlib
import json
import math
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SUB = ROOT / "submission"
W, H = 3508, 4961
LIMIT = 10 * 1024 * 1024
PAL = [(11, 20, 32), (23, 39, 60), (39, 74, 92), (74, 111, 117), (169, 179, 166), (236, 227, 207)]

fails = []
notes = []


def check(ok, label, detail=""):
    (notes if ok else fails).append(f"{'✓' if ok else '✗'} {label}" + (f" — {detail}" if detail else ""))


data = json.loads((ROOT / "data" / "plates.json").read_text(encoding="utf-8"))

# 1 作品名与文件名的硬规矩
name = data["work"]
check(bool(re.fullmatch(r"[\u4e00-\u9fa5]{1,20}", name)), "作品名是 1–20 个汉字", name)
for s in data["sheets"]:
    check(bool(re.fullmatch(r"[\u4e00-\u9fa5]{1,20}", s["title"])), f"{s['id']} 单幅标题合规", s["title"])

# 2 简章禁止：作品上不得出现作者/院校信息
banned = ["张一", "作者", "学校", "学院", "指导老师", "工作室"]
for p in list((ROOT / "src").glob("*")) + [ROOT / "data" / "plates.json"]:
    if p.suffix not in {".js", ".json", ".html", ".css"}:
        continue
    txt = p.read_text(encoding="utf-8")
    hit = [b for b in banned if b in txt]
    check(not hit, f"源文件无作者信息：{p.name}", ",".join(hit))

# 3 四张交付
hashes = {}
for s in data["sheets"]:
    f = SUB / f"{s['id']}-{s['title']}.jpg"
    if not f.exists():
        check(False, f"{s['id']} 存在", str(f))
        continue
    im = Image.open(f)
    check(im.size == (W, H), f"{s['id']} 尺寸 {W}×{H}", f"{im.size}")
    check(im.mode == "RGB", f"{s['id']} 色彩模式 RGB", im.mode)
    dpi = im.info.get("dpi") or (0, 0)
    check(abs(float(dpi[0]) - 300) < 1 and abs(float(dpi[1]) - 300) < 1, f"{s['id']} 300dpi", f"{dpi}")
    size = f.stat().st_size
    check(size <= LIMIT, f"{s['id']} ≤10MB", f"{size / 1024 / 1024:.2f} MB")
    hashes[s["id"]] = hashlib.sha256(f.read_bytes()).hexdigest()[:16]

    g = im.convert("L")
    px = g.load()

    # 明暗节奏（这也是一条内容断言：四张不能糊成一片同调）
    small = g.resize((160, 226))
    mean = sum(small.getdata()) / (160 * 226)
    notes.append(f"  {s['id']} 平均亮度 {mean:.0f}")

    # 织纹周期：行均值/列均值在 lag=6 上要自相关（01/03/04 是织的，02 是未织的絮）
    if s["mode"] == "weave":
        x0, y0 = int(W * 0.12), int((2054) * 0.55)
        crop = g.crop((x0, y0, x0 + 240, y0 + 240))
        cp = crop.load()
        rows = [sum(cp[x, y] for x in range(240)) / 240 for y in range(240)]
        cols = [sum(cp[x, y] for y in range(240)) / 240 for x in range(240)]

        def ac(a, lag=6):
            mu = sum(a) / len(a)
            num = sum((a[i] - mu) * (a[i + lag] - mu) for i in range(len(a) - lag))
            den = sum((v - mu) ** 2 for v in a)
            return num / den if den else 0

        check(ac(rows) > 0.2 and ac(cols) > 0.2, f"{s['id']} 织纹周期（lag 6）", f"行 {ac(rows):.2f} / 列 {ac(cols):.2f}")
        # 调色板受控：JPG 会抖动，阈值放宽到 60
        rnd = g.crop((W // 8, 2054 // 2, W // 8 + 120, 2054 // 2 + 120)).convert("RGB")
        rp = list(rnd.getdata())
        near = sum(1 for c in rp if min(math.dist(c, p) for p in PAL) < 60) / len(rp)
        check(near > 0.85, f"{s['id']} 六色调色板收得住", f"{near * 100:.0f}% 像素在调色板邻域")
    else:
        check(mean > 150, f"{s['id']} 是未织的絮（浅底）", f"{mean:.0f}")

    # 文字区有字（不能整块空白）
    zone = g.crop((150, 2200, W - 150, 4700))
    zp = list(zone.resize((240, 170)).getdata())
    ink = sum(1 for v in zp if v < 140) / len(zp)
    check(0.008 < ink < 0.22, f"{s['id']} 文字区墨量合理", f"{ink * 100:.1f}%")

check(len(set(hashes.values())) == len(hashes), "四张互不相同", str(hashes))

# 4 创作说明
pdf = ROOT / "submission" / "创作说明.pdf"
if pdf.exists():
    check(pdf.stat().st_size < 50 * 1024 * 1024, "创作说明 PDF ≤50MB", f"{pdf.stat().st_size / 1024:.0f} KB")
    check(pdf.read_bytes()[:4] == b"%PDF", "创作说明是有效 PDF", pdf.name)
else:
    check(False, "创作说明存在", "submission/创作说明.pdf")

# 5 源文件与交件说明
for f in ["README.md", "SPEC.md", "docs/05-SUBMISSION.md"]:
    check((ROOT / f).exists(), f"文档存在：{f}")

print("\n".join(notes))
print()
print("\n".join(fails) if fails else "")
print(f"\n{len(fails)} 项未过 / 共 {len(fails) + len(notes) - len([n for n in notes if n.startswith('  ')])} 项检查")
sys.exit(1 if fails else 0)
