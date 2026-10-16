#!/usr/bin/env python3
"""Generate trace paths from OFL Andika and Noto Naskh glyph centerlines.

Requires Pillow, NumPy, SciPy, and scikit-image. Font binaries and their OFL
license notices live in public/trace-letter/.
"""
from __future__ import annotations

import base64
import json
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "public" / "trace-letter"
OUT_DIR = ROOT / "src" / "lib" / "interactions" / "trace-templates"
AR_LETTERS = list("ابتثجحخدذرزسشصضطظعغفقكلمنهوي")
EN_LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
AR_ISOLATED = dict(zip(AR_LETTERS, [
    "\ufe8d", "\ufe8f", "\ufe95", "\ufe99", "\ufe9d", "\ufea1", "\ufea5", "\ufea9", "\ufeab", "\ufead", "\ufeaf", "\ufeb1", "\ufeb5", "\ufeb9", "\ufebd", "\ufec1", "\ufec5", "\ufec9", "\ufecd", "\ufed1", "\ufed5", "\ufed9", "\ufedd", "\ufee1", "\ufee5", "\ufee9", "\ufeed", "\ufef1",
]))
SIZE = 128


def render_glyph(letter: str, font_path: Path) -> np.ndarray:
    font = ImageFont.truetype(str(font_path), 112)
    probe = Image.new("L", (512, 512), 0)
    draw = ImageDraw.Draw(probe)
    # Unicode Arabic Presentation Forms A provide each letter's isolated
    # glyph directly, so this pipeline does not depend on platform shaping.
    glyph_text = AR_ISOLATED.get(letter, letter)
    draw.text((0, 0), glyph_text, fill=255, font=font)
    bbox = probe.getbbox()
    if not bbox:
        raise ValueError(f"No glyph for {letter!r}")
    glyph = probe.crop(bbox)
    max_side = 100
    scale = min(max_side / glyph.width, max_side / glyph.height)
    glyph = glyph.resize((max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("L", (SIZE, SIZE), 0)
    canvas.paste(glyph, ((SIZE - glyph.width) // 2, (SIZE - glyph.height) // 2))
    return np.asarray(canvas) >= 96


def neighbours(point: tuple[int, int], pixels: set[tuple[int, int]]) -> list[tuple[int, int]]:
    y, x = point
    found = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if not (dx or dy):
                continue
            other = (y + dy, x + dx)
            if other not in pixels:
                continue
            # Suppress a diagonal shortcut when an orthogonal pixel already
            # connects the same pair of local strokes.
            if dx and dy and ((y, x + dx) in pixels or (y + dy, x) in pixels):
                continue
            found.append(other)
    return found


def simplify(path: list[tuple[int, int]], epsilon: float = 0.75) -> list[tuple[float, float]]:
    if len(path) <= 2:
        return [(float(x), float(y)) for y, x in path]
    start = np.array([path[0][1], path[0][0]], dtype=float)
    end = np.array([path[-1][1], path[-1][0]], dtype=float)
    line = end - start
    denom = float(np.dot(line, line))
    distances = []
    for y, x in path[1:-1]:
        p = np.array([x, y], dtype=float)
        t = 0 if denom == 0 else float(np.clip(np.dot(p - start, line) / denom, 0, 1))
        distances.append(float(np.linalg.norm(p - (start + t * line))))
    if max(distances, default=0) <= epsilon:
        return [(float(path[0][1]), float(path[0][0])), (float(path[-1][1]), float(path[-1][0]))]
    index = distances.index(max(distances)) + 1
    return simplify(path[:index + 1], epsilon)[:-1] + simplify(path[index:], epsilon)


def resample(points: list[tuple[float, float]], count: int = 48) -> list[list[float]]:
    arr = np.asarray(points, dtype=float)
    if len(arr) == 1:
        return [[float(arr[0, 0]), float(arr[0, 1])] for _ in range(count)]
    lengths = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(arr, axis=0), axis=1))]
    if lengths[-1] == 0:
        return [[float(arr[0, 0]), float(arr[0, 1])] for _ in range(count)]
    result = np.column_stack((np.interp(np.linspace(0, lengths[-1], count), lengths, arr[:, 0]), np.interp(np.linspace(0, lengths[-1], count), lengths, arr[:, 1])))
    return result.tolist()


def component_paths(component: np.ndarray) -> list[list[tuple[int, int]]]:
    pixels = {tuple(p) for p in np.argwhere(component)}
    adj = {p: neighbours(p, pixels) for p in pixels}
    special = {p for p, ns in adj.items() if len(ns) != 2}
    # Collapse adjacent junction pixels into a single node.
    junctions = {p for p in special if len(adj[p]) > 2}
    groups: list[set[tuple[int, int]]] = []
    unseen = set(junctions)
    while unseen:
        seed = unseen.pop()
        group = {seed}
        queue = [seed]
        while queue:
            for q in adj[queue.pop()]:
                if q in unseen:
                    unseen.remove(q)
                    group.add(q)
                    queue.append(q)
        groups.append(group)
    nodes: list[set[tuple[int, int]]] = groups + [{p} for p in special if p not in junctions]
    node_of = {p: i for i, group in enumerate(nodes) for p in group}
    paths = []
    used: set[frozenset[tuple[int, int]]] = set()
    for group in nodes:
        for p in group:
            for q in adj[p]:
                if q in group:
                    continue
                edge = frozenset((p, q))
                if edge in used:
                    continue
                used.add(edge)
                path = [p, q]
                prev, cur = p, q
                while cur not in node_of:
                    options = [n for n in adj[cur] if n != prev]
                    if not options:
                        break
                    nxt = options[0]
                    used.add(frozenset((cur, nxt)))
                    path.append(nxt)
                    prev, cur = cur, nxt
                if len(path) > 1:
                    paths.append(path)
    # Closed skeletons have no endpoints or junction nodes.
    if not nodes:
        start = min(pixels, key=lambda p: (p[0], p[1]))
        path = [start]
        prev, cur = None, start
        while True:
            options = [n for n in adj[cur] if n != prev]
            if not options:
                break
            nxt = options[0]
            if nxt == start:
                path.append(start)
                break
            path.append(nxt)
            prev, cur = cur, nxt
        paths.append(path)
    return paths


def normalize_xy(x: float, y: float) -> list[float]:
    # Keep the renderer's source pixel coordinates. The source glyph mask and
    # traces then share an exact coordinate system for the coverage test.
    return [round(x / SIZE, 5), round(y / SIZE, 5)]


def glyph_template(letter: str, font_path: Path, is_arabic: bool) -> dict:
    mask = render_glyph(letter, font_path)
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=int))
    areas = [(int((labels == i).sum()), i) for i in range(1, count + 1)]
    areas.sort(reverse=True)
    if not areas:
        raise ValueError(f"No foreground pixels for {letter!r}")
    bodies = []
    for area, label in areas:
        component = labels == label
        skeleton = skeletonize(component)
        centerlines = component_paths(skeleton)
        if not centerlines:
            y, x = np.argwhere(skeleton)[0]
            centerlines = [[(int(y), int(x))]]
        distance = ndimage.distance_transform_edt(component)
        for path in centerlines:
            if len(path) < 2:
                # A punctuation-like dot has a one-pixel medial axis.
                y, x = path[0]
                body_path = [(y, x), (y, x)]
            else:
                body_path = path
            bodies.append((area, component, body_path, distance))
    # The largest connected glyph component is the body. Dots and detached
    # marks are deliberately placed after it, as in children's handwriting.
    def stroke_order(row):
        _, _, path, _ = row
        center_y = sum(point[0] for point in path) / len(path)
        center_x = sum(point[1] for point in path) / len(path)
        return (-row[0], center_y if not is_arabic else -center_x, center_x if not is_arabic else center_y)

    bodies.sort(key=stroke_order)
    strokes = []
    for index, (area, component, path, distance) in enumerate(bodies):
        is_mark = index > 0 and area < max(150, bodies[0][0] * 0.23)
        points = simplify(path)
        if len(points) < 2:
            points = [points[0], points[0]]
        # Arabic writing proceeds from right to left; English begins at the
        # upper/left endpoint when a centerline segment has two ends.
        start, end = points[0], points[-1]
        if is_arabic:
            reverse = (start[0] < end[0]) if abs(start[0] - end[0]) > abs(start[1] - end[1]) * 0.35 else start[1] > end[1]
        else:
            reverse = (start[1] > end[1]) if abs(start[1] - end[1]) > abs(start[0] - end[0]) * 0.35 else start[0] > end[0]
        if reverse:
            points.reverse()
        pts = [normalize_xy(x, y) for x, y in points]
        sampled = resample(pts, 48)
        radii = [float(distance[y, x]) for y, x in path]
        stroke_width = round(float(np.mean(radii) * 2 / SIZE), 5)
        strokes.append({"kind": "dot" if is_mark else "main", "width": stroke_width, "points": [[round(x, 5), round(y, 5)] for x, y in sampled]})

    # Compressed row-major 1-bit source mask permits a deterministic CI IoU
    # test without installing Python imaging dependencies in the app.
    packed = np.packbits(mask.astype(np.uint8), axis=None).tobytes()
    return {"letter": letter, "strokes": strokes, "reference_mask": base64.b64encode(zlib.compress(packed, 9)).decode("ascii"), "mask_size": SIZE}


def main() -> None:
    configurations = [
        ("ar", AR_LETTERS, FONT_DIR / "AmalTraceNaskh.ttf", True),
        ("en", EN_LETTERS, FONT_DIR / "AmalTracePrint.ttf", False),
    ]
    reference_masks = {}
    for script, letters, font, is_arabic in configurations:
        generated = {letter: glyph_template(letter, font, is_arabic) for letter in letters}
        templates = {}
        reference_masks[script] = {}
        for letter, glyph in generated.items():
            templates[letter] = {key: value for key, value in glyph.items() if key not in {"reference_mask", "mask_size"}}
            reference_masks[script][letter] = {"size": glyph["mask_size"], "mask": glyph["reference_mask"]}
        (OUT_DIR / f"{script}.json").write_text(json.dumps({"version": 2, "script": script, "templates": templates}, ensure_ascii=False, indent=2) + "\n")
        print(f"Generated {len(templates)} {script} glyphs from {font.name}")
    (OUT_DIR / "glyph-reference-masks.json").write_text(json.dumps({"version": 1, **reference_masks}, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
