#!/usr/bin/env python3
"""
Procedural audio for Ivyward (#371, epic #358).

Everything under the "generated" list in docs/audio-licensing.md is synthesized
here from scratch: no samples, no third-party recordings. Re-running the script
reproduces the files byte-for-byte (fixed RNG seeds).

Requirements:  pip install numpy soundfile
Optional:      macOS `afconvert` (writes the AAC .m4a fallback used by Safari)

Usage:
  python3 scripts/generate-audio.py            # everything
  python3 scripts/generate-audio.py music      # music only
  python3 scripts/generate-audio.py sfx        # sfx only
  python3 scripts/generate-audio.py music boss rival   # just these (keeps other files untouched)

Outputs (public/assets/audio/):
  music-<id>.ogg / .m4a   mono 22050 Hz, seamless loops (victory is a one-shot)
  sfx-<id>.wav            16-bit PCM mono 22050 Hz, same format as the older SFX
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 22050
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio"
TAU = 2 * np.pi

# --------------------------------------------------------------------------
# Notes
# --------------------------------------------------------------------------
_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name: str) -> int:
    """'F#4' -> midi 66, 'Bb3' -> 58."""
    pitch = _NAMES[name[0]]
    i = 1
    while name[i] in "#b":
        pitch += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + pitch


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def tvec(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


# --------------------------------------------------------------------------
# DSP helpers
# --------------------------------------------------------------------------
def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def fft_filter(x, lo=None, hi=None, order=2):
    """Smooth band filter in the frequency domain (lo = highpass, hi = lowpass)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / (1 + (f / hi) ** (2 * order))
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(spec * g, len(x))


def noise(dur, seed, lo=None, hi=None):
    x = rng(seed).standard_normal(int(dur * SR))
    return fft_filter(x, lo, hi) if (lo or hi) else x


def env(length, a=0.005, d=0.0, r=0.01, sustain=1.0):
    """Attack / exponential decay (rate d per s) / release envelope."""
    t = np.arange(length) / SR
    e = np.minimum(1.0, t / max(a, 1e-4))
    if d:
        e = e * (sustain + (1 - sustain) * np.exp(-t * d))
    rel = int(r * SR)
    if rel > 0 and length > rel:
        e[-rel:] *= np.linspace(1, 0, rel)
    return e


def additive(f, t, harmonics, phase=0.0, maxhz=9000):
    out = np.zeros_like(t)
    for k, amp in harmonics:
        if k * f < maxhz:
            out += amp * np.sin(TAU * k * f * t + phase * k)
    return out


def saw_h(nh):
    return [(k, 1 / k) for k in range(1, nh + 1)]


def square_h(nh):
    return [(k, 1 / k) for k in range(1, nh + 1, 2)]


# --------------------------------------------------------------------------
# Instruments (return float arrays, release tail included in the length)
# --------------------------------------------------------------------------
def pluck(midi, dur=1.2, bright=1.0):
    f = hz(midi)
    t = tvec(dur)
    out = np.zeros_like(t)
    for k in range(1, 9):
        if k * f > 9000:
            break
        out += (1 / k**1.15) * np.sin(TAU * k * f * t) * np.exp(-t * (2.2 + k * 2.6 / bright))
    return out * env(len(t), 0.003, 0, 0.02) * 0.9


def harp(midi, dur=2.0):
    f = hz(midi)
    t = tvec(dur)
    out = np.zeros_like(t)
    for k, a in ((1, 1.0), (2, 0.35), (3, 0.18), (4, 0.08), (5, 0.04)):
        out += a * np.sin(TAU * k * f * t) * np.exp(-t * (1.6 + k * 1.4))
    return out * env(len(t), 0.002, 0, 0.05)


def bell(midi, dur=2.5, decay=1.6):
    f = hz(midi)
    t = tvec(dur)
    out = np.zeros_like(t)
    for ratio, a, d in ((1, 1.0, 1.0), (2.76, 0.45, 1.5), (5.4, 0.22, 2.2), (8.93, 0.1, 3.0)):
        out += a * np.sin(TAU * f * ratio * t) * np.exp(-t * decay * d)
    return out * env(len(t), 0.001, 0, 0.05) * 0.8


def musicbox(midi, dur=1.6):
    f = hz(midi)
    t = tvec(dur)
    out = np.zeros_like(t)
    for ratio, a, d in ((1, 1.0, 2.2), (2, 0.35, 3.0), (3, 0.18, 4.0), (4.2, 0.1, 5.5), (5.4, 0.05, 7.0)):
        out += a * np.sin(TAU * f * ratio * t) * np.exp(-t * d)
    return out * env(len(t), 0.001, 0, 0.03) * 0.8


def flute(midi, dur=1.0, vib=5.0, vib_depth=0.006, breath=0.05, seed=1):
    f = hz(midi)
    t = tvec(dur)
    vdepth = vib_depth * np.clip((t - 0.15) / 0.3, 0, 1)
    phase = TAU * np.cumsum(f * (1 + vdepth * np.sin(TAU * vib * t))) / SR
    out = np.sin(phase) + 0.30 * np.sin(2 * phase) + 0.10 * np.sin(3 * phase)
    out += breath * fft_filter(rng(seed).standard_normal(len(t)), lo=2500, hi=6000)
    return out * env(len(t), 0.05, 0, min(0.12, dur * 0.4)) * 0.6


def whistle(midi, dur=0.5, seed=2):
    f = hz(midi)
    t = tvec(dur)
    vdepth = 0.01 * np.clip((t - 0.1) / 0.2, 0, 1)
    phase = TAU * np.cumsum(f * (1 + vdepth * np.sin(TAU * 5.5 * t))) / SR
    out = np.sin(phase) + 0.12 * np.sin(2 * phase)
    out += 0.03 * fft_filter(rng(seed).standard_normal(len(t)), lo=3000, hi=7000)
    return out * env(len(t), 0.03, 0, min(0.08, dur * 0.4)) * 0.6


