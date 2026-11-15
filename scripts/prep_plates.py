"""把生图底版整理成「可织」的条幅。

三件事：
1. 抹掉工具水印（右下角）。不抹的话，量化成 6 色织纹之后 WORKBUDDY 那几个字母仍然读得出来。
2. 裁掉 01 号底版自带的花边（那是生图模型画的织锦边框，进了织纹只剩糊），
   并且一刀切在水印上沿之外——试过拿补丁盖水印，糊过的块比水印还显眼。
3. 统一成同一比例，后面四张同版式才立得住。

用法：py -3 scripts/prep_plates.py
产出：plates/01-guan.png … plates/04-zhi.png（1754×1027，喂给织纹合成）
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "plates" / "raw"
OUT = ROOT / "plates"

# 每张：源文件名关键字 → (裁切框, 输出名)
JOBS = [
    ("横向叙事", (16, 40, 1520, 908), "01-guan.png"),      # 花边整圈在内，一起裁掉
    ("矮土墙", (0, 32, 1536, 932), "03-sang.png"),          # 赤脚到 y≈922，水印从 y≈935 起：切在 932 两头都保住
    ("低矮木架", (0, 32, 1536, 932), "04-zhi.png"),
]

TARGET_W, TARGET_H = 1754, 1027


def find(key: str) -> Path:
    hits = [p for p in RAW.glob("*.png") if key in p.name]
    if len(hits) != 1:
        raise SystemExit(f"底版匹配 {key} 得到 {len(hits)} 个文件")
    return hits[0]


def main() -> None:
    ledger = []
    for key, box, name in JOBS:
        src = find(key)
        im = Image.open(src).convert("RGB")
        im = im.crop(box)
        im = im.resize((TARGET_W, TARGET_H), Image.LANCZOS)
        im.save(OUT / name, optimize=True)
        w, h = im.size
        ledger.append((name, f"{w}×{h}", f"{w / h:.3f}", f"{box[2] - box[0]}×{box[3] - box[1]}"))
    for row in ledger:
        print("  ".join(row))
    print(f"目标比例 {TARGET_W / TARGET_H:.3f}")


if __name__ == "__main__":
    main()
