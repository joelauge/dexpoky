import assert from "node:assert/strict";
import { test } from "node:test";
import { clampViewAngle, pageSurfaceOffset, pageSurfaceRotation, pageSurfaceShift, pageTurnAmplitude, pageTurnCurl } from "./binder-scene-motion";

test("resting sheets bow gently while their horizontal edges stay anchored", () => {
  assert.equal(pageSurfaceOffset(-1.25, 0, 2.5, 3.1), 0);
  assert.equal(pageSurfaceOffset(1.25, 0, 2.5, 3.1), 0);
  assert.ok(pageSurfaceOffset(0, 0, 2.5, 3.1) > 0);
  assert.ok(pageSurfaceOffset(0, 0, 2.5, 3.1) < 0.03);
});

test("turning curl peaks mid-turn and settles at both endpoints", () => {
  assert.equal(pageTurnCurl(0), 0);
  assert.ok(Math.abs(pageTurnCurl(1)) < 1e-10);
  assert.ok(Math.abs(pageTurnCurl(0.5) - 0.12) < 1e-10);
  assert.equal(pageTurnCurl(-1), 0);
  assert.ok(Math.abs(pageTurnCurl(2)) < 1e-10);
});

test("curl leaves the hinge anchored and bends the outer edge", () => {
  assert.equal(pageSurfaceOffset(-1.25, 0, 2.5, 3.1, 0.12, true), 0);
  const edge = pageSurfaceOffset(1.25, 0, 2.5, 3.1, 0.12, true);
  assert.ok(edge > 0.119 && edge < 0.12);
});

test("card-surface normals stay finite and restrained for all supported dimensions", () => {
  for (const width of [1.5, 2.5, 4]) {
    for (const height of [1.8, 3.1, 5]) {
      for (const fraction of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const x = width * fraction;
        const y = height * fraction;
        const position = pageSurfaceOffset(x, y, width, height, 0.12, true);
        const rotation = pageSurfaceRotation(x, y, width, height, 0.12, true);
        assert.ok(Number.isFinite(position) && position >= 0 && position < 0.15);
        assert.ok(Number.isFinite(rotation.x) && Math.abs(rotation.x) < 0.5);
        assert.ok(Number.isFinite(rotation.y) && Math.abs(rotation.y) < 0.5);
      }
    }
  }
});

test("camera input stays within the manual orbit and parallax bounds", () => {
  assert.equal(clampViewAngle(1, 0.16), 0.16);
  assert.equal(clampViewAngle(-1, 0.16), -0.16);
  assert.equal(clampViewAngle(0.02, 0.055), 0.02);
  assert.equal(clampViewAngle(0, 0.12), 0);
});

test("flex model: hinge anchored, visible, exact at rest, finite, repeatable", () => {
  for (const [w, h] of [[1.5, 1.8], [2.5, 3.1], [4, 5]]) {
    const amp = pageTurnAmplitude(w, h);
    assert.ok(Math.abs(amp / w - 0.9) < 1e-10);
    assert.equal(pageSurfaceOffset(-w / 2, 0, w, h, amp, true), 0);
    assert.equal(pageSurfaceShift(-w / 2, w, amp, true), 0);
    assert.ok(pageSurfaceOffset(w / 2, 0, w, h, amp, true) > w * 0.65);
    assert.equal(pageSurfaceShift(0.3, w, 0, true), 0);
    const a = pageSurfaceShift(w / 4, w, amp, true);
    assert.equal(a, pageSurfaceShift(w / 4, w, amp, true));
    assert.ok(a < 0 && Number.isFinite(pageSurfaceRotation(w / 4, 0, w, h, amp, true).y));
    for (const fraction of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const x = w * fraction;
      const y = h * fraction;
      const rest = pageSurfaceOffset(x, y, w, h, 0, true);
      const frontBend = pageSurfaceOffset(x, y, w, h, amp, true) - rest;
      const backBend = pageSurfaceOffset(x, y, w, h, -amp, true) - rest;
      assert.ok(Math.abs(frontBend + backBend) < 1e-10);
      assert.equal(pageSurfaceShift(x, w, amp, true), pageSurfaceShift(x, w, -amp, true));
      const rotation = pageSurfaceRotation(x, y, w, h, amp, true);
      assert.ok(Number.isFinite(rotation.x) && Number.isFinite(rotation.y));
    }
  }
});

test("peak turn is visibly curved, folds past vertical, and preserves sheet length", () => {
  for (const [w, h] of [[1.5, 1.8], [2.5, 3.1], [4, 5]]) {
    const curl = pageTurnCurl(0.5, pageTurnAmplitude(w, h));
    const point = (s: number) => {
      const x = -w / 2 + s * w;
      return [x + pageSurfaceShift(x, w, curl, true), pageSurfaceOffset(x, 0, w, h, curl, true)];
    };
    const start = point(0);
    const middle = point(0.5);
    const end = point(1);
    const chordX = end[0] - start[0];
    const chordZ = end[1] - start[1];
    const sagitta = Math.abs(chordX * (middle[1] - start[1]) - chordZ * (middle[0] - start[0])) / Math.hypot(chordX, chordZ);
    assert.ok(sagitta > w * 0.18, "the middle visibly bows away from a rigid sheet's straight edge");
    assert.ok(pageSurfaceRotation(w / 2, 0, w, h, curl, true).y < -Math.PI / 2, "the outer edge folds past vertical");
    let length = 0;
    let previous = start;
    for (let i = 1; i <= 200; i++) {
      const next = point(i / 200);
      length += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
      previous = next;
    }
    assert.ok(Math.abs(length - w) < w * 0.01, "curl does not stretch or collapse the sheet");
  }
});