def pad(midi, dur, detune=0.07, nh=6, attack=0.5, release=0.8):
    t = tvec(dur + release)
    out = np.zeros_like(t)
    for i, c in enumerate((-detune, 0.0, detune)):
        out += additive(hz(midi + c), t, [(k, a / k**0.4) for k, a in saw_h(nh)], phase=i * 1.7, maxhz=4500)
    e = np.minimum(1, t / attack)
    cut = int(dur * SR)
    e[cut:] = np.linspace(1, 0, len(t) - cut)
    return out * e * 0.18


def strings(midi, dur, attack=0.7, release=1.0):
    t = tvec(dur + release)
    out = np.zeros_like(t)
    for i, c in enumerate((-0.12, -0.04, 0.05, 0.13)):
        vib = 1 + 0.002 * np.sin(TAU * (4.8 + i * 0.3) * t + i)
        ph = TAU * np.cumsum(hz(midi + c) * vib) / SR
        for k in range(1, 8):
            out += np.sin(k * ph + i) / k**0.9
    e = np.minimum(1, t / attack)
    cut = int(dur * SR)
    e[cut:] = np.linspace(1, 0, len(t) - cut)
    return fft_filter(out, hi=3200) * e * 0.12


def bass(midi, dur=0.5):
    f = hz(midi)
    t = tvec(dur)
    out = np.sin(TAU * f * t) + 0.35 * np.sin(TAU * 2 * f * t) + 0.12 * np.sin(TAU * 3 * f * t)
    return out * env(len(t), 0.006, 3.0, 0.05, 0.35) * 0.9


def pulse_bass(midi, dur=0.25):
    f = hz(midi)
    t = tvec(dur)
    out = additive(f, t, square_h(9), maxhz=4000)
    return fft_filter(out, hi=1400) * env(len(t), 0.004, 5, 0.03, 0.4) * 0.7


def pulse_lead(midi, dur=0.3, vib=0.0):
    f = hz(midi)
    t = tvec(dur)
    ph = TAU * np.cumsum(f * (1 + vib * np.sin(TAU * 5.5 * t))) / SR
    out = sum(np.sin(k * ph) / k for k in range(1, 12, 2) if k * f < 6000)
    return out * env(len(t), 0.006, 2.0, 0.05, 0.6) * 0.5


def stab(midi, dur=0.18):
    f = hz(midi)
    t = tvec(dur)
    out = additive(f, t, saw_h(10), maxhz=5000)
    return fft_filter(out, hi=3000) * env(len(t), 0.004, 14, 0.04, 0.2) * 0.5


def kick(dur=0.3, punch=1.0):
    t = tvec(dur)
    f = 45 + 95 * np.exp(-t * 30)
    ph = TAU * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11) * punch


def tom(f0=190, f1=95, dur=0.3):
    t = tvec(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 22)
    ph = TAU * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11) * 0.9


def snare(seed=3, dur=0.2):
    t = tvec(dur)
    nz = fft_filter(rng(seed).standard_normal(len(t)), lo=1200, hi=7500)
    body = np.sin(TAU * 185 * t) * np.exp(-t * 30)
    return (nz * np.exp(-t * 20) * 0.8 + body * 0.5)


def hat(seed=4, dur=0.06, open_=False):
    d = 0.22 if open_ else dur
    t = tvec(d)
    nz = fft_filter(rng(seed).standard_normal(len(t)), lo=6000)
    return nz * np.exp(-t * (14 if open_ else 70)) * 0.5


def shaker(seed=5, dur=0.09):
    t = tvec(dur)
    nz = fft_filter(rng(seed).standard_normal(len(t)), lo=4500, hi=9500)
    return nz * np.minimum(1, t / 0.02) * np.exp(-t * 32) * 0.5


def tambourine(seed=6, dur=0.22):
    t = tvec(dur)
    nz = fft_filter(rng(seed).standard_normal(len(t)), lo=5000)
    jingle = sum(np.sin(TAU * f * t) for f in (5200, 6100, 7300, 8100)) * 0.12
    return (nz * 0.45 + jingle * (1 + np.sin(TAU * 38 * t))) * np.exp(-t * 16)


def cricket(seed=7):
    out = np.zeros(int(0.5 * SR))
    for i in range(3):
        start = int(i * 0.115 * SR)
        d = tvec(0.075)
        chirp = np.sin(TAU * 4300 * d + 6 * np.sin(TAU * 60 * d)) * (0.5 + 0.5 * np.sin(TAU * 70 * d)) ** 2
        out[start:start + len(d)] += chirp * np.hanning(len(d))
    return out * 0.5


# --------------------------------------------------------------------------
# Mixer
# --------------------------------------------------------------------------
def make_ir(seconds=1.7, decay=3.2, seed=99, brightness=3800):
    t = tvec(seconds)
    ir = rng(seed).standard_normal(len(t)) * np.exp(-t * decay)
    ir = fft_filter(ir, hi=brightness)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir**2))


class Mix:
    """Sum of events on a timeline. loop=True wraps events (and the reverb tail)."""

    def __init__(self, seconds: float, loop: bool, tail: float = 0.0):
        self.loop = loop
        self.n = int(round(seconds * SR))
        self.size = self.n if loop else self.n + int(tail * SR)
        self.dry = np.zeros(self.size)
        self.wet = np.zeros(self.size)

    def _put(self, buf, at, sig):
        i = int(round(at * SR))
        if self.loop:
            i %= self.n
            sig = sig[: self.n]
            end = i + len(sig)
            if end <= self.n:
                buf[i:end] += sig
            else:
                buf[i:] += sig[: self.n - i]
                buf[: end - self.n] += sig[self.n - i:]
        else:
            if i >= self.size:
                return
            end = min(self.size, i + len(sig))
            buf[i:end] += sig[: end - i]

    def add(self, at, sig, gain=1.0, send=0.0):
        self._put(self.dry, at, sig * gain)
        if send:
            self._put(self.wet, at, sig * gain * send)

    def render(self, ir, wet=1.0, peak=0.88):
        if self.loop:
            reverb = np.fft.irfft(np.fft.rfft(self.wet) * np.fft.rfft(ir, self.n), self.n)
        else:
            m = self.size + len(ir)
            reverb = np.fft.irfft(np.fft.rfft(self.wet, m) * np.fft.rfft(ir, m), m)[: self.size]
        out = self.dry + wet * reverb
        # Level to a musical loudness (99.5th percentile), then soft-limit the peaks.
        out *= 0.5 / max(1e-6, np.percentile(np.abs(out), 99.5))
        out = np.tanh(out * 1.2) / np.tanh(1.2)
        out *= peak / max(1e-6, np.max(np.abs(out)))
        return out


