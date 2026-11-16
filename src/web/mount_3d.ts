// SPDX-License-Identifier: AGPL-3.0-only
import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { sceneNodes } from "../renderer/layout_3d.js";
import type { Scenario } from "../schema/scenario.js";

/** Optional skin. The main quiz bundle loads this only after the button click. */
export function mountScene(host: HTMLElement, scenario: Scenario): () => void {
  host.replaceChildren();
  const canvas = document.createElement("canvas");
  canvas.dataset.sceneCanvas = "true";
  host.append(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(640, 360, false);
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 640 / 360, 0.1, 100);
  camera.position.set(6, 8, 8);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 1));
  for (const node of sceneNodes(scenario)) {
    if (node.kind === "roundabout") {
      const island = new Mesh(new CircleGeometry(1.1, 28), new MeshStandardMaterial({ color: 0x7d9a62 }));
      island.rotation.x = -Math.PI / 2;
      scene.add(island);
      continue;
    }
    const mesh = new Mesh(
      new BoxGeometry(0.45, 0.35, 0.9),
      new MeshStandardMaterial({ color: node.id === "candidate" ? 0x2f6fed : 0xc44536 }),
    );
    mesh.position.set(node.x, 0.2, node.z);
    scene.add(mesh);
  }
  renderer.render(scene, camera);
  return () => {
    renderer.dispose();
    host.replaceChildren();
  };
}
