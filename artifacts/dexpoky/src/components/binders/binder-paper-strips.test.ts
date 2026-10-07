import assert from "node:assert/strict";
import { test } from "node:test";
import { pageBackingStrip } from "./binder-paper-strips";
import { pageTurnAmplitude, pageTurnCurl } from "./binder-scene-motion";

test("curled paper facets share exact edges in both directions without overlapping patches", () => {
  for (const width of [1.5, 2.4, 4]) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      for (const fromRight of [false, true]) {
        const curl = pageTurnCurl(progress, pageTurnAmplitude(width, 3.3)) * (fromRight ? -1 : 1);
        const strips = Array.from({ length: 12 }, (_, column) =>
          pageBackingStrip(-width / 2 + column * width / 12, -width / 2 + (column + 1) * width / 12,
            width, 3.3, 0.094, curl, true, fromRight),
        );
        strips.forEach((strip, column) => {
          assert.ok(Number.isFinite(strip.rotation) && strip.length > 0);
          if (column) assert.deepEqual(strip.start, strips[column - 1].end);
          // Reconstruct the actual scaled/rotated CSS quad endpoints.
          for (const [sign, edge] of [[-1, strip.start], [1, strip.end]] as const) {
            assert.ok(Math.abs(strip.x + sign * Math.cos(strip.rotation) * strip.length / 2 - edge.x) < 1e-10);
            assert.ok(Math.abs(strip.z - sign * Math.sin(strip.rotation) * strip.length / 2 - edge.z) < 1e-10);
          }
        });
      }
    }
  }
});
