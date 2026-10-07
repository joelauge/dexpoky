import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { Binder, BinderPage } from "@workspace/api-client-react";
import { pagePocketClearance, pageSurfaceOffset, pageSurfaceRotation, pageSurfaceShift, pageTurnAmplitude, pageTurnCurl } from "./binder-scene-motion";
import { pageBackingStrip } from "./binder-paper-strips";

export type PortalSlot = { slot: number; host: HTMLDivElement };
export type PortalPage = { page: BinderPage; pageNumber: number; host: HTMLDivElement; pockets: PortalSlot[]; key: string; leaf?: boolean; active?: boolean };

export const PAGE_PIXELS = { width: 1000, height: 1400 };
export const PAGE_DEPTH = 0.075;

function pocketSlots(page: BinderPage) {
  return Array.from({ length: page.rows * page.columns }, (_, slot) => slot);
}

function setBowedSheet(geometry: THREE.PlaneGeometry, width: number, height: number, curl = 0, hinge = false, fromRight = false) {
  const positions = geometry.attributes.position;
  // Base coordinates are captured once so repeated updates never accumulate drift.
  const base = (geometry.userData.baseX ??= Float32Array.from({ length: positions.count }, (_, i) => positions.getX(i))) as Float32Array;
  for (let i = 0; i < positions.count; i++) {
    const x = base[i];
    const y = positions.getY(i);
    const shift = pageSurfaceShift(fromRight ? -x : x, width, curl, hinge);
    positions.setX(i, x + (fromRight ? -shift : shift));
    positions.setZ(i, pageSurfaceOffset(fromRight ? -x : x, y, width, height, curl, hinge));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function makeBox(width: number, height: number, depth: number, color: THREE.ColorRepresentation, roughness = 0.7) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 }),
  );
}

export function addSceneHardware(scene: THREE.Object3D, binder: Binder, halfWidth: number, height: number) {
  const strap = makeBox(halfWidth * 2 + 0.18, 0.13, 0.08, new THREE.Color(binder.coverColor).multiplyScalar(0.76), 0.6);
  strap.position.set(0, -height * 0.31, 0.15);
  scene.add(strap);
  const clasp = makeBox(0.27, 0.2, 0.1, 0xd7c59a, 0.3);
  clasp.position.set(0, -height * 0.31, 0.21);
  scene.add(clasp);
  const inset = makeBox(0.13, 0.09, 0.015, 0x54565a);
  inset.position.set(0, -height * 0.31, 0.27);
  scene.add(inset);
}

