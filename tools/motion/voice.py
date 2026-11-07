# Reads narration lines aloud with Qwen3-TTS 0.6B CustomVoice, speaker Sohee (Apache-2.0, runs on CPU).
# voice.mjs calls it with the voice venv (CLAUDE.md §7):  <venv python> -I tools/motion/voice.py <job.json>
# job: {"model": "<model dir>", "items": [{"text", "slot" (seconds), "seed", "out" (.wav)}]}
# Same text + seed gives the same take on this PC. A line longer than its slot is sped up (pitch kept).
import contextlib, io, json, os, subprocess, sys
import numpy as np, soundfile, torch

with contextlib.redirect_stdout(io.StringIO()):  # qwen_tts prints SoX / flash-attn notices we don't need
    from qwen_tts import Qwen3TTSModel

def trim(a, sr, keep=0.25, thr=0.01):
    # drop silent edges and cap every pause at `keep` s (Sohee sometimes rests 0.5–0.9 s at a comma)
    hop = int(sr * 0.01); n = len(a) // hop
    loud = np.abs(a[:n * hop]).reshape(n, hop).max(1) > thr
    if not loud.any(): return a
    first, last = max(0, loud.argmax() - 3), min(n - 1, n - 1 - loud[::-1].argmax() + 4)
    out, run = [], 0
    for i in range(first, last + 1):
        run = 0 if loud[i] else run + 1
        if run * 0.01 <= keep: out.append(a[i * hop:(i + 1) * hop])
    return np.concatenate(out)

job = json.load(open(sys.argv[1], encoding='utf8'))
torch.set_num_threads(os.cpu_count())
with contextlib.redirect_stdout(io.StringIO()):
    tts = Qwen3TTSModel.from_pretrained(job['model'], device_map='cpu', dtype=torch.float32)
for n, item in enumerate(job['items'], 1):
    torch.manual_seed(item['seed'])
    wavs, sr = tts.generate_custom_voice(text=item['text'], language='Korean', speaker='Sohee',
                                         temperature=0.9, subtalker_temperature=0.9, max_new_tokens=600)
    a = trim(np.asarray(wavs[0], dtype=np.float32), sr)
    dur = len(a) / sr
    tempo = min(1.5, dur / item['slot'] * 1.02) if dur > item['slot'] else 1.0
    if tempo > 1:
        raw = item['out'] + '.raw.wav'
        soundfile.write(raw, a, sr)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', f'atempo={tempo:.3f}', item['out']], check=True)
        os.remove(raw)
    else:
        soundfile.write(item['out'], a, sr)
    print(f"voice {n}/{len(job['items'])}: {dur:.2f}s / slot {item['slot']:.2f}s, x{tempo:.2f}", flush=True)
