#!/usr/bin/env python3
"""Import V3 audio: match each new SFX's mean loudness to the old sample it replaces (the game's
per-sound volumes were tuned on those), trim leading silence, encode mono 96 kbps; re-encode music."""
import os, re, shutil, subprocess, sys, tempfile
SRC = os.environ.get('AUDIO_SRC', '/home/ubuntu/v3src/audio')
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets')
MUSIC = {'title', 'combat', 'boss'}
STEREO = {'ambience'}
# New samples with no predecessor: loudness reference.
REF = {'armor_recharge': 'pickup_armor', 'human_hit': 'robot_hit', 'human_death': 'robot_death', 'hound_step': 'robot_step'}

def mean_db(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'mean_volume: (-?[\d.]+) dB', out)
    p = re.search(r'max_volume: (-?[\d.]+) dB', out)
    return float(m.group(1)), float(p.group(1))

old_dir = tempfile.mkdtemp()
for f in os.listdir(f'{DST}/sfx'):
    shutil.copy(f'{DST}/sfx/{f}', old_dir)
rows = []
for f in sorted(os.listdir(SRC)):
    name = f[:-4]
    src = f'{SRC}/{f}'
    if name in MUSIC:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '2', '-b:a', '112k', f'{DST}/music/{f}'], check=True)
        rows.append((name, 'music', ''))
        continue
    ref = f'{old_dir}/{REF.get(name, name)}.mp3'
    new_m, new_p = mean_db(src)
    gain = 0.0
    if os.path.exists(ref):
        old_m, _ = mean_db(ref)
        gain = max(-12.0, min(12.0, old_m - new_m))
    # Never clip: cap the gain at the new file's headroom (−0.5 dBFS).
    gain = min(gain, -0.5 - new_p)
    af = [f'volume={gain:.2f}dB']
    if name not in STEREO and name not in ('drone_loop', 'rocket_loop', 'heartbeat'):
        af.insert(0, 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005')
    ch = '2' if name in STEREO else '1'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', ','.join(af), '-ac', ch, '-ar', '44100', '-b:a', '128k' if ch == '2' else '96k', f'{DST}/sfx/{f}'], check=True)
    rows.append((name, f'{gain:+.1f} dB', 'ref ' + REF.get(name, name) if os.path.exists(ref) else 'no ref'))
shutil.rmtree(old_dir)
for r in rows:
    print(*r)