# --------------------------------------------------------------------------
# Music
# --------------------------------------------------------------------------
def triad(root, minor=False, seventh=None):
    tones = [root, root + (3 if minor else 4), root + 7]
    if seventh is not None:
        tones.append(root + seventh)
    return tones


def put_melody(mix, mel, start_beat, spb, inst, gain=1.0, send=0.3, **kw):
    """mel: list of (midi|None, beats). Returns beats consumed."""
    b = start_beat
    for note, beats in mel:
        if note is not None:
            mix.add(b * spb, inst(note, beats * spb * 1.05 + 0.1, **kw), gain, send)
        b += beats
    return b - start_beat


def music_grove():
    """D major / pentatonic, 96 bpm, 16 bars (40 s). Fingerpicked meadow."""
    bpm, bars, bpb = 96, 16, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    # (root midi, minor?) one chord per bar
    D, A, Bm, G, Em = n("D3"), n("A2"), n("B2"), n("G2"), n("E3")
    prog = [(D, 0), (A, 0), (Bm, 1), (G, 0)] * 2 + [(G, 0), (D, 0), (Em, 1), (A, 0), (G, 0), (D, 0), (A, 0), (A, 0)]
    pattern = [0, 2, 1, 2, 3, 2, 1, 2]
    for bar, (root, minor) in enumerate(prog):
        tones = triad(root + 12, bool(minor))
        tones = [tones[0], tones[1], tones[2], tones[0] + 12]
        b0 = bar * bpb
        for i, idx in enumerate(pattern):
            accent = 1.0 if i % 4 == 0 else 0.7
            m.add((b0 + i * 0.5) * spb, pluck(tones[idx] + 12, 1.1), 0.30 * accent, 0.22)
        for tone in triad(root + 12, bool(minor)):
            m.add(b0 * spb, pad(tone, bpb * spb, attack=0.6), 0.55, 0.35)
        m.add(b0 * spb, bass(root - 12, 1.1), 0.7)
        m.add((b0 + 2) * spb, bass(root - 12 + 7, 0.8), 0.5)
        for i in range(8):
            m.add((b0 + i * 0.5 + 0.25) * spb, shaker(seed=10 + (i % 3)), 0.30 if i % 2 else 0.2)
        if bar >= 8:
            m.add((b0 + 2) * spb, tom(150, 80), 0.35)
            m.add((b0 + 3.5) * spb, tom(130, 70), 0.2)
    # Flute melody in D pentatonic (D E F# A B).
    A5, B5, D6, E5, Fs5, D5 = n("A5"), n("B5"), n("D6"), n("E5"), n("F#5"), n("D5")
    ph_a = [(Fs5, 1.5), (A5, 0.5), (B5, 1), (A5, 1), (Fs5, 1.5), (E5, 0.5), (Fs5, 2), (None, 0)]
    ph_b = [(A5, 1), (B5, 1), (D6, 2), (B5, 1.5), (A5, 0.5), (Fs5, 2), (None, 0)]
    ph_c = [(E5, 1.5), (Fs5, 0.5), (A5, 2), (Fs5, 1), (E5, 1), (D5, 2), (None, 0)]
    ph_d = [(D6, 1.5), (B5, 0.5), (A5, 1), (Fs5, 1), (B5, 1.5), (A5, 0.5), (A5, 2), (None, 0)]
    order = [(0, ph_a), (2, ph_b), (4, ph_a), (6, ph_c), (8, ph_c), (10, ph_d), (12, ph_b), (14, ph_a)]
    for bar, mel in order:
        put_melody(m, mel, bar * bpb, spb, flute, 0.55, 0.45, seed=bar)
    return m.render(make_ir(1.8, 3.0), wet=0.55)


def music_title():
    """G major, 72 bpm, 12 bars (40 s). Harp arpeggios, strings, bell theme."""
    bpm, bars, bpb = 72, 12, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    G, D, Em, C = n("G2"), n("D3"), n("E3"), n("C3")
    prog = [(G, 0), (D, 0), (Em, 1), (C, 0), (G, 0), (D, 0), (Em, 1), (C, 0), (C, 0), (G, 0), (D, 0), (D, 0)]
    for bar, (root, minor) in enumerate(prog):
        b0 = bar * bpb
        t3 = triad(root, bool(minor))
        notes = [t3[0] + 12, t3[2] + 12, t3[0] + 24, t3[1] + 24, t3[2] + 24, t3[1] + 24, t3[0] + 24, t3[2] + 12]
        for i, nt in enumerate(notes):
            m.add((b0 + i * 0.5) * spb, harp(nt, 2.2), 0.34 * (1.0 if i % 4 == 0 else 0.72), 0.4)
        for tone in triad(root + 12, bool(minor)) + [root]:
            m.add(b0 * spb, strings(tone, bpb * spb), 0.8, 0.3)
        m.add(b0 * spb, bass(root - 12, 2.0), 0.75)
        if bar % 4 == 0:
            m.add(b0 * spb, tom(110, 55, 0.6), 0.6, 0.2)
        if bar % 4 == 3:
            m.add((b0 + 3) * spb, tom(150, 80), 0.3, 0.2)
            m.add((b0 + 3.5) * spb, tom(150, 80), 0.35, 0.2)
    B4, D5, G5, A5, E5, C5, B5 = n("B4"), n("D5"), n("G5"), n("A5"), n("E5"), n("C5"), n("B5")
    th1 = [(B4, 2), (D5, 1), (G5, 1), (A5, 3), (G5, 1)]
    th2 = [(E5, 2), (G5, 1), (B5, 1), (A5, 2), (G5, 2)]
    th3 = [(C5, 2), (E5, 1), (G5, 1), (A5, 2), (B5, 2)]
    th4 = [(D5, 2), (A5, 2), (G5, 4)]
    for bar, mel in [(0, th1), (2, th2), (4, th1), (6, th3), (8, th3), (10, th4)]:
        # th* lengths are 8 beats = 2 bars
        put_melody(m, mel, bar * bpb, spb, flute if bar in (2, 6) else bell, 0.7, 0.5)
    return m.render(make_ir(2.2, 2.4), wet=0.6)


