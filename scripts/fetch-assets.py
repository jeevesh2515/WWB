#!/usr/bin/env python3
"""Download the CC0 Poly Haven source assets used by Iron Rift into ./.asset-src (not shipped).

Run `python3 scripts/fetch-assets.py`, then `node scripts/build-assets.mjs` style processing
(see README) converts them into compact files under public/assets/.
All Poly Haven assets are CC0 (https://polyhaven.com/license).
"""
import json
import os
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..', '.asset-src')
HDRI = 'the_sky_is_on_fire'
TEXTURES = [
    'hangar_concrete_floor',
    'concrete_wall_008',
    'rusty_metal_02',
    'corrugated_iron_02',
    'metal_plate',
    'painted_metal_shutter',
    'concrete_floor_worn_001',
]
MODELS = ['barrel_03', 'old_military_crate', 'wooden_military_crate', 'medical_box', 'ammo_box', 'propane_tank', 'utility_box_02', 'security_light']


def get(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    req = urllib.request.Request(url, headers={'User-Agent': 'ironrift-asset-fetch'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        f.write(r.read())
    print('got', dest, os.path.getsize(dest))


def files(asset):
    req = urllib.request.Request(f'https://api.polyhaven.com/files/{asset}', headers={'User-Agent': 'ironrift-asset-fetch'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    f = files(HDRI)
    get(f['hdri']['1k']['hdr']['url'], f'{ROOT}/hdri/{HDRI}_1k.hdr')
    get(f['tonemapped']['url'], f'{ROOT}/hdri/{HDRI}_tonemapped.jpg') if 'tonemapped' in f else None
    get(f['hdri']['4k']['exr']['url'] if False else f['hdri']['2k']['hdr']['url'], f'{ROOT}/hdri/{HDRI}_2k.hdr')
    for t in TEXTURES:
        f = files(t)
        for key, name in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')]:
            if key not in f:
                print('missing', t, key)
                continue
            get(f[key]['1k']['jpg']['url'], f'{ROOT}/tex/{t}_{name}.jpg')
    for m in MODELS:
        f = files(m)
        g = f['gltf']['1k']['gltf']
        get(g['url'], f'{ROOT}/models/{m}/{m}.gltf')
        for rel, info in g.get('include', {}).items():
            get(info['url'], f'{ROOT}/models/{m}/{rel}')


if __name__ == '__main__':
    main()
