// SPDX-License-Identifier: AGPL-3.0-only
/** Minimal types for the optional skin. The package itself ships JavaScript only. */
declare module "three" {
  export class WebGLRenderer {
    constructor(options?: { canvas?: HTMLCanvasElement; antialias?: boolean; alpha?: boolean });
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export class Scene {
    add(object: object): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    position: { set(x: number, y: number, z: number): void };
    lookAt(x: number, y: number, z: number): void;
  }
  export class AmbientLight {
    constructor(color: number, intensity?: number);
  }
  export class BoxGeometry {
    constructor(width: number, height: number, depth: number);
  }
  export class CircleGeometry {
    constructor(radius: number, segments: number);
  }
  export class MeshStandardMaterial {
    constructor(parameters: { color: number });
  }
  export class Mesh {
    constructor(geometry: object, material: object);
    position: { set(x: number, y: number, z: number): void };
    rotation: { x: number };
  }
}
