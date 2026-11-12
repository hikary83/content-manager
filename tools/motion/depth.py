# 2.5D frames for motion videos (2026-11-12). Called by depth.mjs; runs in ~/.hikary-depth (CLAUDE.md §7).
#   python -I depth.py <jobs.json>
# jobs.json: [{photo, depthCache, out, move, strength, focus:[fx,fy], width, height, frames}]
# Depth Anything V2 Small (Apache-2.0 — Base/Large are non-commercial, never use them) reads how far each pixel is.
# Frames only move the photo's own pixels by that depth (backward warp); nothing is painted in — no inpainting.
# Each photo's depth map is cached as a 16-bit PNG, so the model only loads for photos it has not seen.
import json, os, sys, time
from pathlib import Path
import numpy as np, torch, torch.nn.functional as F
from PIL import Image

MODEL = 'depth-anything/Depth-Anything-V2-Small-hf'
# Strength 1 = the 2026-11-12 test, kept small so stretching at edges stays hidden. Pixels are output px.
PAN, PARA, SLIDE_ZOOM = 45, 26, 0.03   # left/right/up/down: camera travel each way · near–far spread · gentle zoom
ZOOM, PUSH = 0.05, 0.07                # in/out: camera zoom · near–far scale spread
MOVES = {'in': ('in', False), 'out': ('in', True), 'right': ('x', False), 'left': ('x', True), 'up': ('y', False), 'down': ('y', True)}
ease = lambda t: t * t * (3 - 2 * t)   # = cubic-bezier(1/3,0,2/3,1), close to the template's .cam curve


def read_depth(job, model):
    cache = Path(job['depthCache'])
    if cache.exists():
        return torch.from_numpy(np.array(Image.open(cache)).astype(np.float32) / 65535)[None, None]
    proc, net = model()
    img = Image.open(job['photo']).convert('RGB')
    with torch.inference_mode():
        pred = net(**proc(images=img, return_tensors='pt')).predicted_depth[None]  # relative inverse depth, near = big
    d = F.interpolate(pred, size=(img.height, img.width), mode='bicubic', align_corners=False)
    lo, hi = torch.quantile(d.flatten(), torch.tensor([0.02, 0.98]))
    d = ((d - lo) / (hi - lo)).clamp(0, 1)
    cache.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((d[0, 0].numpy() * 65535).round().astype(np.uint16)).save(cache)
    return d


def soften(d):
    d = F.max_pool2d(d, 7, 1, 3)                               # grow near edges so they carry a little background
    for _ in range(2):
        d = F.avg_pool2d(d, 7, 1, 3, count_include_pad=False)  # soft steps → slight stretch instead of tears
    return d


def mapper(job, depth, sw, sh):
    w, h, s = job['width'], job['height'], float(job['strength'])
    kind, reverse = MOVES[job['move']]
    cover = max(w / sw, h / sh)                                # object-fit: cover
    vw, vh = w / cover, h / cover
    cx = vw / 2 + (sw - vw) * job['focus'][0]                  # object-position
    cy = vh / 2 + (sh - vh) * job['focus'][1]
    dref = depth[..., int(cy - vh / 2):int(cy + vh / 2), int(cx - vw / 2):int(cx + vw / 2)].median()  # middle depth moves like the camera
    norm = lambda x, y: torch.stack((x / sw * 2 - 1, y / sh * 2 - 1), -1)[None]
    at = lambda x, y: F.grid_sample(depth, norm(x, y), mode='bilinear', padding_mode='border', align_corners=False)[0, 0]

    def coords(e, m, u, v):                                    # output px → source px at time e (0..1), extra zoom m
        e = 1 - e if reverse else e
        z = cover * m
        du, dv = (u - w / 2) / z, (v - h / 2) / z
        if kind == 'in':
            zoom = 1 + ZOOM * s * e
            xb, yb = cx + du / zoom, cy + dv / zoom
            x, y = xb, yb
            for _ in range(3):                                 # depth at the source point → silhouettes move too
                k = 1 / (1 + PUSH * s * e * (at(x, y) - dref))
                x, y = cx + (xb - cx) * k, cy + (yb - cy) * k
            return x, y
        zoom, travel, spread = 1 + SLIDE_ZOOM * s * e, (2 * e - 1) * PAN * s / z, (2 * e - 1) * PARA * s / z
        if kind == 'x':
            xb, y = cx + travel + du / zoom, cy + dv / zoom
            x = xb
            for _ in range(3):
                x = xb + spread * (at(x, y) - dref)
        else:                                                  # camera up → picture slides down
            x, yb = cx + du / zoom, cy - travel + dv / zoom
            y = yb
            for _ in range(3):
                y = yb - spread * (at(x, y) - dref)
        return x, y

    # Smallest extra zoom that keeps every sample inside the photo (checked on a coarse grid), so edges never smear.
    gv, gu = torch.meshgrid(torch.linspace(0, h, 25), torch.linspace(0, w, 15), indexing='ij')
    m = 1.0
    while m < 1.5:
        boxes = [coords(e, m, gu, gv) for e in (0, 0.25, 0.5, 0.75, 1)]
        if all(x.min() >= 0 and x.max() <= sw and y.min() >= 0 and y.max() <= sh for x, y in boxes):
            break
        m += 0.01
    return lambda e, u, v: coords(e, m, u, v), m


def render(job, model):
    t0 = time.perf_counter()
    img = Image.open(job['photo']).convert('RGB')
    depth = read_depth(job, model)
    t1 = time.perf_counter()
    sw, sh = img.width, img.height
    move, m = mapper(job, soften(depth), sw, sh)
    src = torch.from_numpy(np.asarray(img).copy()).permute(2, 0, 1)[None].float() / 255
    w, h, n = job['width'], job['height'], job['frames']
    v, u = torch.meshgrid(torch.arange(h) + 0.5, torch.arange(w) + 0.5, indexing='ij')
    part = Path(job['out'] + '.part')
    part.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        x, y = move(i / max(n - 1, 1), u, v)
        grid = torch.stack((x / sw * 2 - 1, y / sh * 2 - 1), -1)[None]
        frame = F.grid_sample(src, grid, mode='bicubic', padding_mode='border', align_corners=False)[0]
        Image.fromarray((frame.clamp(0, 1) * 255).round().byte().permute(1, 2, 0).numpy()).save(part / f'{i:04d}.jpg', quality=92)
    os.replace(part, job['out'])                               # a finished folder = cached frames
    print(f"2.5D {Path(job['photo']).name} {job['move']} x{job['strength']} {w}x{h} {n}프레임 — 깊이 {t1 - t0:.1f}초, "
          f"프레임 {time.perf_counter() - t1:.1f}초 (여유 확대 {m:.2f})", flush=True)


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # -I ignores PYTHONIOENCODING; the Korean progress line broke on cp949
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    loaded = []

    def model():
        if not loaded:
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation
            loaded.extend((AutoImageProcessor.from_pretrained(MODEL), AutoModelForDepthEstimation.from_pretrained(MODEL).eval()))
        return loaded

    for job in jobs:
        render(job, model)


if __name__ == '__main__':
    main()
