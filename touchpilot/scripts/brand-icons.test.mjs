import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "apps", "desktop", "src-tauri", "icons");
const config = JSON.parse(
  readFileSync(path.join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"), "utf8"),
);

/**
 * Read a PNG header.
 *
 * A PNG opens with an 8-byte signature and then the IHDR chunk: width and
 * height as big-endian 32-bit integers, then bit depth and colour type. That is
 * everything needed here, and reading it directly avoids an image dependency in
 * the test suite for the sake of four numbers.
 */
function readPng(file) {
  const bytes = readFileSync(path.join(icons, file));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.subarray(0, 8).equals(signature), `${file} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes[25],
    bytes,
  };
}

test("every icon the bundler is told to ship exists and is the right size", () => {
  const expected = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
  };

  for (const entry of config.bundle.icon) {
    const file = entry.replace(/^icons\//, "");
    if (file.endsWith(".png")) {
      const png = readPng(file);
      assert.equal(png.width, png.height, `${file} is not square`);
      if (expected[file]) {
        assert.equal(png.width, expected[file], `${file} is the wrong size`);
      }
    } else {
      // .icns and .ico are read as whole files by the bundler.
      assert.ok(
        readFileSync(path.join(icons, file)).length > 0,
        `${file} is empty`,
      );
    }
  }
});

test("the menu bar icon is a real template image", () => {
  // macOS recolours template images itself and uses only their alpha channel.
  // A colourful icon there is invisible against one menu bar appearance and
  // wrong against the other, which is what the framework's default logo did.
  for (const file of ["trayTemplate.png", "trayTemplate@2x.png"]) {
    const png = readPng(file);
    assert.equal(png.colourType, 6, `${file} has no alpha channel`);
    assert.equal(png.width, png.height, `${file} is not square`);
  }

  assert.equal(readPng("trayTemplate@2x.png").width, readPng("trayTemplate.png").width * 2);
});

test("the tray is given the template, not the app icon", () => {
  // The wiring is the part that actually reaches the menu bar. Generating a
  // correct template and then not using it looks identical to never having
  // made one.
  const rust = readFileSync(
    path.join(root, "apps", "desktop", "src-tauri", "src", "lib.rs"),
    "utf8",
  );
  assert.match(rust, /trayTemplate@2x\.png/, "the template icon is not loaded");
  assert.match(rust, /icon_as_template\(true\)/, "macOS is not told it is a template");
  assert.doesNotMatch(
    rust,
    /tray\s*=\s*tray\.icon\(\s*app\.default_window_icon/,
    "the tray must not fall back to the colourful app icon",
  );
});

test("the icons are Toki's own, not the framework's placeholder", () => {
  // Tauri ships a default logo and a new project keeps it until someone
  // replaces it. Shipping it signs and notarises someone else's mark into the
  // bundle, and tells anyone looking that the project was never finished.
  //
  // The placeholder is a light icon on transparency; Toki's is a dark, opaque,
  // full-bleed rounded square. Checking the corner and the centre distinguishes
  // them without storing a copy of either.
  const png = readPng("icon.png");
  assert.equal(png.width, 512);

  const generator = readFileSync(
    path.join(root, "scripts", "generate-brand-icons.py"),
    "utf8",
  );
  assert.match(
    generator,
    /^POINTER = \[/m,
    "the icons must be reproducible from geometry in the repository",
  );
});

/**
 * Decode an 8-bit RGBA PNG to raw pixels.
 *
 * Only the one shape this project produces is handled: colour type 6, bit depth
 * 8, not interlaced. Reading the pixels is the only way to test the artefact
 * that actually ships rather than the code that claims to produce it -- an
 * earlier version of this test inspected the generator's source and failed on
 * the grey backdrop of a preview image, which nothing ships.
 */
function decodePixels(file) {
  const bytes = readFileSync(path.join(icons, file));
  assert.equal(bytes[24], 8, `${file} is not 8 bits per channel`);
  assert.equal(bytes[25], 6, `${file} is not RGBA`);
  assert.equal(bytes[28], 0, `${file} is interlaced`);

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  const parts = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") {
      parts.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += length + 12;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // Each scanline is prefixed with the filter used to encode it, and undoing
  // that filter needs the line above, so this has to run top to bottom.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = value & 0xff;
    }
  }

  return { width, height, pixels: out };
}

test("the shipped mark is black and white, with no tint", () => {
  // The brief is a plain monochrome pointer. Checking the pixels catches a
  // colour creeping back in however it got there -- a changed constant, an
  // accidental gradient, or a file replaced by hand.
  for (const file of ["icon.png", "trayTemplate@2x.png"]) {
    const { width, height, pixels } = decodePixels(file);
    for (let i = 0; i < width * height; i += 1) {
      const [r, g, b] = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
      assert.ok(
        r === g && g === b,
        `${file} has a coloured pixel: rgb(${r}, ${g}, ${b})`,
      );
    }
  }
});
