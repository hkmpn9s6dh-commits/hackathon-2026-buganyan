"""把渲染出的 PNG 转成投稿要的 JPG：RGB / 300dpi / 单张 ≤10MB。

简章原文：「图片格式为 JPG，色彩模式为 RGB，分辨率为 300dpi，每张图片大小不超过 10MB」。
三件事都不能靠猜：dpi 写进 JFIF 头、subsampling=0 保住丝线边缘、超了就降质量重来。

用法：py -3 scripts/to_jpg.py
产出：submission/01-关.jpg … 04-织.jpg
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submission"
OUT.mkdir(parents=True, exist_ok=True)
LIMIT = 10 * 1024 * 1024

data = json.loads((ROOT / "data" / "plates.json").read_text(encoding="utf-8"))
rows = []
for s in data["sheets"]:
    src = ROOT / "output" / f"{s['id']}.png"
    im = Image.open(src).convert("RGB")
    assert im.size == (3508, 4961), f"{src} 尺寸不对：{im.size}"
    q = 94
    while q >= 72:
        dst = OUT / f"{s['id']}-{s['title']}.jpg"
        im.save(dst, "JPEG", quality=q, subsampling=0, optimize=True, dpi=(300, 300), progressive=False)
        size = dst.stat().st_size
        if size <= LIMIT:
            break
        q -= 3
    dpi = Image.open(dst).info.get("dpi")
    rows.append((dst.name, im.size, f"{dpi[0]:.0f}dpi", f"q{q}", f"{size / 1024 / 1024:.2f} MB"))

for r in rows:
    print("  ".join(str(x) for x in r))
print(f"共 {len(rows)} 张，上限 10 MB")