def music_shrine():
    """E Dorian / minor pentatonic, 54 bpm, 8 bars (35 s). Drone, bells, breath."""
    bpm, bars, bpb = 54, 8, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    E, D, C, B = n("E2"), n("D2"), n("C2"), n("B1")
    chords = [(E, [0, 7, 14, 19]), (D, [0, 7, 14, 16]), (C, [0, 7, 11, 14]), (B, [0, 7, 12, 17])]
    prog = chords * 2
    for bar, (root, shape) in enumerate(prog):
        b0 = bar * bpb
        for off in shape:
            m.add(b0 * spb, pad(root + 12 + off, bpb * spb, attack=1.4, release=1.4), 0.9, 0.5)
        m.add(b0 * spb, bass(root, 3.5), 0.55)
        m.add(b0 * spb, kick(0.35, 0.5), 0.4)  # heartbeat
        m.add((b0 + 0.45) * spb, kick(0.3, 0.35), 0.28)
        m.add((b0 + 2) * spb, kick(0.35, 0.5), 0.3)
    pent = [n(x) for x in ("E5", "G5", "A5", "B5", "D6", "E6", "B4", "D5")]
    r = rng(2024)
    motif = [0, 2, 3, 2, 1, 0, 3, 4]
    beat = 0.0
    for i in range(14):
        idx = motif[i % len(motif)] if i % 5 else int(r.integers(0, len(pent)))
        m.add(beat * spb, bell(pent[idx], 4.0, 1.1), 0.5, 0.8)
        beat += [2, 1.5, 2.5, 2][i % 4] if beat < bars * bpb - 3 else 0
        if beat >= bars * bpb - 1:
            break
    for bar in (1, 5):
        m.add((bar * bpb + 1) * spb, flute(n("B5"), 3.5, breath=0.12, seed=bar), 0.38, 0.8)
    return m.render(make_ir(3.0, 1.7, brightness=3000), wet=0.7)


def music_village():
    """C major folk, 112 bpm, 16 bars (34 s). Lute strums, whistle, hand percussion."""
    bpm, bars, bpb = 112, 16, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    C, F, G, Am = n("C3"), n("F3"), n("G2"), n("A2")
    prog = [(C, 0), (F, 0), (G, 0), (C, 0), (C, 0), (Am, 1), (F, 0), (G, 0),
            (F, 0), (C, 0), (G, 0), (Am, 1), (F, 0), (G, 0), (C, 0), (G, 0)]
    strum_beats = [0, 1.5, 2, 3.5]
    for bar, (root, minor) in enumerate(prog):
        b0 = bar * bpb
        tones = triad(root + 12, bool(minor))
        tones = [tones[0], tones[2], tones[1] + 12, tones[0] + 12]
        for sb in strum_beats:
            for j, tn in enumerate(tones):
                m.add((b0 + sb) * spb + j * 0.012, pluck(tn + (12 if j == 3 else 0), 0.9), 0.24 if sb in (0, 2) else 0.18, 0.18)
        m.add(b0 * spb, bass(root - 12, 0.6), 0.75)
        m.add((b0 + 1.5) * spb, bass(root - 12 + 7, 0.4), 0.45)
        m.add((b0 + 2) * spb, bass(root - 12, 0.6), 0.6)
        m.add((b0 + 3.5) * spb, bass(root - 12 + 7, 0.4), 0.45)
        m.add(b0 * spb, tom(170, 85), 0.45)
        m.add((b0 + 2) * spb, tom(170, 85), 0.35)
        for bt in (1, 3):
            m.add((b0 + bt) * spb, tambourine(seed=20 + bar % 3), 0.38)
        for i in range(8):
            m.add((b0 + i * 0.5 + 0.25) * spb, shaker(seed=30 + i % 3), 0.18)
    C5, D5, E5, G5, A5, C6, F5, B4 = (n(x) for x in ("C5", "D5", "E5", "G5", "A5", "C6", "F5", "B4"))
    ph1 = [(E5, 1), (G5, 0.5), (A5, 0.5), (G5, 1), (E5, 1), (D5, 0.5), (E5, 0.5), (G5, 1), (E5, 1), (C5, 1), (None, 0)]
    ph2 = [(A5, 1), (G5, 0.5), (E5, 0.5), (G5, 1.5), (A5, 0.5), (C6, 1), (A5, 1), (G5, 1), (E5, 1), (D5, 0.5), (E5, 0.5)]
    ph3 = [(C6, 1), (A5, 0.5), (G5, 0.5), (A5, 1), (G5, 1), (E5, 1), (G5, 0.5), (A5, 0.5), (G5, 2), (E5, 1), (None, 0)]
    ph4 = [(G5, 1), (E5, 0.5), (D5, 0.5), (E5, 1), (G5, 1), (A5, 2), (G5, 1), (E5, 1), (D5, 1), (C5, 1)]
    for bar, mel in [(0, ph1), (2, ph2), (4, ph1), (6, ph3), (8, ph3), (10, ph2), (12, ph4), (14, ph4)]:
        # each phrase should fill 8 beats (2 bars)
        put_melody(m, mel, bar * bpb, spb, whistle, 0.7, 0.3)
    return m.render(make_ir(1.2, 4.0), wet=0.4)


