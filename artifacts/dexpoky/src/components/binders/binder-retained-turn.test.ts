import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BinderPage } from "@workspace/api-client-react";
import { addPage, makeRetainedPageTurn } from "./binder-scene-geometry";
import { pageTurnPlan } from "./binder-page-window";
import { pagePocketClearance, pageSurfaceOffset, pageSurfaceShift } from "./binder-scene-motion";
import { updateBinderCssFacing } from "./binder-scene-facing";

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

test("flexed sheet vertices mirror across faces, do not drift, and restore exactly", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new Host() } as unknown as Document;
  const scene = new THREE.Scene();
  const page = (id: string): BinderPage => ({
    id, rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots: [],
  });
  const front = addPage(scene, page("curl-front"), 2, 1.61);
  const back = addPage(scene, page("curl-back"), 3, -1.61);
  try {
    const sheet = (face: ReturnType<typeof addPage>) => {
      const mesh = face.group.children.find((child) =>
        child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
      ) as THREE.Mesh<THREE.PlaneGeometry>;
      assert.ok(mesh, "retained page has a sheet mesh");
      return mesh.geometry.attributes.position;
    };
    const positions = [sheet(front), sheet(back)];
    const resting = positions.map((position) => Array.from(position.array));
    const turn = makeRetainedPageTurn(scene, front, back);
    try {
      turn.updateCurl(0.5);
      const curled = positions.map((position) => Array.from(position.array));
      for (let repeat = 0; repeat < 20; repeat++) turn.updateCurl(0.5);
      positions.forEach((position, face) => assert.deepEqual(Array.from(position.array), curled[face]));
      const columns = 19; // PlaneGeometry's 18 horizontal segments.
      for (let index = 0; index < positions[0].count; index++) {
        const mirrored = Math.floor(index / columns) * columns + columns - 1 - index % columns;
        const frontDx = positions[0].getX(index) - resting[0][index * 3];
        const backDx = positions[1].getX(mirrored) - resting[1][mirrored * 3];
        const frontDz = positions[0].getZ(index) - resting[0][index * 3 + 2];
        const backDz = positions[1].getZ(mirrored) - resting[1][mirrored * 3 + 2];
        assert.ok(Math.abs(frontDx + backDx) < 1e-6, "mirrored faces have the same lateral pull");
        assert.ok(Math.abs(frontDz + backDz) < 1e-6, "mirrored faces have the same bend");
      }
      for (const progress of [0, 1]) {
        turn.updateCurl(progress);
        positions.forEach((position, face) => assert.deepEqual(Array.from(position.array), resting[face]));
      }
    } finally {
      turn.dispose();
    }
  } finally {
    front.dispose();
    back.dispose();
    globalThis.document = originalDocument;
  }
});

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
      const turn = makeRetainedPageTurn(scene, front, back, backwards);
      const sheet = (face: ReturnType<typeof addPage>) => face.group.children.find((child) =>
        child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
      )!;
      assert.equal(sheet(front).visible, true);
      assert.equal(sheet(back).visible, false, "only one GPU sheet renders the double-sided turning leaf");
      back.setVisible(true);
      assert.equal(sheet(back).visible, false, "visibility refresh cannot reintroduce an intersecting reverse mesh");
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
      assert.equal(sheet(front).visible, true);
      assert.equal(sheet(back).visible, true);
    }
    front.dispose();
    back.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("pocket separation follows the local surface normal, including folds past vertical", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new Host() } as unknown as Document;
  const scene = new THREE.Scene();
  const page = addPage(scene, {
    id: "clearance", rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots: [],
  }, 2, 1.61);
  try {
    const pockets = page.group.children.filter((child) =>
      (child as THREE.Object3D & { element?: Host }).element?.className === "binder-three-pocket-root",
    );
    const width = 2.5, height = 3.1;
    const gridWidth = width * 0.91;
    const gap = gridWidth * 0.022;
    const cellWidth = (gridWidth - gap * 2) / 3;
    const gridHeight = height * 0.85;
    const gapY = gridHeight * 0.022;
    const cellHeight = (gridHeight - gapY * 2) / 3;
    for (const fromRight of [false, true]) {
      const curl = fromRight ? -page.turnAmplitude : page.turnAmplitude;
      page.updateCurl(curl, fromRight);
      pockets.forEach((object, slot) => {
        const x = -width / 2 + width * 0.045 + slot % 3 * (cellWidth + gap) + cellWidth / 2;
        const y = height / 2 - height * 0.105 - Math.floor(slot / 3) * (cellHeight + gapY) - cellHeight / 2;
        const surfaceX = fromRight ? -x : x;
        const surface = new THREE.Vector3(
          1.61 + x + (fromRight ? -1 : 1) * pageSurfaceShift(surfaceX, width, curl, true),
          y, pageSurfaceOffset(surfaceX, y, width, height, curl, true),
        );
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(object.rotation);
        const separation = object.position.clone().sub(surface);
        const expected = 0.099 + pagePocketClearance(width, cellWidth, curl, 0.094);
        assert.ok(Math.abs(separation.dot(normal) - expected) < 1e-10);
        assert.ok(separation.clone().cross(normal).length() < 1e-10, "clearance must not collapse at edge-on angles");
      });
    }
  } finally {
    page.dispose();
    globalThis.document = originalDocument;
  }
});