export function addContactShadow(scene: THREE.Object3D, halfWidth: number, height: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const sectors = 40;
  const rings = 9;
  const point = (radius: number, angle: number) => {
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    const alpha = 0.12 * Math.pow(1 - radius, 1.8);
    colors.push(1, 1, 1, alpha);
  };
  for (let ring = 0; ring < rings; ring++) {
    const inner = ring / rings;
    const outer = (ring + 1) / rings;
    for (let sector = 0; sector < sectors; sector++) {
      const start = (sector / sectors) * Math.PI * 2;
      const end = ((sector + 1) / sectors) * Math.PI * 2;
      point(inner, start);
      point(outer, start);
      point(outer, end);
      point(inner, start);
      point(outer, end);
      point(inner, end);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  const shadow = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x090b10,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  shadow.scale.set(halfWidth * 1.22, (height / 2 + 0.14) * 1.22, 1);
  shadow.position.set(0, -0.015, -0.24);
  scene.add(shadow);
}

function pagePlacements(page: BinderPage) {
  const width = page.widthMm / 100;
  const height = page.heightMm / 100;
  const marginX = width * 0.045;
  const gridWidth = width - marginX * 2;
  const gapX = gridWidth * 0.022;
  const cellWidth = (gridWidth - gapX * (page.columns - 1)) / page.columns;
  const gridTop = height * 0.105;
  const gridHeight = height * 0.85;
  const gapY = gridHeight * 0.022;
  const cellHeight = (gridHeight - gapY * (page.rows - 1)) / page.rows;
  return pocketSlots(page).map((slot) => {
    const row = Math.floor(slot / page.columns);
    const column = slot % page.columns;
    return {
      slot,
      x: -width / 2 + marginX + column * (cellWidth + gapX) + cellWidth / 2,
      y: height / 2 - gridTop - row * (cellHeight + gapY) - cellHeight / 2,
      width,
      height,
      cellWidth,
      cellHeight,
    };
  });
}

function makeHeaderHost() {
  const host = document.createElement("div");
  host.className = "binder-three-page-root";
  host.style.cssText = `width:${PAGE_PIXELS.width}px;height:${PAGE_PIXELS.height}px;transform-origin:center center;pointer-events:none;backface-visibility:hidden;`;
  return host;
}

function makePocketHost(placement: ReturnType<typeof pagePlacements>[number]) {
  const host = document.createElement("div");
  const scaleX = placement.width / PAGE_PIXELS.width;
  const scaleY = placement.height / PAGE_PIXELS.height;
  host.className = "binder-three-pocket-root";
  host.style.cssText = `width:${placement.cellWidth / scaleX}px;height:${placement.cellHeight / scaleY}px;transform-origin:center center;backface-visibility:hidden;`;
  return host;
}

/** Keep CSS faces apart along the bent surface normal, not the world Z axis. */
function placeSurfaceObject(object: CSS3DObject, x: number, y: number, width: number, height: number,
  centerX: number, depth: number, curl = 0, hinge = false, fromRight = false) {
  const surfaceX = fromRight ? -x : x;
  const rotation = pageSurfaceRotation(surfaceX, y, width, height, curl, hinge);
  object.rotation.set(rotation.x, fromRight ? -rotation.y : rotation.y, 0);
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(object.rotation);
  object.position.set(
    centerX + x + (fromRight ? -1 : 1) * pageSurfaceShift(surfaceX, width, curl, hinge) + normal.x * depth,
    y + normal.y * depth,
    pageSurfaceOffset(surfaceX, y, width, height, curl, hinge) + normal.z * depth,
  );
}

function addCurvedCssBacking(parent: THREE.Object3D, page: BinderPage, centerX: number, baseZ: number, hinge = false) {
  const width = page.widthMm / 100;
  const height = page.heightMm / 100;
  const columns = 12;
  const tileWidth = width / columns;
  const tiles: { left: number; right: number; object: CSS3DObject; host: HTMLDivElement }[] = [];
  // Full-height chord facets share exact edges. Overlapping tangent patches
  // cross each other when curled and show through translucent empty sleeves.
  for (let column = 0; column < columns; column++) {
      const left = -width / 2 + column * tileWidth;
      const right = -width / 2 + (column + 1) * tileWidth;
      const host = document.createElement("div");
      host.className = "binder-three-page-backing";
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = [
        `width:${PAGE_PIXELS.width / columns}px`,
        `height:${PAGE_PIXELS.height}px`,
        "transform-origin:center center",
        "pointer-events:none",
        "backface-visibility:hidden",
        "background:rgba(236,230,217,1)",
      ].join(";");
      const object = new CSS3DObject(host);
      host.style.pointerEvents = "none";
      object.scale.set(width / PAGE_PIXELS.width, height / PAGE_PIXELS.height, 1);
      parent.add(object);
      tiles.push({ left, right, object, host });
  }
  const update = (curl = 0, fromHinge = hinge, fromRight = false) => {
    for (const tile of tiles) {
      const strip = pageBackingStrip(tile.left, tile.right, width, height, baseZ + 0.004,
        curl, fromHinge, fromRight);
      tile.object.position.set(centerX + strip.x, 0, strip.z);
      tile.object.rotation.set(0, strip.rotation, 0);
      tile.object.scale.set(strip.length / (PAGE_PIXELS.width / columns), height / PAGE_PIXELS.height, 1);
      // CSS artwork sits above WebGL, so the visible backing needs its own
      // directional shading to make the moving curvature readable.
      const shade = Math.round(18 * Math.min(1, Math.abs(strip.rotation) / 1.8));
      tile.host.style.backgroundColor = `rgb(${236 - shade}, ${230 - shade}, ${217 - shade})`;
    }
  };
  update();
  return {
    update,
    setCenterX(value: number) {
      centerX = value;
      update();
    },
    setVisible(visible: boolean) {
      for (const tile of tiles) tile.object.visible = visible;
    },
    dispose() {
      for (const tile of tiles) {
        parent.remove(tile.object);
        tile.host.remove();
      }
    },
  };
}

export function addPage(parentScene: THREE.Scene, page: BinderPage, pageNumber: number, x: number) {
  const scene = new THREE.Group();
  let turning = false;
  let turnBackside = false;
  parentScene.add(scene);
  const width = page.widthMm / 100;
  const height = page.heightMm / 100;
  const board = makeBox(width, height, PAGE_DEPTH, 0xe4dccb);
  board.position.set(x, 0, 0.04);
  scene.add(board);

  const sheetGeometry = new THREE.PlaneGeometry(width, height, 18, 24);
  setBowedSheet(sheetGeometry, width, height);
  const sheet = new THREE.Mesh(
    sheetGeometry,
    new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.55, side: THREE.DoubleSide }),
  );
  sheet.position.set(x, 0, 0.078);
  scene.add(sheet);
  const backing = addCurvedCssBacking(scene, page, x, 0.09);

  const cssRoot = makeHeaderHost();
  const header = new CSS3DObject(cssRoot);
  cssRoot.style.pointerEvents = "none";
  header.position.set(x, 0, 0.09 + pageSurfaceOffset(0, 0, width, height) + 0.009);
  header.scale.set(width / PAGE_PIXELS.width, height / PAGE_PIXELS.height, 1);
  scene.add(header);
  const pockets: PortalSlot[] = [];
  const pocketObjects: CSS3DObject[] = [];
  const placements = pagePlacements(page);
  for (const placement of placements) {
    const pocketHost = makePocketHost(placement);
    const pocketObject = new CSS3DObject(pocketHost);
    const normal = pageSurfaceRotation(placement.x, placement.y, width, height);
    pocketObject.position.set(x + placement.x, placement.y, 0.09 + pageSurfaceOffset(placement.x, placement.y, width, height) + 0.009);
    pocketObject.rotation.set(normal.x, normal.y, 0);
    pocketObject.scale.set(width / PAGE_PIXELS.width, height / PAGE_PIXELS.height, 1);
    scene.add(pocketObject);
    pocketObjects.push(pocketObject);
    pockets.push({ slot: placement.slot, host: pocketHost });
  }
  let pageX = x;
  const updateCurl = (curl = 0, fromRight = false) => {
    setBowedSheet(sheetGeometry, width, height, curl, true, fromRight);
    backing.update(curl, true, fromRight);
    placeSurfaceObject(header, 0, 0, width, height, pageX, 0.099, curl, true, fromRight);
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const object = pocketObjects[index];
      const clearance = pagePocketClearance(width, placement.cellWidth, curl, 0.094);
      placeSurfaceObject(object, placement.x, placement.y, width, height, pageX,
        0.099 + clearance, curl, true, fromRight);
    }
  };
  updateCurl();
  return {
    group: scene,
    updateCurl,
    turnAmplitude: pageTurnAmplitude(width, height, placements[0].cellWidth),
    getHingeX(backside = false) {
      return (backside ? -pageX : pageX) - width / 2;
    },
    beginTurn(pivot: THREE.Group, backside: boolean) {
      // Reparent the group, never the CSS3D hosts: their React portals and images
      // remain attached to the same elements throughout the entire turn.
      pivot.add(scene);
      turning = true;
      turnBackside = backside;
      scene.rotation.y = backside ? Math.PI : 0;
      scene.visible = true;
      board.visible = false;
      // One double-sided GPU sheet represents the leaf. Drawing its curved
      // reverse mesh as well makes two displaced surfaces intersect mid-turn.
      sheet.visible = !backside;
      header.visible = true;
      pocketObjects.forEach((object) => { object.visible = true; });
      backing.setVisible(true);
      updateCurl(0, backside);
    },
    endTurn() {
      parentScene.add(scene);
      turning = false;
      turnBackside = false;
      scene.rotation.set(0, 0, 0);
      scene.position.set(0, 0, 0);
      scene.scale.set(1, 1, 1);
      updateCurl();
      board.visible = true;
      sheet.visible = true;
    },
    portal: { page, pageNumber, host: cssRoot, pockets, key: `page-${page.id}` } satisfies PortalPage,
    setPosition(nextX: number) {
      pageX = nextX;
      board.position.x = nextX;
      sheet.position.x = nextX;
      backing.setCenterX(nextX);
      updateCurl();
    },
    setVisible(visible: boolean) {
      board.visible = visible && !turning;
      sheet.visible = visible && !(turning && turnBackside);
      header.visible = visible;
      pocketObjects.forEach((object) => { object.visible = visible; });
      backing.setVisible(visible);
    },
    dispose() {
      scene.removeFromParent();
      scene.remove(board, sheet, header, ...pocketObjects);
      board.geometry.dispose();
      (board.material as THREE.Material).dispose();
      sheet.geometry.dispose();
      (sheet.material as THREE.Material).dispose();
      backing.dispose();
      cssRoot.remove();
      for (const pocket of pockets) pocket.host.remove();
    },
  };
}

