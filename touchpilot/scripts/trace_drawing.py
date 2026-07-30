#!/usr/bin/env python3
"""Turn the scanned ink drawing into a clean mask that scales.

The source is a 346x360 scan of a drawing made by hand. An app icon renders up
to 1024 pixels, so simply enlarging the scan gives blocky, ragged edges -- a
third of the detail the icon needs, with JPEG fringing on every stroke.

What actually recovers the shape is the grey pixels along each edge. A scan is
not black-and-white: an edge that falls halfway across a pixel is recorded as a
mid grey, and that grey says *where inside the pixel* the true edge lay. Reading
those greys as coverage rather than throwing them away with a hard threshold is
what lets the curve be reconstructed above the resolution it was captured at.

The steps, in order:

  1. Read each pixel's darkness as ink coverage, on a soft ramp so the edge
     greys are kept rather than rounded to black or white.
  2. Drop specks and fill pinholes. JPEG compression leaves both around strong
     edges, and enlarging turns a stray speck into a visible blob.
  3. Enlarge the coverage map, which interpolates smoothly because it is a
     continuous signal rather than a two-colour image.
  4. Steepen the edge so the result is crisp instead of soft, without putting
     the stair-steps back.
"""

from __future__ import annotations

import functools
import pathlib
from collections import deque

from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "brand" / "source" / "toki-ring-drawing.jpg"

# Darkness at which a pixel counts as fully inked, and at which it counts as
# fully blank. Everything between is partial coverage.
INK_FULL = 90
INK_NONE = 205

# Specks and pinholes smaller than this, measured on the source, are compression
# artefacts rather than part of the drawing.
MIN_SPECK = 6
MIN_HOLE = 6


def coverage(image):
    """Ink coverage per pixel, 0.0 to 1.0, keeping the edge greys."""
    grey = image.convert("L")
    width, height = grey.size
    pixels = grey.load()
    out = [[0.0] * width for _ in range(height)]

    span = INK_NONE - INK_FULL
    for y in range(height):
        for x in range(width):
            v = pixels[x, y]
            if v <= INK_FULL:
                out[y][x] = 1.0
            elif v < INK_NONE:
                out[y][x] = (INK_NONE - v) / span
    return out, width, height


def components(mask, width, height, wanted):
    """Every connected run of `wanted` in the mask, as lists of coordinates."""
    seen = [[False] * width for _ in range(height)]
    found = []

    for sy in range(height):
        for sx in range(width):
            if seen[sy][sx] or mask[sy][sx] != wanted:
                continue

            group = []
            queue = deque([(sx, sy)])
            seen[sy][sx] = True

            while queue:
                x, y = queue.popleft()
                group.append((x, y))
                # Four-way, not eight. Diagonal linking would join a speck to
                # the drawing through a single touching corner and keep it.
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        if not seen[ny][nx] and mask[ny][nx] == wanted:
                            seen[ny][nx] = True
                            queue.append((nx, ny))

            found.append(group)

    return found


def despeckle(cover, width, height):
    """Remove compression specks, and fill the pinholes they leave behind."""
    solid = [[cover[y][x] > 0.5 for x in range(width)] for y in range(height)]

    groups = components(solid, width, height, True)
    groups.sort(key=len, reverse=True)
    removed = 0
    # The largest run is the drawing; anything tiny beyond it is noise. Size is
    # the test rather than position, so a genuine detached droplet of ink
    # survives while a two-pixel artefact does not.
    for group in groups[1:]:
        if len(group) < MIN_SPECK:
            for x, y in group:
                cover[y][x] = 0.0
            removed += 1

    filled = 0
    for group in components(solid, width, height, False):
        if len(group) < MIN_HOLE and not touches_edge(group, width, height):
            for x, y in group:
                cover[y][x] = 1.0
            filled += 1

    return removed, filled


def touches_edge(group, width, height):
    """A blank run reaching the border is the background, not a pinhole."""
    return any(
        x == 0 or y == 0 or x == width - 1 or y == height - 1 for x, y in group
    )


@functools.lru_cache(maxsize=1)
def cleaned():
    """The scan, despeckled and squared, at its own resolution.

    Cached: the clean-up walks every pixel twice over and the icon set asks for
    twenty sizes, all of which want the same starting image.
    """
    image = Image.open(SOURCE)
    cover, width, height = coverage(image)
    despeckle(cover, width, height)

    flat = bytearray(width * height)
    for y in range(height):
        row = cover[y]
        base = y * width
        for x in range(width):
            flat[base + x] = int(row[x] * 255)
    mask = Image.frombytes("L", (width, height), bytes(flat))

    # Crop to the drawing before enlarging, so none of the icon is spent on
    # blank scanner margin.
    box = mask.getbbox()
    mask = mask.crop(box)

    # Square it off by padding, never by stretching -- a hand-drawn circle
    # squashed to fit stops looking hand-drawn and starts looking wrong.
    side = max(mask.size)
    square = Image.new("L", (side, side), 0)
    square.paste(mask, ((side - mask.width) // 2, (side - mask.height) // 2))
    return square


def trace(size, contrast=4.5):
    """The drawing as a clean mask at `size`, square, ink white on black."""
    square = cleaned()
    big = square.resize((size, size), Image.LANCZOS)

    # Blur, then steepen. This is the pair that matters.
    #
    # Enlarging carries the source pixel grid with it, so the edge arrives as a
    # staircase of little square steps. Blurring smears those steps into one
    # gradient; steepening then collapses that gradient back to a hard edge --
    # but the edge it settles on runs through the middle of where the steps
    # were, which is a smooth curve rather than a flight of stairs.
    #
    # The blur is scaled to the enlargement, because the steps are the size of a
    # source pixel and that is what has to be smeared over. Steepening alone
    # sharpens the staircase; blurring alone leaves the mark soft.
    steps = size / max(square.size)
    big = big.filter(ImageFilter.GaussianBlur(steps * 0.55))

    return big.point(lambda v: max(0, min(255, int((v - 128) * contrast + 128))))


if __name__ == "__main__":
    out = ROOT / "assets" / "brand" / "traced-preview.png"
    result = trace(1024)
    canvas = Image.new("RGBA", result.size, (255, 255, 255, 255))
    canvas.paste((0, 0, 0, 255), mask=result)
    canvas.save(out)
    print(f"wrote {out.relative_to(ROOT)}")
