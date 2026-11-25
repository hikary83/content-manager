# Long-form narration in a cloned voice (<body data-voice="clone 혜경">, 2026-11-24 — 사람: 「h2가 메인 h3과 h4을 상황에 맞게」).
# Qwen3-TTS 1.7B Base (Apache-2.0, CPU) copies the voice in ~/.hikary-voice/voices/<name>/ (ref.wav + ref.txt, a voice designed
# with Qwen VoiceDesign — not a real person). voice.mjs groups lines that follow each other closely (≤ 0.5 s apart, up to 3);
# each group is read in one go so the sentences carry on from each other, then cut at the pauses between them (the cut whose
# pieces best match each sentence's share of syllables). A group is read again with the next seed (up to 4 reads) only when a
# line's intonation is off: a question (?) must rise ≥ 2 semitones over its last 0.5 s, a statement (.) fall ≥ 2, an
# exclamation (!) sit at least at the reference voice's median pitch; a line ending in a comma is not checked. Of the reads,
# the one with the most lines right wins (the first on a tie). If no read cuts cleanly (a piece under 0.5× or over 1.6× its
# share), each line is read on its own with its own seed. A line longer than its slot is sped up like voice.py (max 1.5×).
# voice.mjs calls it with the voice venv:  <venv python> -I tools/motion/voice_clone.py <job.json>
# job: {"model", "ref", "refText", "groups": [{"seed", "lines": [{"text", "slot", "out"}]}]}
# Self-check of the cutting (no model):  <venv python> -I tools/motion/voice_clone.py --check
import contextlib, io, itertools, json, os, re, subprocess, sys, time
import numpy as np, soundfile
sys.stdout.reconfigure(encoding='utf-8')  # -I ignores PYTHONIOENCODING, and the log lines are Korean

SR = 24000

