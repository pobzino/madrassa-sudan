#!/usr/bin/env python3
"""Generate letter-tracing templates from OFL Andika and Noto Naskh glyphs.

Each letter's strokes are written by hand as a few waypoints (in tenths of the
glyph box) in the order and direction a child is taught: Arabic right to left,
main body first, dots and hamza after; English top to bottom, left to right.
The script snaps every waypoint onto the glyph's centerline (skeleton) and
follows the centerline between them, so the demo path sits exactly on the
font's letter while the order and direction stay the teacher's.

Outputs (all committed):
  src/lib/interactions/trace-templates/{ar,en}.json   full set, server-side grading
  public/trace-letter/templates/{ar,en}/{hex}.json     one letter each, fetched by the client
  src/lib/interactions/trace-templates/glyph-reference-masks.json   glyph masks for the IoU test

Requires Pillow, NumPy, SciPy and scikit-image:
  python3 -m venv /tmp/trace-venv && /tmp/trace-venv/bin/pip install numpy scipy scikit-image pillow
  /tmp/trace-venv/bin/python scripts/generate-trace-letter-templates.py
"""
from __future__ import annotations

import base64
import heapq
import json
import math
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "scripts" / "trace-letter-fonts"
OUT_DIR = ROOT / "src" / "lib" / "interactions" / "trace-templates"
PUBLIC_DIR = ROOT / "public" / "trace-letter" / "templates"
AR_LETTERS = list("ابتثجحخدذرزسشصضطظعغفقكلمنهوي")
EN_LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
AR_ISOLATED = dict(zip(AR_LETTERS, [
    "ﺍ", "ﺏ", "ﺕ", "ﺙ", "ﺝ", "ﺡ", "ﺥ", "ﺩ", "ﺫ", "ﺭ", "ﺯ", "ﺱ", "ﺵ", "ﺹ", "ﺽ", "ﻁ", "ﻅ", "ﻉ", "ﻍ", "ﻑ", "ﻕ", "ﻙ", "ﻝ", "ﻡ", "ﻥ", "ﻩ", "ﻭ", "ﻱ",
]))
SIZE = 128
MAX_POINTS = 48