export function makeFlipLeaf(scene: THREE.Scene, page: BinderPage, pageNumber: number, hingeX: number) {
  const width = page.widthMm / 100;
  const height = page.heightMm / 100;
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, 0.13);
  scene.add(pivot);
  const geometry = new THREE.PlaneGeometry(width, height, 18, 24);
  setBowedSheet(geometry, width, height, 0, true);
  const leaf = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.66, side: THREE.DoubleSide }),
  );
  leaf.position.set(width / 2, 0, 0);
  pivot.add(leaf);
  const backing = addCurvedCssBacking(pivot, page, width / 2, 0.025, true);
  const host = makeHeaderHost();
  const header = new CSS3DObject(host);
  host.style.pointerEvents = "none";
  header.position.set(width / 2, 0, 0.025 + pageSurfaceOffset(0, 0, width, height, 0, true) + 0.009);
  header.scale.set(width / PAGE_PIXELS.width, height / PAGE_PIXELS.height, 1);
  pivot.add(header);
  const placements = pagePlacements(page);
  const pockets: PortalSlot[] = [];
  const pocketObjects: CSS3DObject[] = [];
  for (const placement of placements) {
    const pocketHost = makePocketHost(placement);
    const pocketObject = new CSS3DObject(pocketHost);
    pocketHost.style.pointerEvents = "none";
    const normal = pageSurfaceRotation(placement.x, placement.y, width, height, 0, true);
    pocketObject.position.set(width / 2 + placement.x, placement.y, 0.025 + pageSurfaceOffset(placement.x, placement.y, width, height, 0, true) + 0.009);
    pocketObject.rotation.set(normal.x, normal.y, 0);
    pocketObject.scale.set(width / PAGE_PIXELS.width, height / PAGE_PIXELS.height, 1);
    pivot.add(pocketObject);
    pockets.push({ slot: placement.slot, host: pocketHost });
    pocketObjects.push(pocketObject);
  }
  pivot.position.x = hingeX;
  const updateCurl = (progress: number) => {
    const curl = pageTurnCurl(progress);
    setBowedSheet(geometry, width, height, curl, true);
    backing.update(curl);
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const object = pocketObjects[index];
      const normal = pageSurfaceRotation(placement.x, placement.y, width, height, curl, true);
      object.position.z = 0.025 + pageSurfaceOffset(placement.x, placement.y, width, height, curl, true) + 0.009;
      object.rotation.set(normal.x, normal.y, 0);
    }
    const headerNormal = pageSurfaceRotation(0, 0, width, height, curl, true);
    header.position.z = 0.025 + pageSurfaceOffset(0, 0, width, height, curl, true) + 0.009;
    header.rotation.set(headerNormal.x, headerNormal.y, 0);
  };
  return {
    pivot,
    updateCurl,
    portal: { page, pageNumber, host, pockets, key: `flip-${page.id}`, leaf: true } satisfies PortalPage,
    dispose() {
      scene.remove(pivot);
      leaf.geometry.dispose();
      (leaf.material as THREE.Material).dispose();
      backing.dispose();
      host.remove();
      for (const pocket of pockets) pocket.host.remove();
    },
  };
}

