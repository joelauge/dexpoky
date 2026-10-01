import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cardPhotoCrop } from "./card-photo-crop.js";

describe("card photo guide cropping", () => {
  it("captures only the guide when the preview and camera aspect ratios match", () => {
    assert.deepEqual(cardPhotoCrop(
      { width: 1600, height: 900 }, { width: 800, height: 450 },
      { x: 200, y: 70, width: 250, height: 350 },
    ), { x: 400, y: 140, width: 500, height: 700 });
  });

  it("accounts for landscape camera pixels hidden by a portrait object-cover preview", () => {
    const crop = cardPhotoCrop(
      { width: 1600, height: 900 }, { width: 400, height: 700 },
      { x: 100, y: 210, width: 200, height: 280 },
    );
    assert.ok(Math.abs(crop.x - 671.428571) < 0.001);
    assert.ok(Math.abs(crop.y - 270) < 0.001);
    assert.ok(Math.abs(crop.width - 257.142857) < 0.001);
    assert.ok(Math.abs(crop.height - 360) < 0.001);
  });

  it("accounts for portrait camera pixels hidden in a landscape preview", () => {
    const crop = cardPhotoCrop(
      { width: 900, height: 1600 }, { width: 1000, height: 400 },
      { x: 430, y: 102, width: 140, height: 196 },
    );
    assert.ok(Math.abs(crop.x - 387) < 0.001);
    assert.ok(Math.abs(crop.y - 711.8) < 0.001);
    assert.ok(Math.abs(crop.width - 126) < 0.001);
    assert.ok(Math.abs(crop.height - 176.4) < 0.001);
  });

  it("fails explicitly for an invalid preview or a guide outside the preview", () => {
    const source = { width: 1280, height: 720 };
    assert.throws(() => cardPhotoCrop(source, { width: 0, height: 500 },
      { x: 0, y: 0, width: 100, height: 140 }));
    assert.throws(() => cardPhotoCrop(source, { width: 400, height: 500 },
      { x: 350, y: 0, width: 100, height: 140 }));
    assert.throws(() => cardPhotoCrop(source, { width: 400, height: 500 },
      { x: Number.NaN, y: 0, width: 100, height: 140 }));
  });
});