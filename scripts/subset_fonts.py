"""把 fontsource 里「这份版式真的用得上」的字形分片挑出来，随仓库带走。

为什么不用整套：Noto Serif/Sans SC 各 60–70 MB，仓库吃不消。
为什么必须挑「用得上」的：只要有一个字没进子集，浏览器会静默回落到系统字体，
图照样出，字形全变——所以最后要反过来核对：每个用到的字都落在某个已收的 unicode-range 里。

干净环境（没有 node_modules）时只核对、不生成：新 clone 里字体已随仓库存在，
verify 不该因为「还没 npm ci」就死掉。

用法：py -3 scripts/subset_fonts.py
产出：assets/fonts/*.woff2 与 assets/fonts/fonts.css
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

FACES = [
    ("@fontsource/noto-serif-sc", "Noto Serif SC", ["300", "600"]),
    ("@fontsource/noto-sans-sc", "Noto Sans SC", ["300"]),
]

FIXED = (
    "0123456789"
    "·—–…“”‘’《》〈〉「」『』、，。；：？！（）%×/+-=.　"
    "壹贰叁肆五六七八九十其一三四每厘米约经纬不敢验关絮桑织组图四幅呢"
)

# 版式上的每一个字（全部来自 data/plates.json 与上面这份补充表）
data = json.loads((ROOT / "data" / "plates.json").read_text(encoding="utf-8"))
text = FIXED + data["work"] + data["subtitle"]
for s in data["sheets"]:
    for k in ("num", "title", "seq", "note", "source"):
        text += s.get(k) or ""
    text += "".join(s.get("quote") or [])
chars = {c for c in text if not c.isspace()}
codes = {ord(c) for c in chars}
print(f"版式用字 {len(chars)} 个")

RANGE_RE = re.compile(r"@font-face\s*\{([^}]*)\}", re.M)


def parse_ranges(css_text):
    out = []
    for block in RANGE_RE.findall(css_text):
        src = re.search(r"url\(([^)]+\.woff2)\)", block)
        rng = re.search(r"unicode-range:\s*([^;]+);", block)
        if not src or not rng:
            continue
        codes_in = set()
        for part in rng.group(1).split(","):
            part = part.strip().replace("U+", "")
            if "-" in part:
                a, b = part.split("-")
                codes_in.update(range(int(a, 16), int(b, 16) + 1))
            elif part:
                codes_in.add(int(part, 16))
        out.append((Path(src.group(1)).name, codes_in, rng.group(1).strip()))
    return out


CSS = OUT / "fonts.css"
have_pkgs = all((ROOT / "node_modules" / pkg).exists() for pkg, _, _ in FACES)

if not have_pkgs:
    # 干净环境：只核对仓库里已有的字体是否覆盖版式用字
    if not CSS.exists():
        print("✗ 既没有 node_modules，也没有 assets/fonts/fonts.css")
        sys.exit(1)
    covered = set()
    for _, codes_in, _ in parse_ranges(CSS.read_text(encoding="utf-8")):
        covered |= codes_in
    missing = codes - covered
    if missing:
        print("✗ 已有字体分片不覆盖：" + "".join(sorted(chr(c) for c in missing)))
        sys.exit(1)
    print("✓ 干净环境：仓库自带字体已覆盖全部用字（本次不重新生成）")
    sys.exit(0)

rules, used, covered = [], [], set()
for pkg, family, weights in FACES:
    for w in weights:
        css_path = ROOT / "node_modules" / pkg / f"{w}.css"
        if not css_path.exists():
            print(f"✗ 缺 {css_path}（先 npm ci）")
            sys.exit(1)
        for name, codes_in, rng in parse_ranges(css_path.read_text(encoding="utf-8")):
            if not (codes & codes_in):
                continue
            src = ROOT / "node_modules" / pkg / "files" / name
            if not src.exists():
                print(f"✗ 缺字形文件 {src}")
                sys.exit(1)
            dst = OUT / name
            if not dst.exists() or dst.stat().st_size != src.stat().st_size:
                shutil.copyfile(src, dst)
            used.append(name)
            covered |= codes & codes_in
            rules.append(
                "@font-face{font-family:'%s';font-style:normal;font-display:block;font-weight:%s;"
                "src:url(./%s) format('woff2');unicode-range:%s;}" % (family, w, name, rng)
            )

missing = codes - covered
CSS.write_text("/* 由 scripts/subset_fonts.py 生成：只收这份版式用得到的字形分片 */\n" + "\n".join(rules) + "\n", encoding="utf-8")
total = sum((OUT / n).stat().st_size for n in used) / 1024 / 1024
print(f"收录 {len(used)} 个字形分片，共 {total:.1f} MB")
if missing:
    print("✗ 有字没有被任何分片覆盖：" + "".join(sorted(chr(c) for c in missing)))
    sys.exit(1)
print("✓ 版式里每个字都落在已收录的 unicode-range 内")
