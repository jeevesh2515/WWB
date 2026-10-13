#!/usr/bin/env python3
"""Iron Rift V2 asset build: generated audio/music, VFX atlases, HUD icons, backgrounds,
photo-heightfield weapon meshes and the rigged Mixamo robot.

  python3 scripts/build-v2.py [audio|music|vfx|ui|guns|chars ...]
"""
import glob
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, '.asset-src')
OUT = os.path.join(ROOT, 'public', 'assets')

MUSIC = {'music_title', 'music_combat', 'music_boss'}
LOOPS = {'ambience', 'rocket_loop', 'drone_loop', 'heartbeat'}


def ff_peak(path, filters):
    probe = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', ','.join(filters + ['volumedetect']), '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    return float(re.search(r'max_volume: (-?[\d.]+) dB', probe).group(1))


def audio():
    """Generated SFX -> trimmed, peak-normalised mono MP3 (loops stereo)."""
    os.makedirs(f'{OUT}/sfx', exist_ok=True)
    for path in sorted(glob.glob(f'{SRC}/audio/*.mp3')):
        name = os.path.basename(path)[:-4]
        if name in MUSIC:
            continue
        filters = [] if name in LOOPS else ['silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004']
        # Short cues get a gentle tail fade so trimmed ElevenLabs renders never click.
        peak = ff_peak(path, filters)
        gain = -1.0 - peak
        af = ','.join(filters + [f'volume={gain:.2f}dB'])
        out = f'{OUT}/sfx/{name}.mp3'
        stereo = name in LOOPS
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', path, '-af', af, '-ac', '2' if stereo else '1',
                        '-b:a', '128k' if stereo else '96k', out], check=True)
        print('sfx', name, os.path.getsize(out))


def music():
    """Music -> 112 kbps stereo MP3, loudness-matched, streamed through <audio> at runtime."""
    os.makedirs(f'{OUT}/music', exist_ok=True)
    for name in sorted(MUSIC):
        src = f'{SRC}/audio/{name}.mp3'
        out = f'{OUT}/music/{name[6:]}.mp3'
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11',
                        '-ac', '2', '-ar', '44100', '-b:a', '112k', out], check=True)
        print('music', name, os.path.getsize(out))


# ─── VFX atlases ──────────────────────────────────────────────────────────

def cells(img, cols, rows):
    w, h = img.size
    cw, ch = w / cols, h / rows
    for r in range(rows):
        for c in range(cols):
            yield img.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))


def fit_cell(sprite, size, additive, margin=0.06, keep_aspect_center=True):
    """Tight-crop the sprite content and centre it in a size x size cell."""
    arr = np.asarray(sprite.convert('RGBA')).astype(np.float32)
    if additive:
        lum = arr[..., :3].max(axis=2)
        mask = lum > 14
    else:
        mask = arr[..., 3] > 8
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return Image.new('RGBA', (size, size), (0, 0, 0, 0))
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = sprite.crop((x0, y0, x1, y1)).convert('RGBA')
    inner = int(size * (1 - 2 * margin))
    scale = inner / max(crop.width, crop.height)
    crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))), Image.LANCZOS)
    cell = Image.new('RGBA', (size, size), (0, 0, 0, 0 if not additive else 255))
    cell.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2), crop)
    if additive:
        # Additive sprites: alpha = brightness so edge fringes vanish; premultiplied-friendly.
        a = np.asarray(cell).astype(np.float32)
        lum = a[..., :3].max(axis=2)
        alpha = np.clip((lum - 6) / 200.0, 0, 1) ** 0.8
        a[..., 3] = alpha * 255
        # Soft radial vignette removes any residual square edge.
        yy, xx = np.mgrid[0:size, 0:size]
        d = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
        a[..., 3] *= np.clip((1.0 - d) / 0.12, 0, 1)
        cell = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')
    return cell