def music_battle():
    """A minor, 144 bpm, 20 bars (33 s). Driving pulse bass, kit, stabs, lead."""
    bpm, bars, bpb = 144, 20, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    A, F, G, E, C = n("A2"), n("F2"), n("G2"), n("E2"), n("C3")
    prog = [A, A, F, G, A, A, F, E, F, G, A, A, F, G, E, E, A, F, G, E]
    minor = {A: True, F: False, G: False, E: False, C: False}
    for bar, root in enumerate(prog):
        b0 = bar * bpb
        for i in range(8):
            nt = root if i % 4 != 3 else root + 12
            m.add((b0 + i * 0.5) * spb, pulse_bass(nt, 0.2), 0.8 if i % 2 == 0 else 0.55)
        m.add(b0 * spb, kick(), 0.95)
        m.add((b0 + 1.5) * spb, kick(), 0.5)
        m.add((b0 + 2) * spb, kick(), 0.9)
        m.add((b0 + 3.5 if bar % 2 else b0 + 2.75) * spb, kick(), 0.45)
        m.add((b0 + 1) * spb, snare(seed=40 + bar % 4), 0.7)
        m.add((b0 + 3) * spb, snare(seed=44 + bar % 4), 0.75)
        for i in range(8):
            m.add((b0 + i * 0.5) * spb, hat(seed=50 + i % 4, open_=(i == 7)), 0.38 if i % 2 else 0.27)
        if bar % 4 == 3:  # fill
            for i in range(4):
                m.add((b0 + 3 + i * 0.25) * spb, tom(220 - i * 25, 110 - i * 10, 0.22), 0.55)
        t3 = triad(root + 24, bool(minor[root]))
        for bt in (0.5, 1.5, 2.5, 3.5):
            for tn in t3:
                m.add((b0 + bt) * spb, stab(tn), 0.16, 0.12)
    A4, C5, D5, E5, G5, A5, B4, Gs4, C6 = (n(x) for x in ("A4", "C5", "D5", "E5", "G5", "A5", "B4", "G#4", "C6"))
    lead1 = [(A5, 0.5), (G5, 0.5), (E5, 1), (A5, 0.5), (G5, 0.5), (E5, 1), (D5, 0.5), (E5, 0.5), (G5, 1), (E5, 2)]
    lead2 = [(C6, 1), (A5, 0.5), (G5, 0.5), (A5, 1), (E5, 1), (G5, 0.5), (A5, 0.5), (C6, 1), (A5, 2)]
    lead3 = [(E5, 0.5), (E5, 0.5), (G5, 1), (A5, 1), (G5, 1), (E5, 0.5), (D5, 0.5), (C5, 1), (D5, 1), (E5, 1)]
    lead4 = [(A5, 1), (A5, 0.5), (G5, 0.5), (E5, 1), (D5, 1), (E5, 1), (Gs4 + 12, 1), (B4 + 12, 1), (E5 + 12, 1)]
    leads = {2: lead1, 6: lead2, 10: lead3, 14: lead2, 16: lead1, 18: lead4}
    for bar, mel in leads.items():
        # each lead covers 8 beats (2 bars)
        put_melody(m, mel, bar * bpb, spb, pulse_lead, 0.4, 0.15, vib=0.004)
    return m.render(make_ir(0.9, 5.0, brightness=3500), wet=0.28)


def music_night():
    """A minor pentatonic waltz, 72 bpm, 16 bars of 3/4 (40 s). Music box + crickets."""
    bpm, bars, bpb = 72, 16, 3
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    A, F, C, G = n("A2"), n("F2"), n("C3"), n("G2")
    prog = [(A, 1), (F, 0), (C, 0), (G, 0)] * 3 + [(A, 1), (F, 0), (C, 0), (G, 0)]
    for bar, (root, minor) in enumerate(prog):
        b0 = bar * bpb
        t3 = triad(root + 12, bool(minor))
        notes = [t3[0] + 12, t3[1] + 12, t3[2] + 12, t3[1] + 12, t3[2] + 12, t3[1] + 12]
        for i, nt in enumerate(notes):
            m.add((b0 + i * 0.5) * spb, musicbox(nt + 12), 0.34 if i % 2 == 0 else 0.22, 0.5)
        for tn in t3:
            m.add(b0 * spb, pad(tn, bpb * spb, attack=0.9, release=1.0), 0.7, 0.5)
        m.add(b0 * spb, bass(root - 12, 1.8), 0.55)
    # drone
    for tn in (n("A1"), n("E2")):
        m.add(0, pad(tn, bars * bpb * spb - 1.0, attack=2.0, release=1.0), 0.45, 0.3)
    # crickets, gently
    r = rng(5)
    for _ in range(9):
        m.add(float(r.uniform(0, bars * bpb * spb - 0.6)), cricket(seed=int(r.integers(0, 99))), float(r.uniform(0.06, 0.12)))
    A5, C6, D6, E6, G5, B5 = (n(x) for x in ("A5", "C6", "D6", "E6", "G5", "B5"))
    mel1 = [(E6, 3), (D6, 1.5), (C6, 1.5), (A5, 3), (None, 3), (G5, 1.5), (A5, 1.5), (C6, 3), (A5, 3), (None, 0)]
    mel2 = [(C6, 3), (A5, 1.5), (G5, 1.5), (A5, 3), (None, 3), (D6, 1.5), (C6, 1.5), (A5, 3), (G5, 3), (None, 0)]
    put_melody(m, mel1, 4 * bpb, spb, flute, 0.45, 0.6, breath=0.08)
    put_melody(m, mel2, 12 * bpb, spb, flute, 0.45, 0.6, breath=0.08)
    return m.render(make_ir(2.4, 2.0, brightness=3200), wet=0.6)


