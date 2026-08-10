// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { defaultColourId, findColour, type FirstRunColourId } from "./firstRun";

/**
 * Making the chosen colour the creature's colour.
 *
 * The introduction asks somebody to pick a colour "to bring me to life", and
 * until now it painted a static mark and nothing else. The living creature read
 * a fixed table of seven blues, so the question was decorative -- which is worse
 * than not asking, because it is the first thing Toki ever asks for.
 *
 * **Rotated, not replaced.** The creature is not one colour. It has a tone for
 * resting, a brighter one for listening, a violet lean for thinking, and so on,
 * and those relationships are what make a glance at it informative. Overwriting
 * every state with one hex would flatten all of that into a blob that never
 * changes. So the whole family is turned by the angle between the default blue
 * and the chosen colour, and each state keeps its own saturation and lightness.
 *
 * **Hue only.** Turning saturation and lightness as well makes some choices
 * muddy and others fluorescent, because the four options do not sit at equal
 * distances from blue. Rotation alone keeps every state as vivid as it was
 * designed to be.
 *
 * Some colours are not the creature's mood at all: red means something failed,
 * amber that Toki is checking, teal that it has locked on. Those are meanings
 * rather than decoration, and rotating them would leave a green Toki reporting
 * failure in a green that looks like everything else. They are left alone.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

export function parseColour(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/u, "");

  if (!/^[0-9a-f]{6}$/iu.test(hex)) {
    return null;
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const span = max - min;

  if (span === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5 ? span / (2 - max - min) : span / (max + min);

  let hue: number;

  if (max === red) {
    hue = ((green - blue) / span + (green < blue ? 6 : 0)) / 6;
  } else if (max === green) {
    hue = ((blue - red) / span + 2) / 6;
  } else {
    hue = ((red - green) / span + 4) / 6;
  }

  return { h: hue * 360, s: saturation, l: lightness };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const grey = Math.round(l * 255);
    return { r: grey, g: grey, b: grey };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (((h % 360) + 360) % 360) / 360;

  const channel = (offset: number) => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return {
    r: Math.round(channel(1 / 3) * 255),
    g: Math.round(channel(0) * 255),
    b: Math.round(channel(-1 / 3) * 255),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const pair = (value: number) =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");

  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/**
 * How far to turn everything, for a given choice.
 *
 * Zero for blue, which is the default and the colour the creature was designed
 * in -- so somebody who skips the question, or picks the first option, gets
 * exactly what was drawn.
 */
export function hueShiftFor(colour: FirstRunColourId): number {
  const from = parseColour(findColour(defaultColourId).hex);
  const to = parseColour(findColour(colour).hex);

  if (from == null || to == null) {
    return 0;
  }

  return rgbToHsl(to).h - rgbToHsl(from).h;
}

/** Turn one colour by an angle, keeping how vivid and how light it is. */
export function rotateHue(value: string, degrees: number): string {
  const rgb = parseColour(value);

  if (rgb == null || degrees === 0) {
    return value;
  }

  const hsl = rgbToHsl(rgb);

  // A grey has no hue to turn. Rotating one would invent a colour where the
  // design deliberately had none -- the paused state, for instance.
  if (hsl.s === 0) {
    return value;
  }

  return toHex(hslToRgb({ ...hsl, h: hsl.h + degrees }));
}

/**
 * The same, for the `rgba(...)` strings the shadows are written in.
 *
 * Shadows carry the creature's colour too -- a blue creature casts a blue-black
 * shadow, and leaving them behind puts a blue halo under a green blob.
 */
export function rotateRgba(value: string, degrees: number): string {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)$/iu.exec(
    value.trim(),
  );

  if (match == null || degrees === 0) {
    return value;
  }

  const rgb = {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
  const hsl = rgbToHsl(rgb);

  if (hsl.s === 0) {
    return value;
  }

  const turned = hslToRgb({ ...hsl, h: hsl.h + degrees });
  const alpha = match[4];

  return alpha == null
    ? `rgb(${turned.r}, ${turned.g}, ${turned.b})`
    : `rgba(${turned.r}, ${turned.g}, ${turned.b}, ${alpha})`;
}

/**
 * States whose colour is a meaning, not a mood.
 *
 * Red is "that failed". Amber is "checking". Teal is "locked on". Somebody who
 * chose green still needs failure to look like failure, so these keep the
 * colours they were given.
 */
export const literalColourStates = Object.freeze(["error"] as const);

export function isLiteralColourState(state: string): boolean {
  return (literalColourStates as readonly string[]).includes(state);
}

export type ColourableVisual = {
  fillColor: string;
  shadowColor: string;
};

/**
 * Apply a choice to one state's colours.
 *
 * Returns the visual unchanged for the states that carry a meaning, and for
 * blue, where the rotation is zero.
 */
export function applyCreatureColour<T extends ColourableVisual>(
  visual: T,
  state: string,
  degrees: number,
): T {
  if (degrees === 0 || isLiteralColourState(state)) {
    return visual;
  }

  return {
    ...visual,
    fillColor: rotateHue(visual.fillColor, degrees),
    shadowColor: rotateRgba(visual.shadowColor, degrees),
  };
}