def place(atlas, frame, cell, grid=4):
    """Frame f is sampled by the shader at cell (f % grid, f // grid) with flipY, so row 0 = image bottom."""
    size = cell.width
    x = (frame % grid) * size
    y = (grid - 1 - frame // grid) * size
    atlas.paste(cell, (x, y))


def vfx():
    os.makedirs(f'{OUT}/fx', exist_ok=True)
    S = 256
    g = f'{SRC}/gen'
    # Additive atlas: 0-7 fire, 8-9 muzzle front, 10-11 muzzle side, 12 streak, 13 glow, 14 ring, 15 spark burst.
    add = Image.new('RGBA', (S * 4, S * 4), (0, 0, 0, 0))
    fire = list(cells(Image.open(f'{g}/fx_fire.png').convert('RGB'), 4, 4))
    for i, k in enumerate([0, 2, 5, 7, 9, 10, 12, 14]):  # fireball-ish cells (rounder shapes)
        place(add, i, fit_cell(fire[k], S, True))
    muzzle = list(cells(Image.open(f'{g}/fx_muzzle.png').convert('RGB'), 2, 2))
    place(add, 8, fit_cell(muzzle[0], S, True, 0.03))
    place(add, 9, fit_cell(muzzle[1], S, True, 0.03))
    place(add, 10, fit_cell(muzzle[2], S, True, 0.02))
    place(add, 11, fit_cell(muzzle[3], S, True, 0.02))
    sparks = list(cells(Image.open(f'{g}/fx_sparks.png').convert('RGB'), 2, 2))
    place(add, 12, fit_cell(sparks[0], S, True, 0.01))
    place(add, 13, fit_cell(sparks[1], S, True, 0.0))
    place(add, 14, fit_cell(sparks[2], S, True, 0.02))
    place(add, 15, fit_cell(sparks[3], S, True, 0.02))
    add.save(f'{OUT}/fx/additive.webp', 'WEBP', quality=88, method=6)
    # Extra flame licks (tall sprites) for burning barrels / wreck fires.
    flames = Image.new('RGBA', (S * 4, S), (0, 0, 0, 0))
    for i, k in enumerate([1, 3, 11, 13]):
        flames.paste(fit_cell(fire[k], S, True), (i * S, 0))
    flames.save(f'{OUT}/fx/flames.webp', 'WEBP', quality=86, method=6)
    # Alpha atlas: 16 smoke puffs. Normalise colour to neutral light grey; alpha carries the shape.
    alpha = Image.new('RGBA', (S * 4, S * 4), (0, 0, 0, 0))
    smoke = list(cells(Image.open(f'{g}/fx_smoke.png').convert('RGBA'), 4, 4))
    for i, sp in enumerate(smoke):
        c = fit_cell(sp, S, False, 0.02)
        a = np.asarray(c).astype(np.float32)
        lum = a[..., :3].mean(axis=2, keepdims=True)
        a[..., :3] = np.clip(0.55 * 255 + (lum - lum.mean()) * 1.4, 40, 255)
        yy, xx = np.mgrid[0:S, 0:S]
        d = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
        a[..., 3] *= np.clip((1.0 - d) / 0.15, 0, 1)
        place(alpha, i, Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'))
    alpha.save(f'{OUT}/fx/smoke.webp', 'WEBP', quality=86, method=6)
    # Decals 2x2: concrete hole, metal hole, scorch, oil.
    dec = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    for i, sp in enumerate(cells(Image.open(f'{g}/fx_decals.png').convert('RGBA'), 2, 2)):
        c = fit_cell(sp, 256, False, 0.02)
        dec.paste(c, ((i % 2) * 256, (i // 2) * 256))
    dec.save(f'{OUT}/fx/decals.webp', 'WEBP', quality=86, method=6)
    print('vfx atlases written')


# ─── UI ───────────────────────────────────────────────────────────────────

def ui():
    os.makedirs(f'{OUT}/ui', exist_ok=True)
    g = f'{SRC}/gen'
    for name, w, q in [('loading_bg', 1600, 72), ('title_bg', 1920, 78)]:
        im = Image.open(f'{g}/{name}.png').convert('RGB')
        im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
        im.save(f'{OUT}/ui/{name}.webp', 'WEBP', quality=q, method=6)
        print('ui', name, os.path.getsize(f'{OUT}/ui/{name}.webp'))
    # Tiny blurred placeholder so the loading screen paints instantly (inlined as data URI later).
    im = Image.open(f'{g}/loading_bg.png').convert('RGB').resize((48, 27), Image.LANCZOS)
    im.save(f'{OUT}/ui/loading_bg_tiny.webp', 'WEBP', quality=50)

    def icon_sheet(src, cols, rows, names, size):
        for name, sp in zip(names, cells(Image.open(src).convert('RGBA'), cols, rows)):
            if name is None:
                continue
            arr = np.asarray(sp).astype(np.float32)
            mask = arr[..., 3] > 20
            ys, xs = np.nonzero(mask)
            crop = sp.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            a = np.asarray(crop).astype(np.float32)
            a[..., :3] = 255  # pure white glyph; CSS tints it
            crop = Image.fromarray(a.astype(np.uint8), 'RGBA')
            wmax, hmax = size
            s = min(wmax / crop.width, hmax / crop.height)
            crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.LANCZOS)
            crop.save(f'{OUT}/ui/icon_{name}.webp', 'WEBP', quality=90, method=6, lossless=False)
            print('icon', name, crop.size)

    icon_sheet(f'{g}/ui_weapons.png', 2, 2, ['rifle', 'shotgun', 'rocket', 'grenade'], (320, 128))
    icon_sheet(f'{g}/ui_perks.png', 3, 3, ['hollow', 'quick', 'plated', 'scavenger', 'overclock', 'demolitions', 'vampire', 'choke', 'skull'], (160, 160))


# ─── Photo-heightfield guns ───────────────────────────────────────────────

GUNS = {
    # name: (length_m along the long axis, max half-thickness m, texture width px, orientation)
    'rifle': (0.86, 0.019, 1600, 'h'),
    'shotgun': (1.00, 0.020, 1600, 'h'),
    'launcher': (1.12, 0.055, 1600, 'h'),
    'rocket': (0.62, 0.06, 1024, 'h'),
    'grenade': (0.105, 0.04, 512, 'v'),
}


def segment(rgb):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # Background has a soft vertical gradient: estimate per-row bg from the left/right borders.
    row_bg = np.median(np.concatenate([rgb[:, :24], rgb[:, -24:]], axis=1), axis=1)  # (h,3)
    diff = np.abs(rgb.astype(np.float32) - row_bg[:, None, :].astype(np.float32)).max(axis=2)
    sat = rgb.astype(np.float32).max(axis=2) - rgb.astype(np.float32).min(axis=2)
    mask = ((diff > 26) | (sat > 22)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros_like(mask)
    big = stats[1:, cv2.CC_STAT_AREA].max()
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > big * 0.02:
            keep[lab == i] = 1
    # Fill only small holes (keep trigger-guard / stock openings).
    inv = (1 - keep).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n2):
        x, y, ww, hh, area = st2[i]
        touches = x == 0 or y == 0 or x + ww >= w or y + hh >= h
        if not touches and area < 900:
            keep[lab2 == i] = 1
    return keep, bg


def guns():
    os.makedirs(f'{OUT}/guns', exist_ok=True)
    meta = {}
    for name, (length, cap_m, tex_w, orient) in GUNS.items():
        src = np.asarray(Image.open(f'{SRC}/gen/ref_{name}.png').convert('RGB'))
        mask, bg = segment(src)
        ys, xs = np.nonzero(mask)
        pad = 6
        x0, x1 = max(0, xs.min() - pad), min(src.shape[1], xs.max() + 1 + pad)
        y0, y1 = max(0, ys.min() - pad), min(src.shape[0], ys.max() + 1 + pad)
        rgb = src[y0:y1, x0:x1]
        m = mask[y0:y1, x0:x1]
        long_px = (x1 - x0 - 2 * pad) if orient == 'h' else (y1 - y0 - 2 * pad)
        m_per_px = length / long_px
        # Height: rounded bevel profile z = sqrt(d (2c - d)), c = min(cap, local half-extent along rows & columns).
        dist = cv2.distanceTransform(m, cv2.DIST_L2, 5) * m_per_px
        hh, ww = m.shape
        rcol = np.zeros_like(dist)
        rrow = np.zeros_like(dist)
        for x in range(ww):
            col = m[:, x]
            if not col.any():
                continue
            edges = np.flatnonzero(np.diff(np.concatenate([[0], col, [0]])))
            for a, b in zip(edges[::2], edges[1::2]):
                rcol[a:b, x] = (b - a) * 0.5 * m_per_px
        for y in range(hh):
            row = m[y]
            if not row.any():
                continue
            edges = np.flatnonzero(np.diff(np.concatenate([[0], row, [0]])))
            for a, b in zip(edges[::2], edges[1::2]):
                rrow[y, a:b] = (b - a) * 0.5 * m_per_px
        c = np.minimum(cap_m, np.minimum(rcol, rrow))
        c = cv2.GaussianBlur(c.astype(np.float32), (0, 0), 3) * m
        d = np.minimum(dist, c)
        z = np.sqrt(np.clip(d * (2 * c - d), 0, None)) * m
        z = cv2.GaussianBlur(z.astype(np.float32), (0, 0), 1.2)
        zmax = float(z.max())
        # Output resolution.
        scale = tex_w / (ww if orient == 'h' else hh)
        W, H = int(round(ww * scale)), int(round(hh * scale))
        rgb_s = cv2.resize(rgb, (W, H), interpolation=cv2.INTER_AREA)
        m_s = cv2.resize(m.astype(np.float32), (W, H), interpolation=cv2.INTER_AREA)
        # Colour bleed outside the mask so mip levels never pull in grey background.
        bleed = rgb_s.copy().astype(np.float32)
        known = (m_s > 0.5).astype(np.uint8)
        bleed = cv2.inpaint(bleed.astype(np.uint8), (1 - known).astype(np.uint8), 5, cv2.INPAINT_TELEA)
        # De-light a little: lift the baked shading so scene lighting does the work.
        lin = (bleed.astype(np.float32) / 255.0) ** 2.2
        lum = lin.mean(axis=2, keepdims=True)
        blur = cv2.GaussianBlur(lum, (0, 0), 24)[..., None] if lum.ndim == 3 else cv2.GaussianBlur(lum, (0, 0), 24)
        if blur.ndim == 2:
            blur = blur[..., None]
        lin = lin * np.clip(0.16 / (blur + 0.02), 0.7, 1.9)
        out_rgb = (np.clip(lin, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)
        alpha = (np.clip(m_s, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(np.dstack([out_rgb, alpha]), 'RGBA').save(f'{OUT}/guns/{name}.webp', 'WEBP', quality=88, method=6)
        # Normal map from luminance detail (tangent space: x right, y up).
        g = cv2.GaussianBlur(cv2.cvtColor(rgb_s, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0, (0, 0), 1.0)
        gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        k = 2.2
        nx, ny, nz = -gx * k, gy * k, np.ones_like(g)
        ln = np.sqrt(nx * nx + ny * ny + nz * nz)
        nrm = np.dstack([nx / ln, ny / ln, nz / ln]) * 0.5 + 0.5
        Image.fromarray((nrm * 255).astype(np.uint8), 'RGB').save(f'{OUT}/guns/{name}_n.webp', 'WEBP', quality=90, method=6)
        # Height at half the texture resolution, 8-bit relative to zmax (lossless).
        hW, hH = max(2, W // 4), max(2, H // 4)
        zs = cv2.resize(z, (hW, hH), interpolation=cv2.INTER_AREA)
        Image.fromarray((np.clip(zs / zmax, 0, 1) * 255).astype(np.uint8), 'L').save(f'{OUT}/guns/{name}_h.png', optimize=True)
        meta[name] = {
            'width_m': ww * m_per_px, 'height_m': hh * m_per_px, 'zmax': zmax, 'tex': [W, H], 'hmap': [hW, hH],
        }
        # Debug preview for anchor picking.
        prev = Image.fromarray(np.dstack([out_rgb, alpha]), 'RGBA')
        bgc = Image.new('RGBA', prev.size, (60, 60, 60, 255))
        bgc.alpha_composite(prev)
        bgc.convert('RGB').save(f'/tmp/gun_{name}.png')
        print('gun', name, 'size m', round(ww * m_per_px, 3), round(hh * m_per_px, 3), 'zmax', round(zmax, 4), 'tex', W, H)
    with open(f'{OUT}/guns/guns.json', 'w') as f:
        json.dump(meta, f, indent=1)


def chars():
    os.makedirs(f'{OUT}/chars', exist_ok=True)
    subprocess.run(['node', os.path.join(HERE, 'prune-chars.mjs')], check=True)


if __name__ == '__main__':
    parts = sys.argv[1:] or ['audio', 'music', 'vfx', 'ui', 'guns', 'chars']
    for p in parts:
        globals()[p]()