def music_victory():
    """C major sting, one-shot ~5.5 s."""
    bpm = 120
    spb = 60 / bpm
    m = Mix(3.6, loop=False, tail=2.2)
    arp = [n("C4"), n("E4"), n("G4"), n("C5"), n("E5"), n("G5"), n("C6")]
    for i, nt in enumerate(arp):
        m.add(i * 0.5 * spb, pluck(nt, 1.0), 0.45, 0.3)
        m.add(i * 0.5 * spb, bell(nt + 12, 2.0, 1.6), 0.12, 0.5)
    t0 = len(arp) * 0.5 * spb
    for tn in (n("C4"), n("E4"), n("G4"), n("C5")):
        m.add(t0, strings(tn, 1.8, attack=0.08, release=1.2), 1.0, 0.4)
    m.add(t0, bass(n("C3"), 1.8), 0.9)
    m.add(t0, kick(0.4, 0.8), 0.7)
    m.add(t0, bell(n("C6"), 3.0, 1.0), 0.5, 0.8)
    mel = [(n("G5"), 0.75), (n("C6"), 0.75), (n("E6"), 1.5)]
    b = t0 / spb
    for note, beats in mel:
        m.add(b * spb, flute(note, beats * spb + 0.4, seed=int(b * 10)), 0.5, 0.6)
        b += beats
    return m.render(make_ir(2.0, 2.4), wet=0.6)


def music_boss():
    """D Phrygian, 126 bpm, 16 bars (30 s). Cinder Matriarch (#385): war toms,
    low brass pad, a chromatic ostinato, choir-ish strings and a bell motif."""
    bpm, bars, bpb = 126, 16, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    D, Eb, C, Bb = n("D2"), n("Eb2"), n("C2"), n("Bb1")
    prog = [D, D, Eb, D, D, D, C, Eb, Bb, C, D, Eb, D, D, Eb, C]
    osti = [0, 1, 0, 3, 0, 1, 7, 6]  # semitones over the root, eighth notes
    for bar, root in enumerate(prog):
        b0 = bar * bpb
        for i, iv in enumerate(osti):
            m.add((b0 + i * 0.5) * spb, pulse_bass(root + 12 + iv, 0.22), 0.7 if i % 2 == 0 else 0.5)
        m.add(b0 * spb, bass(root, 1.4), 0.75)
        # war drums: kick + low toms, a roll every 4th bar
        m.add(b0 * spb, kick(0.4, 1.1), 1.0)
        m.add((b0 + 2) * spb, kick(0.4, 1.0), 0.85)
        m.add((b0 + 1) * spb, tom(140, 70, 0.4), 0.7)
        m.add((b0 + 3) * spb, tom(150, 75, 0.4), 0.75)
        m.add((b0 + 3.5) * spb, snare(seed=60 + bar % 4), 0.45)
        for i in range(4):
            m.add((b0 + i + 0.5) * spb, hat(seed=70 + i), 0.18)
        if bar % 4 == 3:
            for i in range(8):
                m.add((b0 + 2 + i * 0.25) * spb, tom(200 - i * 12, 90, 0.25), 0.4 + i * 0.04)
        # brass-ish power chord (root + fifth) pad, minor third on top
        for tn in (root + 12, root + 19, root + 24):
            m.add(b0 * spb, pad(tn, bpb * spb, detune=0.1, nh=9, attack=0.08, release=0.4), 0.9, 0.3)
        for tn in (root + 24, root + 27, root + 31):
            m.add(b0 * spb, strings(tn, bpb * spb * 0.95, attack=0.5, release=0.6), 0.85, 0.5)
    D5, Eb5, F5, G5, A5, C6, Bb4, A4 = (n(x) for x in ("D5", "Eb5", "F5", "G5", "A5", "C6", "Bb4", "A4"))
    motif1 = [(D5, 1.5), (Eb5, 0.5), (D5, 1), (A4, 1), (Bb4, 1.5), (A4, 0.5), (G5 - 12, 1), (A4, 1)]
    motif2 = [(F5, 1.5), (G5, 0.5), (A5, 1), (C6, 1), (Bb4 + 12, 1.5), (A5, 0.5), (G5, 1), (Eb5, 1)]
    for bar, mel in ((4, motif1), (8, motif2), (12, motif1)):
        put_melody(m, mel, bar * bpb, spb, pulse_lead, 0.34, 0.25, vib=0.005)
    for bar in (0, 8):
        m.add(bar * bpb * spb, bell(n("D5"), 3.0, 1.0), 0.35, 0.7)
    return m.render(make_ir(1.4, 3.6, brightness=3000), wet=0.4)


def music_rival():
    """E minor, 150 bpm, 16 bars (26 s). Wren (#385): cocky, bouncy, a bright
    whistle hook over a skipping bass and handclap kit."""
    bpm, bars, bpb = 150, 16, 4
    spb = 60 / bpm
    m = Mix(bars * bpb * spb, loop=True)
    E, C, G, D, B = n("E2"), n("C2"), n("G2"), n("D2"), n("B1")
    prog = [E, E, C, D, E, E, C, B, G, D, E, C, G, D, C, B]
    minor = {E: True, C: False, G: False, D: False, B: False}
    for bar, root in enumerate(prog):
        b0 = bar * bpb
        for i, beat in enumerate((0, 0.75, 1.5, 2, 2.75, 3.5)):
            nt = root + (12 if i in (2, 5) else 0)
            m.add((b0 + beat) * spb, pulse_bass(nt + 12, 0.2), 0.75 if i % 3 == 0 else 0.55)
        m.add(b0 * spb, kick(), 0.9)
        m.add((b0 + 1.5) * spb, kick(), 0.55)
        m.add((b0 + 2.5) * spb, kick(), 0.6)
        m.add((b0 + 1) * spb, snare(seed=80 + bar % 3), 0.65)
        m.add((b0 + 3) * spb, snare(seed=83 + bar % 3), 0.7)
        for i in range(8):
            m.add((b0 + i * 0.5) * spb, shaker(seed=90 + i % 4), 0.3 if i % 2 else 0.2)
        t3 = triad(root + 24, bool(minor[root]))
        for bt in (0.5, 1.25, 2.5, 3.25):
            for tn in t3:
                m.add((b0 + bt) * spb, stab(tn), 0.14, 0.1)
    E5, Fs5, G5, A5, B5, D6, E6, D5 = (n(x) for x in ("E5", "F#5", "G5", "A5", "B5", "D6", "E6", "D5"))
    hook = [(B5, 0.5), (E6, 0.5), (D6, 0.5), (B5, 0.5), (A5, 0.5), (G5, 0.5), (A5, 1), (B5, 1.5), (None, 0.5), (G5, 0.5), (A5, 0.5), (B5, 1)]
    hook2 = [(E6, 0.75), (D6, 0.25), (B5, 0.5), (G5, 0.5), (A5, 1), (Fs5, 1), (G5, 0.5), (A5, 0.5), (B5, 0.5), (D6, 0.5), (E6, 2)]
    for bar, mel in ((2, hook), (6, hook2), (10, hook), (14, hook2)):
        put_melody(m, mel, bar * bpb, spb, whistle, 0.5, 0.3)
    return m.render(make_ir(0.8, 5.0, brightness=3600), wet=0.25)