/** Animate the already-composed faces without creating replacement artwork hosts. */
export function makeRetainedPageTurn(
  scene: THREE.Scene,
  front: ReturnType<typeof addPage>,
  back: ReturnType<typeof addPage>,
  backwards = false,
) {
  const pivot = new THREE.Group();
  scene.add(pivot);
  front.beginTurn(pivot, false);
  back.beginTurn(pivot, true);
  const frontWidth = front.portal.page.widthMm;
  const backWidth = back.portal.page.widthMm;
  const frontHeight = front.portal.page.heightMm;
  const backHeight = back.portal.page.heightMm;
  const frontHinge = front.getHingeX();
  const backHinge = back.getHingeX(true);
  // Paired faces must use the same arc, even if one has wider rigid pockets.
  const bendRatio = Math.min(
    front.turnAmplitude / (frontWidth / 100),
    back.turnAmplitude / (backWidth / 100),
  );
  let disposed = false;
  return {
    pivot,
    updateCurl(progress: number) {
      // Editable page sizes must still form one turning surface. Morph its bounds
      // between the visible source/destination sizes, keeping both sides aligned
      // along the same hinge and normalized arc. Only the hidden face is scaled
      // at each endpoint, so the visible landing transform remains exact.
      const phase = backwards ? 1 - progress : progress;
      const width = frontWidth + (backWidth - frontWidth) * phase;
      const height = frontHeight + (backHeight - frontHeight) * phase;
      const hinge = frontHinge + (backHinge - frontHinge) * phase;
      const frontScale = width / frontWidth;
      const backScale = width / backWidth;
      front.group.scale.set(frontScale, height / frontHeight, frontScale);
      back.group.scale.set(backScale, height / backHeight, backScale);
      front.group.position.x = hinge - frontScale * frontHinge;
      back.group.position.x = hinge - backScale * backHinge;
      front.updateCurl(pageTurnCurl(progress, bendRatio * frontWidth / 100));
      back.updateCurl(-pageTurnCurl(progress, bendRatio * backWidth / 100), true);
      // Both endpoints use the exact resting transforms, not a second flat
      // representation that jumps into place when the temporary leaf disappears.
      pivot.position.z = Math.sin(Math.PI * progress) * 0.1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      front.endTurn();
      back.endTurn();
      scene.remove(pivot);
    },
  };
}