#!/usr/bin/env python3
"""Draw Toki's icons.

The mark is an inked circle: a brush-drawn ring, open at one end, with a spray
of ink where the brush lands. It stands for the puck Toki paints beside the
cursor, which is the thing people actually see the app do. `MARK` switches it
back to the pointer, which is still drawn from the geometry further down.

Black and white only -- no gradient, no glow, no colour.

Everything is generated from the numbers in this file rather than traced from a
reference image, for a plain practical reason: an app icon is rendered up to
1024 pixels, and a small picture enlarged to that size is a blurry mess.
Redrawing means every size is sharp and the shape can be nudged by changing a
number here.

Two icons come out of this, because they have different jobs:

* The app icon -- Finder, the installer. The mark on a mid-tone rounded square.
* The menu bar icon -- the shape alone, on transparency. macOS recolours these
  to suit a light or dark menu bar, and only a solid shape with an alpha channel
  survives that. The framework's default colour logo did not.

Detail is dropped as the icon gets smaller, which is what icon sets have always
done. See the floors further down for where each part goes.

Run: python3 scripts/generate-brand-icons.py
"""

from __future__ import annotations

import math
import pathlib
import random
import subprocess
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import trace_drawing  # noqa: E402  (path has to be set before this import)

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "apps" / "desktop" / "src-tauri" / "icons"
BRAND = ROOT / "assets" / "brand"

# Which mark is used.
#
#   "drawing"  the scanned ink circle, cleaned up and re-rendered sharp. This is
#              the real mark -- it is the author's own drawing, so it carries a
#              hand nothing generated can imitate.
#   "ring"     a circle generated from sines. Kept as the fallback if the scan
#              is ever unavailable.
#   "pointer"  the cursor drawn from POINTER below.
MARK = "drawing"

# How much of the tile the drawing fills. Lower than the generated marks use:
# the splatter throws ink well past the circle, so fitting the *circle* to the
# tile would push the splatter off the edge.
DRAWING_FILL = 0.80

# Where the inked stroke starts and stops, leaving the open gap a drawn circle
# has. The splatter lands at the start, where the brush touches down.
RING_START = math.radians(-52)
RING_SWEEP = math.radians(322)

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)

# The tile sits between the two extremes on purpose.
#
# macOS 26 lets someone set an icon appearance -- Default, Dark, Tinted -- and
# for an app shipping a plain .icns the system generates the other looks itself,
# darkening the tile and lightening the glyph. A white tile is inverted outright
# under Dark, which is why this icon appeared as a dark square with a pale
# cursor on a Mac set that way.
#
# A mid tone has less far to travel in either direction, so neither appearance
# blows it out. Greyscale rather than tinted: the brief is black and white, and
# a test checks every shipped pixel for it.
TILE = (138, 138, 138, 255)

# Everything is drawn this many times larger and then reduced. It is the
# cheapest antialiasing there is, and small icons live or die on their edges.
SUPERSAMPLE = 8

# The pointer, in a unit square: tip at the top, tail hanging below and right.
#
# Deliberately fatter than a real mouse cursor. The corners are rounded off by
# stroking this outline with a thick round-jointed pen (see `pointer_mask`),
# which eats into the silhouette -- so the underlying polygon has to be chunky
# to survive it.
POINTER = [
    (0.29, 0.01),  # tip
    (0.20, 0.35),  # holds the leading edge straight instead of letting it bow
    (0.17, 0.62),  # heel
    (0.41, 0.57),  # inner notch, where the tail begins
    (0.51, 0.87),  # tail, outer corner
    (0.67, 0.81),  # tail, inner corner
    (0.56, 0.55),  # where the tail rejoins the body
    (0.85, 0.49),  # trailing shoulder
    (0.65, 0.23),  # bows the trailing edge outward
]

# The edge the two inner marks are measured against: tip to heel.
#
# Stated here rather than read out of POINTER by position. Taking "the first two
# entries" broke the moment a shaping point was added between them -- the marks
# then measured a stub a hundredth of the length and collapsed into the outline.
MARK_EDGE = ((0.29, 0.01), (0.17, 0.62))

# How much of the shape's width is spent on rounding. This is what gives it the
# soft, drawn look rather than a sharp geometric arrow.
ROUNDING = 0.185

# Stroke weight of the line art, as a fraction of the mark's span. Heavy enough
# to hold together when the icon is small, light enough to still read as a drawn
# line rather than a fat band.
OUTLINE_WEIGHT = 0.072

