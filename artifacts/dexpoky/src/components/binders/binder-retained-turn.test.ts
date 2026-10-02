import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BinderPage } from "@workspace/api-client-react";
import { addPage, makeRetainedPageTurn } from "./binder-scene-geometry";
import { pageTurnPlan } from "./binder-page-window";

test("forward and backward turns use the same sheet faces, with the correct underlying pages", () => {
  assert.deepEqual(pageTurnPlan(8, 0, 2), { front: 1, back: 2, backwards: false, stationary: 0, revealed: 3 });
  assert.deepEqual(pageTurnPlan(8, 2, 0), { front: 1, back: 2, backwards: true, stationary: 3, revealed: 0 });
  assert.equal(pageTurnPlan(8, 0, 4), null);
  assert.equal(pageTurnPlan(2, 0, 2), null);
  assert.equal(pageTurnPlan(8, 1, 3), null);
  assert.equal(pageTurnPlan(5, 2, 4)?.back, 4);
});

// CSS3DObject only needs an element's styles, attributes and removal here.
// Test real Three scene transforms without requiring a GPU or a browser.
class Host {
  ownerDocument = { defaultView: { Element: Host } };
  style: Record<string, string> = {};
  className = "";
  parentNode: Host | null = null;
  children: Host[] = [];
  setAttribute() {}
  appendChild(child: Host) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: Host) {
    this.children = this.children.filter((entry) => entry !== child);
    child.parentNode = null;
    return child;
  }
  remove() { this.parentNode?.removeChild(this); }
}

test("cached artwork hosts survive both turn directions and land at the exact resting transforms", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new Host() } as unknown as Document;
  try {
    const scene = new THREE.Scene();
    const page = (id: string, widthMm = 250): BinderPage => ({
      id, rows: 3, columns: 3, widthMm, heightMm: 310, slots: [],
    });
    const front = addPage(scene, page("front"), 2, 1.61);
    const back = addPage(scene, page("back", 310), 3, -1.61);
    const faces = [front, back];
    const hosts = faces.map((face) => face.portal.pockets.map(({ host }) => host));
    const artwork = hosts.map((pockets) => pockets.map((host) => {
      const image = new Host();
      (host as unknown as Host).appendChild(image);
      return image;
    }));
    scene.updateMatrixWorld(true);
    const resting = faces.map((face) => face.group.children.map((child) => child.matrixWorld.clone()));
    const assertResting = (faceIndex: number) => {
      scene.updateMatrixWorld(true);
      faces[faceIndex].group.children.forEach((child, index) => {
        child.matrixWorld.elements.forEach((value, component) => {
          assert.ok(Math.abs(value - resting[faceIndex][index].elements[component]) < 1e-10);
        });
      });
    };
    for (const backwards of [false, true, false, true]) {
      const turn = makeRetainedPageTurn(scene, front, back);
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        turn.pivot.rotation.y = backwards ? -Math.PI * (1 - progress) : -Math.PI * progress;
        turn.updateCurl(progress);
        scene.updateMatrixWorld(true);
        faces.forEach((face, faceIndex) => {
          face.portal.pockets.forEach(({ host }, slot) => {
            assert.equal(host, hosts[faceIndex][slot]);
            assert.equal((host as unknown as Host).children[0], artwork[faceIndex][slot]);
          });
        });
        if (progress === 0) assertResting(backwards ? 1 : 0);
        if (progress === 1) assertResting(backwards ? 0 : 1);
      }
      turn.dispose();
      turn.dispose(); // Interrupted/completed cleanup is idempotent.
      assertResting(0);
      assertResting(1);
      assert.equal(front.group.parent, scene);
      assert.equal(back.group.parent, scene);
    }
    front.dispose();
    back.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.document = originalDocument;
  }
});