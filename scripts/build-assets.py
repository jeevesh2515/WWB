#!/usr/bin/env python3
"""Build web-ready assets from .asset-src (CC0 Poly Haven sources + generated SFX).

Textures -> 1k WebP, HDRI -> 1k .hdr (lighting) + 2k tone-mapped WebP (sky backdrop),
models -> single .glb with WebP textures (gltf-transform), SFX -> trimmed, peak-normalised MP3.
"""
import glob
import os
import re
import subprocess

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, '.asset-src')
OUT = os.path.join(ROOT, 'public', 'assets')


def textures():
    os.makedirs(f'{OUT}/tex', exist_ok=True)
    for path in sorted(glob.glob(f'{SRC}/tex/*.jpg')):
        name = os.path.basename(path)[:-4]
        img = Image.open(path)
        if img.width > 1024:
            img = img.resize((1024, 1024), Image.LANCZOS)
        quality = 88 if name.endswith('_nor') else 80
        img.convert('RGB').save(f'{OUT}/tex/{name}.webp', 'WEBP', quality=quality, method=6)
        print('tex', name)


def hdri():
    os.makedirs(f'{OUT}/hdri', exist_ok=True)
    src1k = glob.glob(f'{SRC}/hdri/*_1k.hdr')[0]
    with open(src1k, 'rb') as a, open(f'{OUT}/hdri/sky_1k.hdr', 'wb') as b:
        b.write(a.read())
    src2k = glob.glob(f'{SRC}/hdri/*_2k.hdr')[0]
    hdr = cv2.imread(src2k, cv2.IMREAD_UNCHANGED)[:, :, ::-1].astype(np.float32)  # BGR->RGB linear
    # Keep it linear-ish but compress highlights; the renderer tone maps the backdrop again.
    exposure = 1.0
    x = hdr * exposure
    mapped = x / (1.0 + x * 0.35)
    srgb = np.where(mapped <= 0.0031308, mapped * 12.92, 1.055 * np.power(np.clip(mapped, 0, None), 1 / 2.4) - 0.055)
    img = Image.fromarray((np.clip(srgb, 0, 1) * 255).astype(np.uint8))
    img.save(f'{OUT}/hdri/sky_2k.webp', 'WEBP', quality=86, method=6)
    print('hdri', img.size, float(hdr.max()))


def models():
    os.makedirs(f'{OUT}/models', exist_ok=True)
    cli = os.path.join(ROOT, 'node_modules', '.bin', 'gltf-transform')
    for gltf in sorted(glob.glob(f'{SRC}/models/*/*.gltf')):
        name = os.path.basename(gltf)[:-5]
        tmp = f'/tmp/{name}.glb'
        out = f'{OUT}/models/{name}.glb'
        subprocess.run([cli, 'copy', gltf, tmp], check=True, capture_output=True)
        subprocess.run([cli, 'resize', tmp, tmp, '--width', '1024', '--height', '1024'], check=True, capture_output=True)
        subprocess.run([cli, 'webp', tmp, tmp, '--quality', '82'], check=True, capture_output=True)
        subprocess.run([cli, 'dedup', tmp, out], check=True, capture_output=True)
        print('model', name, os.path.getsize(out))


def sfx():
    os.makedirs(f'{OUT}/sfx', exist_ok=True)
    loops = {'ambience', 'rocket_loop'}
    for path in sorted(glob.glob(f'{SRC}/sfx/*.mp3')):
        name = os.path.basename(path)[:-4]
        filters = [] if name in loops else ['silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004']
        probe = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', ','.join(filters + ['volumedetect']), '-f', 'null', '-'], capture_output=True, text=True).stderr
        peak = float(re.search(r'max_volume: (-?[\d.]+) dB', probe).group(1))
        gain = -1.0 - peak
        af = ','.join(filters + [f'volume={gain:.2f}dB'])
        out = f'{OUT}/sfx/{name}.mp3'
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', path, '-af', af, '-ac', '2' if name in loops else '1', '-b:a', '128k' if name in loops else '96k', out], check=True)
        print('sfx', name, f'peak {peak} -> gain {gain:.1f}', os.path.getsize(out))


if __name__ == '__main__':
    import sys
    parts = sys.argv[1:] or ['textures', 'hdri', 'models', 'sfx']
    for p in parts:
        globals()[p]()