# The two white marks cut into the body.
#
# They are what make a flat silhouette read as a solid object. Three things do
# that work, and all three matter:
#
#   * They run parallel to the leading edge and sit just inside it, so they read
#     as light catching a raised edge rather than as decoration dropped on top.
#   * They taper. A highlight on a curved surface is brightest where the surface
#     turns most and fades away along it; two even-width dashes read as slots cut
#     through the shape instead.
#   * The upper one is longer. A single light source up and to the left catches
#     more of the surface nearest the tip, and matching lengths would flatten it
#     straight back out.
#
# Positions are fractions along the leading edge, so they stay put at any size
# rather than drifting as the shape is rescaled.
SLITS = [
    {"along": 0.27, "into": 0.080, "length": 0.088, "head": 0.046, "tail": 0.030},
    {"along": 0.50, "into": 0.074, "length": 0.062, "head": 0.038, "tail": 0.026},
]


def place(points, size, scale, offset):
    """Map the unit-square pointer onto a canvas."""
    ox, oy = offset
    return [(ox + x * scale * size, oy + y * scale * size) for x, y in points]


def smooth_closed(points, steps=28):
    """Round a closed path off into a curve that passes through every point.

    A polygon cannot bow. Adding a vertex to bulge an edge outward just puts a
    visible kink there instead, which is what the trailing edge looked like
    before this. A Catmull-Rom spline still passes through each point but
    arrives and leaves along the direction of its neighbours, so the edges bow
    and the whole mark reads as drawn rather than plotted.

    A point repeated in the list pulls the curve tighter around it -- that is
    how the tip stays a point instead of melting into a blunt nose.
    """
    # Duplicated points would make a segment of zero length, and every step
    # below divides by that length.
    unique = [p for i, p in enumerate(points) if p != points[i - 1]]
    n = len(unique)
    curve = []

    def knot(a, b, previous):
        # Centripetal spacing: the square root of the distance between points.
        # Plain uniform spacing overshoots wherever points sit close together
        # and the direction turns hard -- which is exactly the tail, and it
        # produced a visible squiggle there instead of a lobe.
        distance = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        return previous + max(distance, 1e-9) ** 0.5

    for i in range(n):
        p0, p1 = unique[(i - 1) % n], unique[i]
        p2, p3 = unique[(i + 1) % n], unique[(i + 2) % n]

        t0 = 0.0
        t1 = knot(p0, p1, t0)
        t2 = knot(p1, p2, t1)
        t3 = knot(p2, p3, t2)

        for step in range(steps):
            t = t1 + (t2 - t1) * step / steps
            a1 = mix(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0))
            a2 = mix(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1))
            a3 = mix(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2))
            b1 = mix(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0))
            b2 = mix(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1))
            curve.append(mix(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)))

    return curve


def mix(a, b, wa, wb):
    """Weighted blend of two points."""
    return (a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb)