MUSIC = {
    "title": music_title,
    "grove": music_grove,
    "shrine": music_shrine,
    "village": music_village,
    "battle": music_battle,
    "night": music_night,
    "victory": music_victory,
    "boss": music_boss,
    "rival": music_rival,
}


# --------------------------------------------------------------------------
# SFX
# --------------------------------------------------------------------------
def norm(x, peak=0.85):
    return x / max(1e-6, np.max(np.abs(x))) * peak


def sfx_ui_click():
    t = tvec(0.07)
    tone = np.sin(TAU * np.cumsum(1100 + 900 * (t / 0.07)) / SR) * np.exp(-t * 60)
    tick = noise(0.07, 1, lo=3000) * np.exp(-t * 200) * 0.4
    return norm(tone + tick, 0.7)


def footstep(kind):
    if kind == "grass":
        d = 0.11
        t = tvec(d)
        nz = noise(d, 11, lo=900, hi=3800) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
        thud = np.sin(TAU * 90 * t) * np.exp(-t * 45) * 0.4
        return norm(nz + thud, 0.6)
    if kind == "stone":
        d = 0.09
        t = tvec(d)
        tick = noise(d, 12, lo=1500, hi=6500) * np.exp(-t * 90)
        thud = np.sin(TAU * 140 * t) * np.exp(-t * 55) * 0.55
        return norm(tick + thud, 0.65)
    if kind == "wood":
        d = 0.12
        t = tvec(d)
        knock = (np.sin(TAU * 190 * t) + 0.5 * np.sin(TAU * 410 * t)) * np.exp(-t * 48)
        tick = noise(d, 13, lo=1200, hi=4000) * np.exp(-t * 110) * 0.5
        return norm(knock + tick, 0.65)
    d = 0.14  # sand / gravel
    t = tvec(d)
    crunch = noise(d, 14, lo=1800, hi=7000) * (0.6 + 0.4 * np.sign(np.sin(TAU * 90 * t))) * np.exp(-t * 28)
    return norm(crunch + np.sin(TAU * 80 * t) * np.exp(-t * 40) * 0.3, 0.55)


def sfx_craft_success():
    m = Mix(1.0, loop=False, tail=0.8)
    for i, nt in enumerate((n("C5"), n("E5"), n("G5"), n("C6"), n("E6"))):
        m.add(i * 0.07, bell(nt, 1.4, 2.0), 0.55, 0.4)
    m.add(0.35, pluck(n("C5"), 0.7), 0.3)
    return norm(m.render(make_ir(0.7, 5.0), 0.5), 0.8)


def sfx_level_up():
    m = Mix(0.9, loop=False, tail=0.7)
    for i, nt in enumerate((n("G4"), n("C5"), n("E5"), n("G5"))):
        m.add(i * 0.085, pulse_lead(nt, 0.18), 0.35, 0.2)
        m.add(i * 0.085, bell(nt + 12, 1.2, 2.4), 0.3, 0.3)
    m.add(0.36, bell(n("C6"), 1.6, 1.4), 0.55, 0.5)
    m.add(0.36, pluck(n("E5"), 0.8), 0.3)
    return norm(m.render(make_ir(0.6, 5.0), 0.4), 0.8)


def sfx_evolve():
    d = 2.2
    t = tvec(d)
    f = 220 * 2 ** (2.6 * (t / d) ** 1.6)
    ph = TAU * np.cumsum(f) / SR
    swell = sum(np.sin(k * ph) / k**1.2 for k in range(1, 6)) * (t / d) ** 1.4
    shimmer = sum(np.sin(TAU * hz(n("C5") + 12 * j) * t * (1 + 0.003 * np.sin(TAU * 6 * t))) for j in range(1, 3))
    shimmer *= np.clip((t - 0.4) / 1.4, 0, 1) * 0.25
    body = fft_filter(swell, hi=5000) * env(len(t), 0.05, 0, 0.1) * 0.5 + shimmer
    m = Mix(d, loop=False, tail=1.2)
    m.add(0, body * np.where(t < 1.5, 1.0, np.exp(-(t - 1.5) * 4)), 0.8, 0.3)
    for tn in (n("C5"), n("E5"), n("G5"), n("C6")):
        m.add(1.45, bell(tn, 2.2, 1.0), 0.45, 0.6)
    m.add(1.45, kick(0.5, 0.8), 0.5)
    return norm(m.render(make_ir(1.1, 3.0), 0.5), 0.85)


def sfx_ability():
    d = 0.7
    t = tvec(d)
    f = 520 + 680 * (t / d) ** 0.7
    ph = TAU * np.cumsum(f) / SR
    body = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * env(len(t), 0.02, 3.5, 0.2, 0.2) * 0.6
    sp = Mix(d, loop=False, tail=0.5)
    sp.add(0, body, 0.8, 0.3)
    for i, nt in enumerate((n("E6"), n("G6"), n("B6"))):
        sp.add(0.25 + i * 0.07, bell(nt, 0.8, 4.0), 0.25, 0.3)
    return norm(sp.render(make_ir(0.5, 6.0), 0.4), 0.8)