# Stroke plans. ("m", [(x, y), ...]) = a body stroke through these waypoints
# (tenths of the box, x to the right, y down); ("h", [...]) = a detached mark
# such as kaf's small zigzag; ("d", (x, y)) = the dot nearest that point.
M, H, D = "m", "h", "d"
PLANS: dict[str, list] = {
    # ---- Arabic, isolated forms
    "ا": [(M, [(5, 1.3), (4.9, 8.7)])],
    "ب": [(M, [(8.4, 1.3), (8.5, 4.5), (5, 5.5), (1.5, 4.7), (1.4, 2.8)]), (D, (4.8, 7.8))],
    "ت": [(M, [(8.3, 2.9), (5, 7.1), (1.4, 4.3)]), (D, (5.3, 3.0)), (D, (3.5, 3.1))],
    "ث": [(M, [(8.4, 3.1), (5, 7.4), (1.4, 4.6)]), (D, (5.5, 3.3)), (D, (3.8, 3.4)), (D, (4.6, 2.5))],
    "ج": [(M, [(2.1, 1.9), (7.7, 1.8), (5.2, 2.4), (2.4, 5.5), (4.9, 8.1), (7.8, 7.8)]), (D, (5.0, 5.4))],
    "ح": [(M, [(2.1, 2.0), (7.7, 1.8), (5.2, 2.4), (2.4, 5.5), (5.0, 8.2), (7.8, 7.8)])],
    "خ": [(M, [(2.6, 3.4), (6.9, 3.6), (5.1, 3.9), (3.0, 5.6), (4.8, 8.2), (7.3, 7.8)]), (D, (4.9, 1.5))],
    "د": [(M, [(6.1, 1.3), (7.6, 5.5), (5.0, 7.9), (2.1, 6.9)])],
    "ذ": [(M, [(5.7, 3.7), (6.8, 7.3), (4.5, 8.0), (3.0, 7.5)]), (D, (5.0, 1.3))],
    "ر": [(M, [(6.2, 1.2), (6.5, 4.5), (4.5, 7.8), (2.6, 7.6)])],
    "ز": [(M, [(5.7, 3.4), (6.3, 6.4), (4.6, 8.2), (3.1, 7.5)]), (D, (5.3, 1.6))],
    "س": [(M, [(8.5, 2.4), (7.2, 3.1), (4.8, 3.4), (3.0, 7.3), (1.2, 4.8)])],
    "ش": [(M, [(8.5, 2.9), (8.6, 5.0), (7.1, 3.7), (4.7, 3.8), (2.8, 7.8), (1.2, 5.2)]), (D, (7.3, 2.6)), (D, (6.5, 2.6)), (D, (6.9, 1.8))],
    "ص": [(M, [(4.7, 4.6), (6.5, 2.7), (8.5, 3.7), (6.8, 4.7), (4.6, 4.7), (4.4, 3.4), (2.9, 6.8), (1.2, 4.7)])],
    "ض": [(M, [(4.9, 5.5), (6.6, 3.5), (8.6, 4.5), (7.0, 5.6), (4.9, 5.6), (4.4, 4.4), (2.9, 7.6), (1.2, 5.6)]), (D, (6.3, 1.9))],
    "ط": [(M, [(3.8, 6.6), (6.2, 5.0), (8.6, 6.4), (6.0, 8.1), (3.1, 8.1), (1.3, 7.4)]), (M, [(3.5, 1.3), (3.2, 8.1)])],
    "ظ": [(M, [(3.8, 6.6), (6.2, 5.0), (8.6, 6.4), (6.0, 8.1), (3.1, 8.1), (1.3, 7.4)]), (M, [(3.5, 1.3), (3.2, 8.1)]), (D, (6.4, 2.2))],
    "ع": [(M, [(4.9, 1.6), (2.5, 2.5), (3.6, 4.0), (5.9, 3.0), (2.7, 6.0), (5.0, 8.4), (7.6, 8.0)])],
    "غ": [(M, [(4.9, 3.1), (2.0, 3.8), (3.1, 4.9), (5.7, 4.1), (2.3, 6.5), (4.3, 8.3), (7.0, 8.0)]), (D, (3.0, 1.3))],
    "ف": [(M, [(8.3, 5.6), (6.8, 3.7), (5.6, 4.6), (6.3, 5.8), (8.3, 5.6), (8.5, 6.5), (4.5, 8.0), (1.5, 7.5), (1.4, 5.3)]), (D, (7.0, 1.8))],
    "ق": [(M, [(7.1, 5.2), (6.5, 3.5), (4.8, 4.2), (5.1, 5.3), (7.1, 5.2), (7.3, 6.4), (5.0, 8.0), (3.0, 7.4), (2.4, 5.5)]), (D, (6.2, 1.6)), (D, (4.9, 1.6))],
    "ك": [(M, [(7.1, 1.0), (7.3, 7.8), (4.5, 8.1), (2.4, 8.0)]), (H, [(5.1, 4.4), (4.0, 4.7), (4.5, 5.4), (3.8, 6.1)])],
    "ل": [(M, [(6.2, 1.1), (6.6, 7.0), (5.0, 8.4), (3.3, 7.6), (3.2, 6.0)])],
    "م": [(M, [(3.5, 3.3), (5.0, 1.4), (6.6, 3.3), (4.2, 4.2), (3.0, 5.2), (3.0, 8.5)])],
    "ن": [(M, [(7.2, 2.9), (7.4, 6.0), (4.3, 8.2), (2.0, 6.5), (2.3, 4.8)]), (D, (4.5, 1.4))],
    "ه": [(M, [(4.5, 1.9), (2.8, 5.0), (5.0, 8.6), (7.1, 6.5), (4.8, 2.1)])],
    "و": [(M, [(7.2, 4.8), (7.2, 2.8), (5.2, 1.5), (3.7, 3.2), (5.1, 4.9), (7.2, 4.9), (7.0, 6.5), (5.0, 8.0), (2.6, 7.6)])],
    "ي": [(M, [(7.4, 1.7), (6.2, 1.4), (5.0, 2.6), (7.2, 4.7), (5.0, 6.3), (2.6, 5.6), (2.5, 3.9)]), (D, (6.1, 7.6)), (D, (4.5, 7.6))],
    # ---- English capitals
    "A": [(M, [(5.0, 1.5), (1.6, 8.7)]), (M, [(5.0, 1.5), (8.3, 8.8)]), (M, [(3.0, 6.1), (7.0, 6.1)])],
    "B": [(M, [(2.8, 1.3), (2.8, 8.4)]), (M, [(2.9, 1.3), (6.3, 2.8), (2.9, 4.6), (6.9, 6.6), (2.9, 8.4)])],
    "C": [(M, [(7.2, 1.8), (2.2, 5.0), (5.0, 8.3), (7.6, 6.9)])],
    "D": [(M, [(2.4, 1.3), (2.4, 8.3)]), (M, [(2.5, 1.3), (7.5, 4.5), (2.5, 8.3)])],
    "E": [(M, [(3.0, 1.3), (3.0, 8.3)]), (M, [(3.0, 1.3), (6.8, 1.3)]), (M, [(3.0, 4.8), (6.3, 4.8)]), (M, [(3.0, 8.3), (6.9, 8.3)])],
    "F": [(M, [(3.0, 1.3), (3.0, 8.5)]), (M, [(3.0, 1.3), (6.8, 1.3)]), (M, [(3.0, 4.9), (6.3, 4.9)])],
    "G": [(M, [(7.4, 1.9), (1.9, 5.0), (5.0, 8.4), (7.3, 5.3), (5.5, 5.3)])],
    "H": [(M, [(2.4, 1.1), (2.4, 8.5)]), (M, [(7.9, 1.0), (7.9, 8.6)]), (M, [(2.4, 4.8), (7.8, 4.8)])],
    "I": [(M, [(4.9, 1.6), (4.9, 8.4)]), (M, [(3.4, 1.5), (6.5, 1.4)]), (M, [(3.4, 8.5), (6.5, 8.4)])],
    "J": [(M, [(6.5, 1.4), (6.4, 6.5), (5.0, 8.3), (3.2, 7.2)])],
    "K": [(M, [(2.5, 1.2), (2.5, 8.5)]), (M, [(7.3, 1.1), (2.6, 4.8), (7.7, 8.8)])],
    "L": [(M, [(3.0, 1.2), (3.0, 8.3), (6.9, 8.3)])],
    "M": [(M, [(2.1, 1.6), (1.4, 8.4)]), (M, [(2.1, 1.6), (4.9, 8.0), (7.9, 1.6), (8.5, 8.5)])],
    "N": [(M, [(2.3, 1.1), (2.2, 8.4)]), (M, [(2.4, 1.2), (7.5, 8.0), (7.8, 1.0)])],
    "O": [(M, [(5.0, 1.3), (2.0, 5.0), (5.0, 8.4), (8.0, 5.0), (5.0, 1.3)])],
    "P": [(M, [(3.0, 1.3), (3.0, 8.7)]), (M, [(3.0, 1.3), (7.0, 3.5), (3.0, 5.1)])],
    "Q": [(M, [(5.0, 1.3), (2.0, 4.5), (4.7, 7.7), (7.9, 4.5), (5.0, 1.3)]), (M, [(5.9, 7.5), (8.0, 8.2)])],
    "R": [(M, [(2.6, 1.3), (2.6, 8.4)]), (M, [(2.6, 1.3), (6.3, 3.0), (2.6, 5.0), (7.8, 8.8)])],
    "S": [(M, [(6.9, 1.4), (2.6, 2.5), (5.0, 4.8), (7.2, 6.5), (4.5, 8.3), (2.7, 7.4)])],
    "T": [(M, [(4.9, 1.4), (5.3, 8.8)]), (M, [(1.9, 1.4), (7.9, 1.4)])],
    "U": [(M, [(2.5, 1.1), (2.6, 6.5), (5.0, 8.4), (7.5, 6.5), (7.7, 1.0)])],
    "V": [(M, [(1.6, 1.0), (4.9, 8.0), (8.4, 1.0)])],
    "W": [(M, [(1.1, 2.0), (3.0, 7.0), (5.0, 2.2), (6.8, 7.0), (8.6, 1.9)])],
    "X": [(M, [(2.1, 1.0), (8.0, 8.9)]), (M, [(8.0, 1.0), (1.9, 8.8)])],
    "Y": [(M, [(1.7, 1.0), (4.9, 5.0)]), (M, [(8.1, 1.0), (4.9, 5.0), (5.1, 8.6)])],
    "Z": [(M, [(2.4, 1.4), (7.0, 1.3), (2.3, 8.2), (7.6, 8.0)])],
    # ---- English small letters
    "a": [(M, [(7.1, 1.8), (2.3, 4.5), (4.1, 8.1), (7.1, 4.9), (7.1, 1.8), (7.4, 8.5)])],
    "b": [(M, [(3.1, 1.0), (3.2, 8.2)]), (M, [(3.2, 5.0), (6.6, 6.2), (3.2, 8.2)])],
    "c": [(M, [(7.3, 1.8), (2.5, 5.0), (5.0, 8.2), (7.7, 6.9)])],
    "d": [(M, [(6.3, 4.4), (2.9, 6.0), (4.3, 8.4), (6.4, 7.2)]), (M, [(6.2, 1.0), (6.4, 7.3), (7.1, 8.6)])],
    "e": [(M, [(2.5, 4.4), (7.4, 4.4), (5.0, 1.6), (2.4, 5.0), (5.0, 8.2), (7.8, 7.5)])],
    "f": [(M, [(6.8, 1.3), (5.0, 1.6), (4.4, 3.0), (4.5, 8.8)]), (M, [(3.3, 4.3), (6.0, 4.3)])],
    "g": [(M, [(6.7, 1.5), (2.6, 3.5), (3.6, 5.8), (6.7, 5.1), (6.7, 1.5), (6.6, 7.0), (3.1, 8.2)])],
    "h": [(M, [(3.0, 1.0), (3.0, 8.3)]), (M, [(3.1, 5.0), (5.0, 4.2), (6.4, 5.0), (6.4, 8.3)])],
    "i": [(M, [(4.9, 3.8), (4.9, 8.1)]), (D, (4.9, 1.5))],
    "j": [(M, [(5.0, 3.0), (4.2, 8.6)]), (D, (5.2, 1.3))],
    "k": [(M, [(3.1, 1.0), (3.1, 8.3)]), (M, [(6.9, 4.2), (3.1, 5.9), (7.0, 8.8)])],
    "l": [(M, [(4.5, 1.0), (4.6, 7.8), (5.2, 8.6)])],
    "m": [(M, [(1.2, 2.1), (1.7, 3.2), (1.7, 7.0)]), (M, [(1.8, 3.2), (3.5, 2.3), (4.8, 7.0), (6.6, 2.4), (8.0, 7.0)])],
    "n": [(M, [(1.7, 1.2), (2.4, 3.1), (2.3, 8.0)]), (M, [(2.4, 3.1), (4.5, 1.8), (7.5, 3.0), (7.6, 8.0)])],
    "o": [(M, [(5.0, 1.5), (2.0, 5.0), (5.0, 8.3), (8.0, 5.0), (5.0, 1.5)])],
    "p": [(M, [(2.7, 1.2), (3.2, 2.5), (3.6, 8.7)]), (M, [(3.2, 2.5), (7.0, 3.5), (3.2, 5.6)])],
    "q": [(M, [(6.6, 1.5), (3.2, 3.5), (4.4, 6.0), (6.6, 5.1), (6.6, 1.5), (7.0, 8.7)])],
    "r": [(M, [(2.4, 1.2), (3.1, 3.3), (3.0, 8.0)]), (M, [(3.1, 3.3), (5.0, 2.2), (6.8, 2.2), (7.0, 3.1)])],
    "s": [(M, [(6.9, 1.6), (3.0, 2.5), (5.0, 4.8), (7.0, 6.5), (5.0, 8.2), (2.1, 7.6)])],
    "t": [(M, [(4.6, 1.2), (4.5, 6.5), (5.2, 8.1), (6.6, 7.7)]), (M, [(2.9, 3.1), (6.5, 3.1)])],
    "u": [(M, [(1.4, 1.0), (2.2, 6.8), (4.0, 7.9), (7.2, 6.6), (7.2, 1.0), (8.3, 8.5)])],
    "v": [(M, [(1.2, 0.9), (4.9, 7.7), (8.8, 1.0)])],
    "w": [(M, [(1.4, 2.0), (3.0, 6.8), (5.0, 2.4), (6.6, 6.8), (8.6, 2.0)])],
    "x": [(M, [(1.5, 1.0), (8.9, 8.8)]), (M, [(8.5, 1.0), (1.3, 8.8)])],
    "y": [(M, [(2.5, 1.0), (5.0, 5.6)]), (M, [(7.6, 1.0), (5.0, 5.6), (2.3, 8.2)])],
    "z": [(M, [(2.5, 1.4), (6.8, 1.4), (2.2, 8.2), (7.6, 8.2)])],
}


