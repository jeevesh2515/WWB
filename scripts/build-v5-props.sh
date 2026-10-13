#!/usr/bin/env bash
# V5 port props: Tripo scans (.asset-src/v5/models) -> web GLBs (public/assets/v5props).
# weld + meshopt simplify to a triangle budget, 1024/2048 WebP textures, meshopt compression.
set -euo pipefail
cd "$(dirname "$0")/.."
GT=node_modules/.bin/gltf-transform
OUT=public/assets/models
mkdir -p "$OUT" /tmp/v5p
# name ratio texsize
for spec in "rtg_crane 0.065 1024" "sts_crane 0.03 1024" "reach_stacker 0.035 1024"; do
  set -- $spec
  n=$1; r=$2; t=$3
  $GT weld ".asset-src/v5/models/$n.glb" /tmp/v5p/$n.a.glb
  $GT simplify /tmp/v5p/$n.a.glb /tmp/v5p/$n.b.glb --ratio "$r" --error 0.002
  $GT resize /tmp/v5p/$n.b.glb /tmp/v5p/$n.c.glb --width "$t" --height "$t"
  $GT webp /tmp/v5p/$n.c.glb /tmp/v5p/$n.d.glb --quality 82
  $GT meshopt /tmp/v5p/$n.d.glb "$OUT/$n.glb" --level medium
  ls -la "$OUT/$n.glb"
done