def sfx_move(kind):
    if kind == "fire":
        d = 0.75
        t = tvec(d)
        roar = noise(d, 21, lo=120, hi=2600) * np.exp(-((t - 0.18) / 0.22) ** 2) * (1 + 0.5 * np.sin(TAU * 31 * t))
        crackle_env = (rng(22).random(len(t)) > 0.994).astype(float)
        crackle = np.convolve(crackle_env, np.exp(-np.arange(300) / 40.0) * np.sin(np.arange(300) * 1.1), "same")
        crackle = fft_filter(crackle, lo=1500) * np.exp(-t * 3)
        return norm(roar * 0.9 + crackle * 4.0 + noise(d, 23, lo=3000) * np.exp(-t * 18) * 0.15, 0.8)
    if kind == "water":
        d = 0.75
        t = tvec(d)
        out = noise(d, 24, lo=300, hi=1800) * np.exp(-((t - 0.2) / 0.2) ** 2) * 0.7
        r = rng(25)
        for _ in range(7):
            st = float(r.uniform(0.05, 0.5))
            dur = 0.12
            tt = tvec(dur)
            f = float(r.uniform(500, 900)) * (1 + 2.2 * tt / dur)
            blip = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-tt * 28) * 0.45
            i = int(st * SR)
            out[i:i + len(blip)] += blip
        return norm(out * env(len(t), 0.01, 0, 0.2), 0.75)
    if kind == "grove":
        d = 0.75
        t = tvec(d)
        rustle = noise(d, 26, lo=2200, hi=7500) * (0.5 + 0.5 * np.sin(TAU * 22 * t)) * np.exp(-((t - 0.2) / 0.22) ** 2)
        m = Mix(d, loop=False, tail=0.4)
        m.add(0, rustle * 0.6, 1.0)
        for i, nt in enumerate((n("D5"), n("F#5"), n("A5"))):
            m.add(0.1 + i * 0.1, pluck(nt, 0.6), 0.4, 0.3)
        return norm(m.render(make_ir(0.4, 7.0), 0.35), 0.75)
    d = 0.5  # neutral: punchy whoosh + thud
    t = tvec(d)
    sweep = noise(d, 27, lo=400, hi=5000) * np.exp(-((t - 0.12) / 0.1) ** 2)
    thump = np.sin(TAU * (60 + 120 * np.exp(-t * 28)) * t) * np.exp(-t * 14) * 0.9
    return norm(sweep * 0.9 + thump, 0.8)


def sfx_boss_sting():
    """#385: VS / transformation hit. Gong + tom roll + low brass cluster."""
    m = Mix(1.4, loop=False, tail=1.6)
    for i in range(6):
        m.add(i * 0.06, tom(210 - i * 20, 80, 0.3), 0.35 + i * 0.08)
    t0 = 0.38
    m.add(t0, kick(0.6, 1.2), 1.0)
    for tn in (n("D2"), n("A2"), n("D3"), n("Eb3")):
        m.add(t0, pad(tn, 1.0, detune=0.12, nh=10, attack=0.02, release=1.2), 1.4, 0.4)
    m.add(t0, bell(n("D3"), 2.6, 0.7), 0.7, 0.6)
    m.add(t0, noise(1.2, 31, lo=200, hi=3000) * np.exp(-tvec(1.2) * 3.5), 0.25, 0.5)
    return norm(m.render(make_ir(1.4, 3.0), 0.5), 0.85)


SFX = {
    "ui-click": sfx_ui_click,
    "step-grass": lambda: footstep("grass"),
    "step-stone": lambda: footstep("stone"),
    "step-wood": lambda: footstep("wood"),
    "step-sand": lambda: footstep("sand"),
    "craft-success": sfx_craft_success,
    "level-up": sfx_level_up,
    "evolve": sfx_evolve,
    "ability": sfx_ability,
    "move-fire": lambda: sfx_move("fire"),
    "move-water": lambda: sfx_move("water"),
    "move-grove": lambda: sfx_move("grove"),
    "move-neutral": lambda: sfx_move("neutral"),
    "boss-sting": sfx_boss_sting,
}


# --------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------
def write_wav(path: Path, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def write_music(name: str, x: np.ndarray) -> None:
    import soundfile as sf

    ogg = OUT / f"music-{name}.ogg"
    # ponytail: quality 0.4 mono is ~45 kbps; raise if a track sounds crunchy
    sf.write(str(ogg), x.astype("float32"), SR, format="OGG", subtype="VORBIS")
    afconvert = shutil.which("afconvert")
    if afconvert:
        wav = OUT / f".tmp-{name}.wav"
        write_wav(wav, x)
        m4a = OUT / f"music-{name}.m4a"
        subprocess.run([afconvert, "-f", "m4af", "-d", "aac", "-b", "48000", str(wav), str(m4a)], check=True)
        wav.unlink()
    else:
        print(f"  (afconvert missing: skipped music-{name}.m4a Safari fallback)")


def main(argv: list[str]) -> int:
    what = argv[1] if len(argv) > 1 else "all"
    only = set(argv[2:])
    OUT.mkdir(parents=True, exist_ok=True)
    if what in ("all", "sfx"):
        for name, fn in SFX.items():
            if only and name not in only:
                continue
            x = fn()
            write_wav(OUT / f"sfx-{name}.wav", x)
            print(f"sfx-{name}.wav  {len(x) / SR:.2f}s")
    if what in ("all", "music"):
        for name, fn in MUSIC.items():
            if only and name not in only:
                continue
            x = fn()
            write_music(name, x)
            print(f"music-{name}  {len(x) / SR:.1f}s peak={np.max(np.abs(x)):.2f} rms={np.sqrt(np.mean(x**2)):.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