test("back-facing CSS paper cannot bleed through visible reverse artwork", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new Host() } as unknown as Document;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.792, 7.2);
  camera.lookAt(0, 0, 0);
  const page = (id: string): BinderPage => ({
    id, rows: 3, columns: 3, widthMm: 240, heightMm: 330, slots: [],
  });
  const front = addPage(scene, page("facing-front"), 2, 1.32);
  const back = addPage(scene, page("facing-back"), 3, -1.32);
  try {
    const turn = makeRetainedPageTurn(scene, front, back);
    try {
      const progress = 0.84375;
      turn.pivot.rotation.y = -Math.PI * progress;
      turn.updateCurl(progress);
      updateBinderCssFacing(scene, camera);
      front.portal.pockets.forEach(({ host }) => assert.equal(host.style.visibility, "hidden"));
      back.portal.pockets.forEach(({ host }) => assert.equal(host.style.visibility, ""));
      const frontPaper = front.group.children.filter((child) =>
        (child as THREE.Object3D & { element?: Host }).element?.className === "binder-three-page-backing",
      );
      frontPaper.forEach((child) => assert.equal(
        (child as THREE.Object3D & { element: Host }).element.style.visibility, "hidden",
      ));
    } finally {
      turn.dispose();
    }
    updateBinderCssFacing(scene, camera);
    [front, back].forEach((face) => face.portal.pockets.forEach(({ host }) =>
      assert.equal(host.style.visibility, "", "settled artwork is visible again without replacing its host"),
    ));
  } finally {
    front.dispose();
    back.dispose();
    globalThis.document = originalDocument;
  }
});

test("unequal-sized sheet faces share the same world-space bend in both directions", () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new Host() } as unknown as Document;
  const scene = new THREE.Scene();
  const front = addPage(scene, {
    id: "small", rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots: [],
  }, 2, 1.61);
  const back = addPage(scene, {
    id: "large", rows: 4, columns: 1, widthMm: 310, heightMm: 410, slots: [],
  }, 3, -1.92);
  const sheets = [front, back].map((face) => face.group.children.find((child) =>
    child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
  ) as THREE.Mesh<THREE.PlaneGeometry>);
  const rest = sheets.map((sheet) => Array.from(sheet.geometry.attributes.position.array));
  try {
    for (const backwards of [false, true]) {
      const turn = makeRetainedPageTurn(scene, front, back, backwards);
      try {
        for (const progress of [0.25, 0.5, 0.75]) {
          turn.pivot.rotation.y = backwards ? -Math.PI * (1 - progress) : -Math.PI * progress;
          turn.updateCurl(progress);
          scene.updateMatrixWorld(true);
          for (let index = 0; index < sheets[0].geometry.attributes.position.count; index++) {
            const mirrored = Math.floor(index / 19) * 19 + 18 - index % 19;
            const bends = sheets.map((sheet, face) => {
              const vertex = face === 0 ? index : mirrored;
              const position = sheet.geometry.attributes.position;
              const curled = new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(sheet.matrixWorld);
              const resting = new THREE.Vector3().fromArray(rest[face], vertex * 3).applyMatrix4(sheet.matrixWorld);
              return curled.sub(resting);
            });
            assert.ok(bends[0].distanceTo(bends[1]) < 1e-6, "paired faces retain the same normalized arc");
          }
        }
      } finally {
        turn.dispose();
      }
    }
  } finally {
    front.dispose();
    back.dispose();
    globalThis.document = originalDocument;
  }
});