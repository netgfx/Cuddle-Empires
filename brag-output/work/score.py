"""Cuddle Empires launch score: one piece in F major, 120 bpm, with SFX tuned to the key
and placed on the picture's cue times (see film.html timeline). Writes score.wav (48 kHz stereo)."""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
import json, re
TL = json.loads(re.sub(r'^\s*//.*$', '', open('timeline.js', encoding='utf-8').read(), flags=re.M).split('=', 1)[1])
DUR = TL['duration']
N = int(SR * DUR)
BEAT = 0.5  # 120 bpm
rng = np.random.default_rng(7)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def put(buf, t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l * 1.414
    buf[i:i + len(sig), 1] += sig * gain * r * 1.414


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, f1, f2, order=2):
    return sosfilt(butter(order, [f1, f2], 'band', fs=SR, output='sos'), x)


# ---------------- instruments ----------------
def marimba(f, dur=0.6):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.32)
         + 0.35 * np.sin(2 * np.pi * f * 3.99 * t) * np.exp(-t / 0.06)
         + 0.12 * np.sin(2 * np.pi * f * 9.8 * t) * np.exp(-t / 0.02))
    return s * np.minimum(1, t / 0.002)


def pluck(f, dur=0.35):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t)
    s = lp(s, min(9000, f * 6))
    return s * env_ad(n, 0.003, 0.11)


def bell(f, dur=2.4):
    n = int(SR * dur)
    t = np.arange(n) / SR
    mod = 2.2 * np.exp(-t / 0.5) * np.sin(2 * np.pi * f * 3.5 * t)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.9)
    return s * np.minimum(1, t / 0.002)


def bass(f, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    e = np.minimum(1, t / 0.006) * np.exp(-t / 0.5) * 0.8 + 0.2
    e *= np.minimum(1, (dur - t) / 0.03).clip(0, 1)
    return s * e


def pad(fs, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in fs:
        for det in (-0.12, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            s += (2 * ((ff * t + rng.random()) % 1) - 1)
    s = lp(s, 1600) / (len(fs) * 3)
    e = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3).clip(0, 1)
    return s * e


def kick(dur=0.35):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.14) * np.minimum(1, t / 0.001)


def clap():
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    e = np.zeros(n)
    for o in (0, 0.011, 0.022):
        e += (t >= o) * np.exp(-(t - o).clip(0) / (0.008 if o < 0.02 else 0.07))
    return bp(noise, 900, 4200) * e * 0.6


def hat(open_=False):
    n = int(SR * (0.12 if open_ else 0.04))
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500) * np.exp(-t / (0.05 if open_ else 0.012))


def pop(f):
    n = int(SR * 0.16)
    t = np.arange(n) / SR
    ff = f * (1 + 0.6 * np.exp(-t / 0.012))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.05) * np.minimum(1, t / 0.0015)


def clack(f=1396.9):
    """wooden die hitting the tray: click + body resonance tuned to F"""
    n = int(SR * 0.09)
    t = np.arange(n) / SR
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.018) + 0.5 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.03)
    return click * 0.5 + body * 0.6


def whoosh(dur=0.6, up=True):
    n = int(SR * dur)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 512
    for i in range(0, n, seg):
        p = i / n
        fc = 300 * (20 ** (p if up else 1 - p))
        out[i:i + seg] = bp(noise[max(0, i - 2048):i + seg], fc, fc * 2.2)[-len(out[i:i + seg]):]
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * e


def tick():
    n = int(SR * 0.03)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 1800, 5000) * np.exp(-t / 0.006)


# ---------------- harmony ----------------
# F major: I (F) – vi (Dm) – IV (Bb) – V (C), one chord per bar (2 s)
CHORDS = [(53, [65, 69, 72]), (50, [62, 65, 69]), (46, [58, 62, 65]), (48, [60, 64, 67])]
SCALE = [65, 67, 69, 72, 74, 77, 79, 81]  # F pentatonic-ish (F G A C D F G A)