def rounded_square(size, radius_ratio=0.225, fill=WHITE):
    """The macOS app-icon silhouette: a square with generously rounded corners."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=int(size * radius_ratio),
        fill=fill,
    )
    return image


def pointer_mask(size, scale, offset, hollow=True, marks=True, grow=0.0):
    """A white-on-black stencil of the pointer.

    Two styles come out of the same path. `hollow` strokes the outline and
    leaves the middle empty -- line art, the drawn look. Solid fills it in, and
    is what the very small sizes fall back to, because a hollow middle thinner
    than a pixel turns the whole mark into a grey smudge.

    Corners are rounded by stroking with a round-jointed pen rather than by
    placing a curve at each vertex, which keeps the rounding proportional at
    every size for free.
    """
    s = size
    mask = Image.new("L", (s, s), 0)
    draw = ImageDraw.Draw(mask)
    points = place(POINTER, s, scale, offset)

    curve = smooth_closed(points)

    if hollow:
        stroke = max(1, round(s * scale * OUTLINE_WEIGHT))
        draw.line(curve + [curve[0]], fill=255, width=stroke, joint="curve")
        # Discs at both ends close the seam where the path meets itself.
        for x, y in (curve[0], curve[-1]):
            r = stroke / 2
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
    else:
        draw.polygon(curve, fill=255)
        if grow > 0:
            # Widen the filled shape by a stated amount. The body beneath the
            # outline is grown by exactly the stroke width, so its edge lands
            # where the stroke's outer edge does -- any other value shows as a
            # pale fringe around the mark or leaves a gap inside it.
            pen = max(1, round(s * scale * grow))
            draw.line(curve + [curve[0]], fill=255, width=pen, joint="curve")

    if marks:
        # Drawn *into* the mask, not cut out of it. In line art the middle is
        # already empty, so the two marks have to be strokes of their own --
        # subtracting them, as the solid version did, would remove nothing.
        draw_inner_marks(draw, place(MARK_EDGE, s, scale, offset), s, scale, add=hollow)

    return mask


def draw_inner_marks(draw, points, size, scale, add=True):
    """The two short marks inside the body.

    `add` paints them; otherwise they are punched out. Which one is right
    depends on whether the body around them is ink or empty.
    """
    ink = 255 if add else 0
    tip, heel = points
    edge = (heel[0] - tip[0], heel[1] - tip[1])
    length = (edge[0] ** 2 + edge[1] ** 2) ** 0.5
    unit = (edge[0] / length, edge[1] / length)
    # Perpendicular pointing *into* the body. The leading edge runs down and to
    # the left, so the body lies to its right; the opposite sign puts the slits
    # outside the silhouette where they cut nothing at all.
    perp = (unit[1], -unit[0])

    span = size * scale

    for slit in SLITS:
        cx = tip[0] + unit[0] * length * slit["along"] + perp[0] * span * slit["into"]
        cy = tip[1] + unit[1] * length * slit["along"] + perp[1] * span * slit["into"]
        half = span * slit["length"] / 2

        # The end nearer the tip is the wide one, because that is where the
        # light would strike first.
        head = (cx - unit[0] * half, cy - unit[1] * half)
        tail = (cx + unit[0] * half, cy + unit[1] * half)
        head_r = span * slit["head"] / 2
        tail_r = span * slit["tail"] / 2

        # A four-sided sliver rather than a stroke: a stroke is one width all
        # the way along, and the taper is the whole point.
        draw.polygon(
            [
                (head[0] + perp[0] * head_r, head[1] + perp[1] * head_r),
                (tail[0] + perp[0] * tail_r, tail[1] + perp[1] * tail_r),
                (tail[0] - perp[0] * tail_r, tail[1] - perp[1] * tail_r),
                (head[0] - perp[0] * head_r, head[1] - perp[1] * head_r),
            ],
            fill=ink,
        )
        # Round both ends off, so the mark reads as a soft glint rather than a
        # cut with square corners.
        for (px, py), r in ((head, head_r), (tail, tail_r)):
            draw.ellipse([px - r, py - r, px + r, py + r], fill=ink)


def drawing_mask(size, fill_fraction):
    """The scanned drawing, cleaned and fitted to the canvas.

    Rendered at the size it will occupy and then placed, rather than rendered
    large and shrunk: the clean-up sharpens the edge for a particular output
    resolution, and doing it at the wrong one throws that away.
    """
    inner = max(1, int(size * fill_fraction))
    mark = trace_drawing.trace(inner)

    mask = Image.new("L", (size, size), 0)
    offset = (size - inner) // 2
    mask.paste(mark, (offset, offset))
    return mask


def ring_mask(size, splatter=True, fill_fraction=0.66):
    """An inked circle: uneven radius, uneven weight, one open end.

    Drawn rather than traced. A perfect circle reads as clip art; what makes an
    inked one look inked is that the radius wanders slightly and the stroke is
    heavier where the brush pressed and thinner where it lifted. Two sine terms
    of different frequency give the wander, and a third the pressure.

    It suits Toki better than a pointer does: the app draws a round puck beside
    the cursor, so a circle is the thing people actually see on screen.
    """
    s = size
    mask = Image.new("L", (s, s), 0)
    draw = ImageDraw.Draw(mask)

    cx = cy = s / 2
    radius = s * fill_fraction * 0.44
    weight = s * fill_fraction * 0.124

    outer, inner = [], []
    steps = 480
    for i in range(steps + 1):
        t = i / steps
        angle = RING_START + RING_SWEEP * t

        # Several frequencies rather than two, so the edge wobbles the way a
        # hand does instead of swelling smoothly.
        wander = (
            1
            + 0.030 * math.sin(3 * angle + 0.6)
            + 0.016 * math.sin(7 * angle + 1.9)
            + 0.010 * math.sin(13 * angle)
        )
        r = radius * wander

        # Nearly even weight, wobbling a little.
        #
        # The first version swung between 45% and 100% and tapered to almost
        # nothing at both ends, which turned the ring into a crescent -- a thick
        # arc fading to a point, nothing like an inked circle. A drawn ring is
        # mostly one thickness; the variation is a tremor, not a swell.
        pressure = 0.86 + 0.14 * math.sin(angle * 2 + 1.1)
        pressure += 0.06 * math.sin(angle * 9 + 0.4)

        # Only the last fraction of the stroke thins, where the brush lifts.
        ends = min(t / 0.05, (1 - t) / 0.10, 1.0)
        w = weight * pressure * max(0.55, ends)

        outer.append(
            (cx + math.cos(angle) * (r + w / 2), cy + math.sin(angle) * (r + w / 2))
        )
        inner.append(
            (cx + math.cos(angle) * (r - w / 2), cy + math.sin(angle) * (r - w / 2))
        )

    # One closed shape: out along the outer edge and back along the inner.
    draw.polygon(outer + inner[::-1], fill=255)

    if splatter:
        draw_splatter(draw, cx, cy, radius, weight)

    return mask


def draw_splatter(draw, cx, cy, radius, weight):
    """The spray thrown off where the brush lands.

    Seeded, so the same specks land in the same places on every run. Unseeded
    randomness would mean the 32px icon and the 512px one were speckled
    differently, and an icon set has to be one drawing at several sizes.
    """
    rng = random.Random(11)

    # Spray leaves the brush along the direction it was travelling, fanned a
    # little. Firing every speck from one point at every angle makes a starburst
    # -- which is what this looked like first: a crown stuck on the ring rather
    # than ink coming off it.
    outward = RING_START - math.pi / 2.4

    for _ in range(12):
        # Start each speck somewhere along the last stretch of the stroke, not
        # all from the same spot.
        along = RING_START + rng.uniform(-0.16, 0.10)
        ax = cx + math.cos(along) * radius * rng.uniform(0.97, 1.03)
        ay = cy + math.sin(along) * radius * rng.uniform(0.97, 1.03)

        angle = outward + rng.uniform(-0.55, 0.55)
        length = weight * rng.uniform(0.5, 1.9)
        width = weight * rng.uniform(0.10, 0.26)
        ex, ey = ax + math.cos(angle) * length, ay + math.sin(angle) * length
        px, py = -math.sin(angle) * width / 2, math.cos(angle) * width / 2
        draw.polygon([(ax + px, ay + py), (ex, ey), (ax - px, ay - py)], fill=255)

    for _ in range(5):
        angle = outward + rng.uniform(-0.7, 0.7)
        distance = weight * rng.uniform(1.0, 2.1)
        r = weight * rng.uniform(0.09, 0.19)
        ax = cx + math.cos(RING_START) * radius
        ay = cy + math.sin(RING_START) * radius
        dx, dy = ax + math.cos(angle) * distance, ay + math.sin(angle) * distance
        draw.ellipse([dx - r, dy - r, dx + r, dy + r], fill=255)


def layout(size, fill_fraction):
    """Work out the scale and offset that centre the pointer and fill the tile.

    Both halves matter. The scale has to account for the rounding pen, which
    fattens the shape beyond the polygon it is drawn from, or the mark overflows
    its tile. The offset has to use the full bounding box -- an earlier version
    measured only the far edges and ignored where the shape started, which sat
    it visibly down and to the right of centre.
    """
    xs = [x for x, _ in POINTER]
    ys = [y for _, y in POINTER]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)

    extent = max(max_x - min_x, max_y - min_y) + ROUNDING
    scale = fill_fraction / extent

    offset = (
        size / 2 - (min_x + max_x) / 2 * scale * size,
        size / 2 - (min_y + max_y) / 2 * scale * size,
    )
    return scale, offset


# Below these, detail stops being detail and becomes noise. Icon sets have
# always simplified at small sizes rather than shrinking one drawing down
# forever; this is where that happens.
#
# The hollow middle goes first -- at small sizes it closes up into a grey blur,
# so the mark falls back to a solid silhouette, which stays legible. The two
# inner marks go shortly after.
OUTLINE_FLOOR = 40
MARKS_FLOOR = 32

# The splatter is the first thing to go. Below this it stops looking like ink
# thrown off a brush and starts looking like the icon has been smudged -- which
# is worse than not having it, because a viewer reads it as damage rather than
# as detail.
SPLATTER_FLOOR = 48


def pointer_app_mark(size, canvas, s):
    """The pointer, kept so the two marks can be compared without rewriting."""
    scale, offset = layout(s, 0.66)
    # A white body under a black outline -- what a real pointer on screen is,
    # and the reason it can be seen against anything.
    canvas.paste(
        WHITE,
        mask=pointer_mask(
            s, scale, offset, hollow=False, marks=False, grow=OUTLINE_WEIGHT
        ),
    )
    canvas.paste(
        BLACK,
        mask=pointer_mask(s, scale, offset, hollow=True, marks=size >= MARKS_FLOOR),
    )


def app_icon(size):
    """The Finder icon: the mark on a mid-tone rounded square."""
    s = size * SUPERSAMPLE
    canvas = rounded_square(s, fill=TILE)

    if MARK == "drawing":
        canvas.paste(BLACK, mask=drawing_mask(s, DRAWING_FILL))
    elif MARK == "ring":
        canvas.paste(BLACK, mask=ring_mask(s, splatter=size >= SPLATTER_FLOOR))
    else:
        pointer_app_mark(size, canvas, s)

    return canvas.resize((size, size), Image.LANCZOS)


def tray_icon(size):
    """The menu bar icon: the mark alone, on transparency.

    No tile and no colour. macOS recolours template images to suit a light or
    dark menu bar, so only the shape survives -- which is why the splatter is
    dropped here at every size. Specks that small read as dirt on the menu bar
    rather than as ink.
    """
    s = size * SUPERSAMPLE
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    if MARK == "drawing":
        image.paste(BLACK, mask=drawing_mask(s, 0.96))
    elif MARK == "ring":
        image.paste(BLACK, mask=ring_mask(s, splatter=False, fill_fraction=0.94))
    else:
        scale, offset = layout(s, 0.92)
        # Filled to the path and no further. Growing it closed the notch between
        # body and tail, and without that notch it stops reading as a pointer.
        image.paste(
            BLACK,
            mask=pointer_mask(s, scale, offset, hollow=False, marks=False, grow=0.0),
        )

    return image.resize((size, size), Image.LANCZOS)


def write_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}")


def build_icns():
    """Package the sizes macOS asks for into a single .icns."""
    iconset = ICONS / "icon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)

    for base in (16, 32, 128, 256, 512):
        app_icon(base).save(iconset / f"icon_{base}x{base}.png")
        app_icon(base * 2).save(iconset / f"icon_{base}x{base}@2x.png")

    result = subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(ICONS / "icon.icns")],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  iconutil failed: {result.stderr.strip()}", file=sys.stderr)
        return False

    for leftover in iconset.iterdir():
        leftover.unlink()
    iconset.rmdir()
    print(f"  {(ICONS / 'icon.icns').relative_to(ROOT)}")
    return True


def contact_sheet(path):
    """The sizes it will really be seen at, side by side.

    An icon only ever admired at 512 pixels is not finished. This is what makes
    it obvious when detail has collapsed into a smudge.
    """
    sizes = [16, 24, 32, 48, 64, 128]
    pad = 16
    width = sum(sizes) + pad * (len(sizes) + 1)
    height = max(sizes) * 2 + pad * 4 + 40

    sheet = Image.new("RGBA", (width, height), (228, 228, 232, 255))
    draw = ImageDraw.Draw(sheet)

    # Menu bar row on a dark strip, since that is where it is really seen.
    bar_top = pad * 2 + max(sizes)
    draw.rectangle([0, bar_top, width, height], fill=(32, 32, 34, 255))

    x = pad
    for size in sizes:
        sheet.paste(app_icon(size), (x, pad + (max(sizes) - size) // 2))
        draw.text((x, pad + max(sizes) + 6), f"{size}px", fill=(60, 60, 66, 255))

        # The template icon, shown as macOS renders it on a dark menu bar.
        tray = tray_icon(size)
        white = Image.new("RGBA", tray.size, (255, 255, 255, 0))
        white.paste(WHITE, mask=tray.getchannel("A"))
        sheet.paste(white, (x, bar_top + pad + (max(sizes) - size) // 2), white)
        x += size + pad

    sheet.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)}  (legibility check)")


def main():
    print("App icon:")
    for name, size in [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 512),
    ]:
        write_png(app_icon(size), ICONS / name)

    # Windows tiles, kept in step so the platforms cannot drift apart.
    for name, size in [
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ]:
        write_png(app_icon(size), ICONS / name)

    app_icon(256).save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  {(ICONS / 'icon.ico').relative_to(ROOT)}")

    build_icns()

    print("Menu bar icon:")
    write_png(tray_icon(22), ICONS / "trayTemplate.png")
    write_png(tray_icon(44), ICONS / "trayTemplate@2x.png")

    # Google's OAuth consent screen asks for 120x120. Generated with the tile
    # rather than on transparency: that screen is dark, and a dark mark on
    # nothing would vanish into it.
    write_png(app_icon(120), BRAND / "google-consent-logo-120.png")

    print("Reference:")
    write_png(app_icon(1024), BRAND / "toki-mark-1024.png")
    write_png(tray_icon(512), BRAND / "toki-mark-silhouette.png")
    contact_sheet(BRAND / "toki-mark-sizes.png")


if __name__ == "__main__":
    main()
