import assert from "node:assert/strict";
import { test } from "node:test";
import { binderPixelRatio } from "./binder-render-size";

test("normal, fullscreen and high-DPI buffers remain within GPU dimensions and pixel budget", () => {
  for (const [w, h] of [[900, 570], [1920, 1080], [3840, 2160], [7680, 4320]]) {
    for (const dpr of [1, 1.5, 2, 3]) for (const limit of [4096, 8192, 16384]) {
      const ratio = binderPixelRatio(w, h, dpr, limit);
      assert.ok(ratio > 0 && ratio <= dpr);
      assert.ok(w * ratio <= limit && h * ratio <= limit);
      assert.ok(w * h * ratio * ratio <= 4_000_000 + 1e-6);
    }
  }
  assert.equal(binderPixelRatio(900, 570, 1, 4096), 1);
  assert.equal(binderPixelRatio(900, 570, 2, 4096), 1.5);
});