def split(a, texts):
    # → (pieces, ok): cut at the pauses (≥ 0.08 s) so the pieces best match the sentences' share of syllables
    hop = int(SR * 0.01); rms = np.sqrt((a[:len(a) // hop * hop].reshape(-1, hop) ** 2).mean(1))
    runs, s = [], None
    for i, q in enumerate(np.append(rms < rms.max() * 0.03, False)):
        if q and s is None: s = i
        if not q and s is not None:
            if i - s >= 8: runs.append((s, i - s))
            s = None
    syl = np.array([max(1, len(re.findall(r'[가-힣]', t))) for t in texts], float); share = syl / syl.sum()
    if len(runs) < len(texts) - 1: return [], False
    def pieces_of(cuts): return np.diff([0] + [s + n // 2 for s, n in cuts] + [len(rms)]) / len(rms)
    cuts = min(itertools.combinations(runs, len(texts) - 1), key=lambda c: ((pieces_of(c) - share) ** 2).sum())
    ok = bool(np.all((pieces_of(cuts) / share >= 0.5) & (pieces_of(cuts) / share <= 1.6)))
    edges = [0] + [(s + n // 2) * hop for s, n in cuts] + [len(a)]
    return [a[x:y] for x, y in zip(edges, edges[1:])], ok

if sys.argv[1] == '--check':
    # three "sentences" of 12 · 9 · 11 syllables at 5 syllables/s, a 0.2 s comma pause inside the third, 0.5 s pauses between
    tone = lambda sec: 0.3 * np.sin(2 * np.pi * 220 * np.arange(int(SR * sec)) / SR)
    gap = lambda sec: np.zeros(int(SR * sec))
    a = np.concatenate([tone(2.4), gap(0.5), tone(1.8), gap(0.5), tone(1.0), gap(0.2), tone(1.2)])
    pieces, ok = split(a, ['하루 동안 소리가 사라진다면?', '박수를 쳐도 조용하고,', '초인종도, 음악도 안 들려요.'])
    cuts = np.cumsum([len(p) / SR for p in pieces])[:2]  # the middle of each 0.5 s pause, not the comma pause
    assert ok and np.allclose(cuts, [2.65, 4.95], atol=0.02), cuts
    _, ok = split(np.concatenate([tone(0.4), gap(0.5), tone(4.0)]), ['하루 동안 소리가 사라진다면?', '글씨로는 통하네요!'])
    assert not ok, 'a piece far from its share must fall back to reading lines one by one'
    print('voice_clone check ok'); sys.exit()

import librosa, torch
with contextlib.redirect_stdout(io.StringIO()):  # qwen_tts prints SoX / flash-attn notices we don't need
    from qwen_tts import Qwen3TTSModel

def pitch(a):
    # → (median Hz, semitones the pitch moves over the last 0.5 s of voiced speech — straight-line fit, + rising)
    f0, voiced, _ = librosa.pyin(a, fmin=120, fmax=700, sr=SR)
    times, keep = librosa.times_like(f0, sr=SR), voiced & ~np.isnan(f0)
    if not keep.any(): return float('nan'), float('nan')
    tail = keep & (times >= times[keep][-1] - 0.5)
    end = np.polyfit(times[tail], 12 * np.log2(f0[tail]), 1)[0] * 0.5 if tail.sum() >= 5 else float('nan')
    return float(np.median(f0[keep])), float(end)

def right(text, a, ref_hz):
    # → (end semitones, intonation fits the sentence's last mark); too little voice to measure (nan) counts as fine
    hz, end = pitch(a)
    mark = text.strip()[-1:]
    value, need = {'?': (end, 2), '.': (-end, 2), '!': (hz - ref_hz, 0)}.get(mark, (None, 0))
    return end, value is None or value != value or bool(value >= need)

def trim(a): return librosa.effects.trim(a, top_db=40)[0]

job = json.load(open(sys.argv[1], encoding='utf8'))
torch.set_num_threads(os.cpu_count())
with contextlib.redirect_stdout(io.StringIO()):
    tts = Qwen3TTSModel.from_pretrained(job['model'], device_map='cpu', dtype=torch.float32)
    prompt = tts.create_voice_clone_prompt(ref_audio=job['ref'], ref_text=job['refText'])
ref_hz = pitch(trim(librosa.load(job['ref'], sr=SR)[0]))[0]

def read(text, seed):
    torch.manual_seed(seed)
    wavs, sr = tts.generate_voice_clone(text=text, language='Korean', voice_clone_prompt=prompt, max_new_tokens=900)
    a = np.asarray(wavs[0], dtype=np.float32)
    return trim(librosa.resample(a, orig_sr=sr, target_sr=SR) if sr != SR else a)

def save(line, a):
    dur = len(a) / SR
    tempo = min(1.5, dur / line['slot'] * 1.02) if dur > line['slot'] else 1.0
    if tempo > 1:
        raw = line['out'] + '.raw.wav'
        soundfile.write(raw, a, SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', f'atempo={tempo:.3f}', line['out']], check=True)
        os.remove(raw)
    else:
        soundfile.write(line['out'], a, SR)
    return tempo

for n, group in enumerate(job['groups'], 1):
    started, lines = time.time(), group['lines']
    texts = [line['text'] for line in lines]
    best, alone = None, False
    for k in range(4):
        a = read(' '.join(texts), group['seed'] + k)
        pieces, ok = split(a, texts) if len(texts) > 1 else ([a], True)
        if not ok: continue
        pieces = [trim(p) for p in pieces]
        checks = [right(t, p, ref_hz) for t, p in zip(texts, pieces)]
        if best is None or sum(c[1] for c in checks) > sum(c[1] for c in best[1]): best = (pieces, checks)
        if all(c[1] for c in checks): break
    if best is None:  # never cut cleanly: one line at a time, each with its own seed
        alone, pieces = True, [read(t, group['seed'] + 100 * i) for i, t in enumerate(texts)]
        best = (pieces, [right(t, p, ref_hz) for t, p in zip(texts, pieces)])
    tempos = [save(line, p) for line, p in zip(lines, best[0])]
    ends = ' '.join(f'{e:+.1f}' if e == e else '?' for e, _ in best[1])
    print(f"voice 묶음 {n}/{len(job['groups'])} ({len(lines)}줄): 읽기 {k + 1}번{' · 한 줄씩' if alone else ''}, "
          f"끝 높낮이 {ends}{'' if all(c[1] for c in best[1]) else ' (못 맞춤)'}, x{max(tempos):.2f} ({time.time() - started:.0f}s)", flush=True)
