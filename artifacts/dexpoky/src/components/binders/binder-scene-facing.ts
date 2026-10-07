import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";

const cameraPosition = new THREE.Vector3();
const position = new THREE.Vector3();
const normal = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

/** Cull CSS sheet faces explicitly: browser compositing can bleed their backs through. */
export function updateBinderCssFacing(scene: THREE.Scene, camera: THREE.Camera) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  scene.traverse((object) => {
    if (!(object instanceof CSS3DObject)) return;
    normalMatrix.getNormalMatrix(object.matrixWorld);
    normal.set(0, 0, 1).applyNormalMatrix(normalMatrix);
    position.setFromMatrixPosition(object.matrixWorld);
    toCamera.copy(cameraPosition).sub(position);
    // Keep hosts connected and preserve renderer-controlled display/interaction.
    const visibility = normal.dot(toCamera) > 1e-6 ? "" : "hidden";
    if (object.element.style.visibility !== visibility) object.element.style.visibility = visibility;
  });
}