def chord_at(t):
    return CHORDS[int(t // 2.0) % 4]


# ---------------- arrangement (all cue times from timeline.js) ----------------
S = TL['scenes']
H0, H1 = S['hook']; R0 = S['reveal'][0]; A0 = S['armies'][0]; B0, B1 = S['battle']; M0, M1 = S['built']; O0 = S['outro'][0]

# hook: soft pad + sparse marimba, builds to the reveal downbeat
put(music, 0.0, pad([65, 69, 72], R0 + 0.1), 0.18)
hook_mel = [(0.0, 77), (0.5, 72), (1.0, 74), (1.25, 72), (1.5, 69), (2.0, 72), (2.5, 74), (2.75, 72), (3.0, 77), (3.25, 79)]
for k, (tt, m) in enumerate(hook_mel):
    if tt < R0:
        put(music, tt, marimba(midi(m)), 0.22, pan=-0.2 + 0.1 * (k % 4))
put(music, R0 - 1.0, whoosh(1.0, up=True), 0.07)

# groove from the reveal downbeat to the final hit
GROOVE_START, GROOVE_END = R0, DUR - 1.0
t = GROOVE_START
while t < GROOVE_END - 1e-6:
    beat_i = round((t - GROOVE_START) / BEAT)
    root, triad = chord_at(t - GROOVE_START)
    in_built = M0 <= t < M1
    if beat_i % 2 == 0:
        put(music, t, kick(), 0.38)
    if beat_i % 2 == 1:
        put(music, t, clap(), 0.22, pan=0.05)
    put(music, t + BEAT / 2, hat(), 0.16, pan=0.3)
    for q in (0.25, 0.75):
        put(music, t + q * BEAT, hat(), 0.05 if not in_built else 0.07, pan=-0.25)
    put(music, t, bass(midi(root - 12 if beat_i % 4 == 0 else root), BEAT * 0.9), 0.19)
    if beat_i % 4 == 0:
        put(music, t, pad(triad, 2.0), 0.13)
    t += BEAT

phrase_a = [(0, 72), (0.5, 74), (0.75, 72), (1.0, 69), (1.5, 72), (2.0, 77), (2.5, 76), (3.0, 74), (3.5, 72)]
phrase_b = [(0, 69), (0.5, 72), (0.75, 74), (1.0, 77), (1.5, 74), (2.0, 72), (2.5, 69), (3.0, 67), (3.5, 65)]
phrase_c = [(0, 77), (0.25, 79), (0.5, 81), (1.0, 79), (1.5, 77), (2.0, 74), (2.5, 77), (3.0, 72), (3.5, 74)]
for k, start in enumerate(np.arange(GROOVE_START, GROOVE_END, 4.0)):
    ph = [phrase_a, phrase_b, phrase_a, phrase_c][k % 4]
    for dt, m in ph:
        if start + dt < GROOVE_END:
            put(music, start + dt, marimba(midi(m)), 0.3, pan=-0.15)
            put(music, start + dt, bell(midi(m + 24), 0.6), 0.035, pan=0.2)
for t in np.arange(M0, M1, 0.25):
    root, triad = chord_at(t - GROOVE_START)
    m = triad[int((t - M0) / 0.25) % 3] + 12
    put(music, t, pluck(midi(m)), 0.1, pan=0.35)

# outro bell arpeggio + final hit
for k, m in enumerate([65, 69, 72, 77]):
    put(music, O0 + k * 0.09, bell(midi(m + 12)), 0.12, pan=-0.3 + k * 0.2)
FINAL = GROOVE_END
put(music, FINAL, kick(), 0.5)
put(music, FINAL, pad([65, 69, 72, 77], 1.0), 0.16)
put(music, FINAL, bell(midi(77)), 0.12)
put(music, FINAL, bass(midi(41), 1.0), 0.35)

# ---------------- SFX on picture cues ----------------
def dice_roll(t0, hits, gain):
    for tt in hits:
        put(sfx, t0 + tt + rng.uniform(-0.01, 0.01), clack(1396.9 * rng.choice([1, 0.75, 1.5])), gain * rng.uniform(0.6, 1), pan=rng.uniform(-0.4, 0.4))

# hook footage: dice tumbling (frames 28–103), casualty pop
dice_roll(0.0, [0.05, 0.13, 0.24, 0.31, 0.45, 0.58, 0.7, 0.86, 1.02], 0.22)
put(sfx, 1.5, pop(midi(77)), 0.18)
for tt, m in zip(TL['hookWords'], [72, 77, 69, 72, 74, 77]):
    put(sfx, tt, pop(midi(m + 12)), 0.06)
# reveal swell + title letters
put(sfx, R0, bell(midi(77)), 0.1)
for k in range(13):
    put(sfx, R0 + 0.3 + k * 0.035, tick(), 0.05, pan=-0.5 + k / 13)
# armies: card pops (F A C) + badge pings
put(sfx, A0 - 0.25, whoosh(0.35), 0.08)
for k, m in enumerate([65, 69, 72]):
    put(sfx, A0 + 0.25 + k * 0.14, pop(midi(m + 12)), 0.16, pan=-0.4 + 0.4 * k)
    put(sfx, A0 + 0.62 + k * 0.14, marimba(midi(m + 24), 0.3), 0.08, pan=-0.4 + 0.4 * k)
# battle footage (frames 1165+): tray + dice, result, casualty; chips
put(sfx, B0 - 0.2, whoosh(0.35), 0.08)
dice_roll(B0, [0.25, 0.33, 0.44, 0.55, 0.66, 0.8, 0.95, 1.1, 1.3, 1.5], 0.2)
put(sfx, B0 + 1.85, pop(midi(77)), 0.16)
for k in range(4):
    put(sfx, B0 + 0.35 + k * TL['chipStagger'], pop(midi([72, 74, 77, 81][k])), 0.07, pan=-0.5 + k * 0.3)
# into the montage
put(sfx, M0 - 0.4, whoosh(0.5), 0.12)
for s, e in TL['beats']:
    put(sfx, s, whoosh(0.28, up=False), 0.05)
    put(sfx, s + 0.18, pop(midi(84)), 0.05)
b1, b2, b3, b4, b5 = TL['beats']
put(sfx, b2[0] + 0.55, whoosh(0.5), 0.06)  # Blender wipe
for k in range(6):
    put(sfx, b3[0] + 0.07 + k * 0.08, pop(midi([72, 74, 77, 79, 81, 84][k])), 0.05)
for k in range(12):
    put(sfx, b4[0] + 0.03 + k * 0.05, tick(), 0.05, pan=-0.6 + k * 0.1)
tt = b5[0] + 0.12
for line in range(7):
    if line in (0, 3, 5):
        for c in range(9):
            put(sfx, tt + c * 0.024, tick(), 0.03, pan=0.2)
        tt += 0.27
    else:
        put(sfx, tt, pop(midi(84)), 0.03)
        tt += 0.1
put(sfx, M1 - 0.2, whoosh(0.4, up=False), 0.08)

# ---------------- mix ----------------
def norm_peak(x, db):
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (db / 20)

music = hp(music.T, 35).T
music = music + 0.9 * hp(music.T, 2500).T - 0.25 * bp(music.T, 180, 400).T
sfx = hp(sfx.T, 60).T
mix = norm_peak(music, -3.0) + norm_peak(sfx, -11.0)
# gentle master: soft-clip + fades
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
fade_in = np.minimum(1, np.arange(N) / (SR * 0.01))
fade_out = np.clip((DUR - np.arange(N) / SR) / 0.6, 0, 1) ** 1.5
mix *= (fade_in * fade_out)[:, None]
mix = norm_peak(mix, -1.8)
wavfile.write('score.wav', SR, (mix * 32767).astype(np.int16))
print('wrote score.wav', mix.shape, 'peak', np.max(np.abs(mix)))
