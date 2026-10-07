import assert from "node:assert/strict";
import { test } from "node:test";
import { clampViewAngle, pagePocketClearance, pageSurfaceOffset, pageSurfaceRotation, pageSurfaceShift, pageTurnAmplitude, pageTurnCurl } from "./binder-scene-motion";

test("resting sheets bow gently while their horizontal edges stay anchored", () => {
  assert.equal(pageSurfaceOffset(-1.25, 0, 2.5, 3.1), 0);
  assert.equal(pageSurfaceOffset(1.25, 0, 2.5, 3.1), 0);
  assert.ok(pageSurfaceOffset(0, 0, 2.5, 3.1) > 0);
  assert.ok(pageSurfaceOffset(0, 0, 2.5, 3.1) < 0.03);
});

test("rigid card corners clear the offset paper arc at every supported pocket width", () => {
  for (const width of [1.5, 2.5, 4]) {
    for (const columns of [1, 2, 3, 4, 6]) {
      const gridWidth = width * 0.91;
      const pocketWidth = (gridWidth - gridWidth * 0.022 * (columns - 1)) / columns;
      assert.equal(pagePocketClearance(width, pocketWidth, 0, 0.094), 0);
      for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const curl = pageTurnCurl(progress, pageTurnAmplitude(width, 3.1));
        const radius = width * width / (2 * curl);
        const clearance = pagePocketClearance(width, pocketWidth, curl, 0.094);
        assert.ok(Number.isFinite(clearance) && clearance >= 0);
        assert.equal(clearance, pagePocketClearance(width, pocketWidth, -curl, 0.094));
        const cornerDistance = Math.hypot(radius - 0.099 - clearance, pocketWidth / 2);
        assert.ok(cornerDistance < radius - 0.094, "the paper cannot intersect either rigid card edge");
      }
    }
  }
});

test("wide pockets limit their bend rather than floating far above the paper", () => {
  for (const width of [1.5, 2.5, 4]) {
    for (const columns of [1, 2, 3, 4, 6]) {
      const gridWidth = width * 0.91;
      const pocketWidth = (gridWidth - gridWidth * 0.022 * (columns - 1)) / columns;
      const curl = pageTurnAmplitude(width, 3.1, pocketWidth);
      const lift = pagePocketClearance(width, pocketWidth, curl, 0.094);
      assert.ok(lift <= width * 0.04 + 1e-10, "the rigid pocket's additional lift is bounded");
      assert.ok(curl > 0, "wide pockets still visibly flex");
      if (columns >= 3) assert.equal(curl, width * 0.9, "ordinary grids keep their full bend");
    }
  }
});

test("turning curl peaks mid-turn and settles at both endpoints", () => {
  assert.equal(pageTurnCurl(0), 0);
  assert.ok(Math.abs(pageTurnCurl(1)) < 1e-10);
  assert.ok(Math.abs(pageTurnCurl(0.5) - 0.12) < 1e-10);
  assert.equal(pageTurnCurl(-1), 0);
  assert.ok(Math.abs(pageTurnCurl(2)) < 1e-10);
});

test("runtime pocket pitch constrains curl while preserving visible bend and tangent separation", () => {
  for (const width of [1.5, 2.5, 4]) for (const columns of [2, 3, 4, 6]) {
    const gap = width * 0.91 * 0.022;
    const pocketWidth = (width * 0.91 - gap * (columns - 1)) / columns;
    const pitch = pocketWidth + gap;
    const amplitude = pageTurnAmplitude(width, 3.1, pocketWidth, pitch);
    assert.ok(amplitude > width * 0.1 && amplitude <= pageTurnAmplitude(width, 3.1, pocketWidth));
    for (let step = 1; step < 100; step++) {
      const curl = pageTurnCurl(step / 100, amplitude);
      const radius = width * width / (2 * curl);
      const lift = pagePocketClearance(width, pocketWidth, curl, 0.094);
      const intersection = (radius - 0.099 - lift) * Math.tan(pitch / (2 * radius));
      assert.ok(intersection >= pocketWidth / 2 + gap * 0.12 - 1e-9);
    }
  }
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
