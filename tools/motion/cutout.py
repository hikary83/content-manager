# 흰 바탕 상품 사진에서 바탕만 투명하게 (뜯어 보기 템플릿 8 · 모션팀, 2026-11-23). AI 없음 — 픽셀은 그대로 두고 바탕만 뺀다.
# 사진 가장자리에서 이어진 흰 바탕만 지운다. 그래서 상품 안의 흰 빛(연한 색 몸통의 하이라이트)은 뚫리지 않는다
#   (ffmpeg colorkey는 색만 보고 빼서 연분홍 몸통의 빛 부분까지 뚫었다).
#   ~/.hikary-depth/Scripts/python.exe tools/motion/cutout.py photo-1.png cut-1.png [흰색 기준 246]
# 바탕에 회색 그림자·글자가 섞여 있으면 그 자리는 남는다 → 사진을 상품만 남게 먼저 자른다. 결과는 진한 바탕에 얹어 본다.
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
src, out = sys.argv[1], sys.argv[2]
t = int(sys.argv[3]) if len(sys.argv) > 3 else 246
im = Image.open(src).convert('RGB')
w, h = im.size
r, g, b = im.split()
mask = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: 255 if v >= t else 0)  # 세 색이 모두 t 이상 = 흰색
for xy in [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]:
    if mask.getpixel(xy) == 255:
        ImageDraw.floodfill(mask, xy, 128, thresh=0)  # 가장자리에서 이어진 흰색 = 바탕
alpha = mask.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.8))
rgba = im.convert('RGBA')
rgba.putalpha(alpha)
rgba.save(out)
print(f'{out} ({w}x{h}, 흰색 기준 {t})')
