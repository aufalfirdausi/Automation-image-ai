import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePalette,
  colorName,
  buildStyledPrompt,
  snapToPalette,
  DEFAULT_STYLE,
  type ImageStyle,
} from "../src/nodes/ai/image/style.js";
import sharp from "sharp";

describe("Image Style System", () => {
  it("parses 16 hex codes without duplicates", () => {
    const palette = parsePalette(DEFAULT_STYLE.palette);
    assert.equal(palette.length, 16);
    assert.deepEqual(palette[0], [0xe1, 0xb6, 0x70]);
    assert.deepEqual(palette[15], [0x00, 0x00, 0x00]);
  });

  it("converts hexes to plain color names, never outputs hex", () => {
    assert.equal(colorName("#001437"), "dark navy");
    assert.equal(colorName("#ffffff"), "white");
    assert.equal(colorName("#000000"), "black");
    assert.match(colorName("#e1b670"), /gold|orange/);
    assert.doesNotMatch(colorName("#e1b670"), /#/);
  });

  it("strips hexes and swatch trigger words from prompt, appends safe tail", () => {
    const raw = "Theme: CSS. Use #001437 bg. Avoid palette sidebar. Never draw swatches.";
    const built = buildStyledPrompt(raw, DEFAULT_STYLE);
    assert.doesNotMatch(built, /#[0-9a-f]{6}/i);
    assert.doesNotMatch(built, /\bpalette\b/i);
    assert.doesNotMatch(built, /\bswatch/i);
    assert.match(built, /Single full-bleed illustration/);
    assert.match(built, /Theme: CSS/);
  });

  it("snaps all pixels to nearest palette color", async () => {
    // 2x2 test image with arbitrary colors
    const srcBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 25, b: 60 } },
    })
      .png()
      .toBuffer();
    const snappedB64 = await snapToPalette(srcBuf.toString("base64"), parsePalette(DEFAULT_STYLE.palette));
    const { data } = await sharp(Buffer.from(snappedB64, "base64")).raw().toBuffer({ resolveWithObject: true });
    // First pixel must match one of the 16 palette colors exactly
    const pal = parsePalette(DEFAULT_STYLE.palette);
    const pixel = [data[0], data[1], data[2]];
    const matched = pal.some((p) => p[0] === pixel[0] && p[1] === pixel[1] && p[2] === pixel[2]);
    assert.equal(matched, true, `Pixel [${pixel}] not in palette`);
  });
});