def render_glyph(letter: str, font_path: Path) -> np.ndarray:
    font = ImageFont.truetype(str(font_path), 112)
    probe = Image.new("L", (512, 512), 0)
    draw = ImageDraw.Draw(probe)
    # Presentation Forms A give each Arabic letter's isolated glyph directly,
    # so the pipeline does not depend on platform shaping.
    draw.text((0, 0), AR_ISOLATED.get(letter, letter), fill=255, font=font)
    bbox = probe.getbbox()
    if not bbox:
        raise ValueError(f"No glyph for {letter!r}")
    glyph = probe.crop(bbox)
    scale = min(100 / glyph.width, 100 / glyph.height)
    glyph = glyph.resize((max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("L", (SIZE, SIZE), 0)
    canvas.paste(glyph, ((SIZE - glyph.width) // 2, (SIZE - glyph.height) // 2))
    return np.asarray(canvas) >= 96


def neighbours(p, pixels):
    y, x = p
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dx or dy) and (y + dy, x + dx) in pixels:
                yield (y + dy, x + dx), (math.sqrt(2) if dx and dy else 1.0)


def shortest_path(start, goal, pixels):
    dist = {start: 0.0}
    prev = {}
    queue = [(0.0, start)]
    while queue:
        d, p = heapq.heappop(queue)
        if p == goal:
            break
        if d > dist[p]:
            continue
        for q, w in neighbours(p, pixels):
            nd = d + w
            if nd < dist.get(q, math.inf):
                dist[q] = nd
                prev[q] = p
                heapq.heappush(queue, (nd, q))
    if goal not in dist:
        raise ValueError(f"No centerline path from {start} to {goal}")
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    return path[::-1]


def snap(point, pixels, endpoints, reach=9):
    """Nearest centerline pixel; a stroke tip within reach wins (so strokes start and end at the very tip)."""
    x, y = point[0] * SIZE / 10, point[1] * SIZE / 10
    near_end = min(endpoints, key=lambda p: (p[1] - x) ** 2 + (p[0] - y) ** 2, default=None)
    if near_end and math.hypot(near_end[1] - x, near_end[0] - y) <= 5:
        return near_end
    best = min(pixels, key=lambda p: (p[1] - x) ** 2 + (p[0] - y) ** 2)
    if math.hypot(best[1] - x, best[0] - y) > reach:
        raise ValueError(f"Waypoint {point} is {math.hypot(best[1] - x, best[0] - y):.1f}px from the letter")
    return best


def smooth(points: np.ndarray, passes: int = 2) -> np.ndarray:
    """Light Laplacian smoothing (pixel staircase out, shape in); ends stay put."""
    out = points.astype(float)
    for _ in range(passes):
        if len(out) < 3:
            break
        inner = (out[:-2] + 2 * out[1:-1] + out[2:]) / 4
        out = np.vstack([out[:1], inner, out[-1:]])
    return out


def resample(points: np.ndarray, count: int) -> np.ndarray:
    if len(points) == 1:
        return np.repeat(points, count, axis=0)
    lengths = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if lengths[-1] == 0:
        return np.repeat(points[:1], count, axis=0)
    t = np.linspace(0, lengths[-1], count)
    return np.column_stack((np.interp(t, lengths, points[:, 0]), np.interp(t, lengths, points[:, 1])))


def point_count(points: np.ndarray) -> int:
    """Points in proportion to length: at most 48, at least 6 (dots: 4)."""
    length = float(np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1))) / SIZE if len(points) > 1 else 0
    return max(6, min(MAX_POINTS, round(length * 40)))


def stroke_record(kind, pixel_path, distance, corners=()):
    xy = np.array([[x, y] for y, x in pixel_path], dtype=float) + 0.5
    radii = [float(distance[y, x]) for y, x in pixel_path]
    if kind == "dot":
        pts = resample(xy, 4) if len(xy) > 1 else np.repeat(xy, 2, axis=0)
    else:
        # Smooth between waypoints only, so tooth tips and turn-backs stay sharp.
        cuts = sorted({0, len(xy) - 1, *corners})
        pieces = [smooth(xy[a:b + 1]) for a, b in zip(cuts, cuts[1:]) if b > a]
        smoothed = np.vstack([pieces[0]] + [piece[1:] for piece in pieces[1:]]) if pieces else xy
        pts = resample(smoothed, point_count(xy))
    width = round(float(np.mean(radii)) * 2 / SIZE, 3)
    return {
        "kind": kind,
        "width": width,
        "points": [[round(min(1.0, max(0.0, x / SIZE)), 3), round(min(1.0, max(0.0, y / SIZE)), 3)] for x, y in pts],
    }


def glyph_template(letter: str, font_path: Path) -> tuple[dict, dict]:
    mask = render_glyph(letter, font_path)
    skeleton = skeletonize(mask)
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=int))
    distance = ndimage.distance_transform_edt(mask)
    pixels = {tuple(p) for p in np.argwhere(skeleton)}
    degree = {p: sum(1 for _ in neighbours(p, pixels)) for p in pixels}
    endpoints = [p for p, n in degree.items() if n == 1]
    used_marks: set[int] = set()
    strokes = []
    for kind, spec in PLANS[letter]:
        if kind == D:
            x, y = spec[0] * SIZE / 10, spec[1] * SIZE / 10
            areas = {i: int((labels == i).sum()) for i in range(1, count + 1)}
            body = max(areas, key=areas.get)
            candidates = [i for i in areas if i != body and i not in used_marks]
            if not candidates:
                raise ValueError(f"{letter}: no dot near {spec}")
            def gap(i):
                ys, xs = np.nonzero(labels == i)
                return math.hypot(xs.mean() - x, ys.mean() - y)
            label = min(candidates, key=gap)
            if gap(label) > 14:
                raise ValueError(f"{letter}: dot {spec} is {gap(label):.1f}px from the nearest mark")
            used_marks.add(label)
            comp = {p for p in pixels if labels[p] == label}
            if len(comp) >= 2:
                ends = [p for p in comp if sum(1 for _ in neighbours(p, comp)) <= 1] or sorted(comp)
                a = ends[0]
                b = max(comp, key=lambda p: math.hypot(p[0] - a[0], p[1] - a[1]))
                # Right to left / top to bottom, like the body.
                if (b[1] > a[1]) if letter in AR_ISOLATED else (b[0] < a[0]):
                    a, b = b, a
                path = shortest_path(a, b, comp)
            else:
                ys, xs = np.nonzero(labels == label)
                path = [(int(round(ys.mean())), int(round(xs.mean())))]
            strokes.append(stroke_record("dot", path, distance))
            continue
        # Tips must be on the letter; waypoints between them only pick the branch.
        snapped = [snap(point, pixels, endpoints, 9 if i in (0, len(spec) - 1) else 16) for i, point in enumerate(spec)]
        path = [snapped[0]]
        corners = []
        for a, b in zip(snapped, snapped[1:]):
            path += shortest_path(a, b, pixels)[1:]
            corners.append(len(path) - 1)
        if kind == H:
            used_marks.add(int(labels[snapped[0]]))
        strokes.append(stroke_record("main" if kind == M else "hamza", path, distance, corners))
    packed = np.packbits(mask.astype(np.uint8), axis=None).tobytes()
    return {"letter": letter, "strokes": strokes}, {"size": SIZE, "mask": base64.b64encode(zlib.compress(packed, 9)).decode("ascii")}


def main() -> None:
    configurations = [("ar", AR_LETTERS, FONT_DIR / "AmalTraceNaskh.ttf"), ("en", EN_LETTERS, FONT_DIR / "AmalTracePrint.ttf")]
    reference_masks = {}
    failures: list[str] = []
    for script, letters, font in configurations:
        templates = {}
        reference_masks[script] = {}
        out = PUBLIC_DIR / script
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob("*.json"):
            old.unlink()
        for letter in letters:
            try:
                template, mask = glyph_template(letter, font)
            except ValueError as error:
                failures.append(f"{letter}: {error}")
                continue
            templates[letter] = template
            reference_masks[script][letter] = mask
            body = json.dumps({"v": 3, "script": script, **template}, ensure_ascii=False, separators=(",", ":"))
            (out / f"{ord(letter):04x}.json").write_text(body + "\n")
        (OUT_DIR / f"{script}.json").write_text(
            json.dumps({"version": 3, "script": script, "templates": templates}, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        print(f"Generated {len(templates)} {script} letters from {font.name}")
    if failures:
        raise SystemExit("\n".join(failures))
    (OUT_DIR / "glyph-reference-masks.json").write_text(json.dumps({"version": 1, **reference_masks}, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
