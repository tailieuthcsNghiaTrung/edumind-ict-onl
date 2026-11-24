import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface StudioContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  isSoftwareGl: boolean;
  scheduleNext: (tick: () => void) => void;
  cancelLoop: () => void;
  dispose: () => void;
}

export function createStudio3D(
  container: HTMLElement,
  skyHex: number,
  fogNear = 28,
  fogFar = 125
): StudioContext {
  const isSoftwareGl = detectSoftwareWebGL();
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });

  const width = Math.max(320, container.clientWidth);
  const height = Math.max(240, container.clientHeight);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.innerHTML = '';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(skyHex);
  scene.fog = new THREE.Fog(skyHex, fogNear, fogFar);

  // Studio environment reflections (PMREM + RoomEnvironment on every device)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTex;
  roomEnv.dispose();
  pmrem.dispose();

  // Warm sun key light + cool sky/ground hemisphere fill + crisp rim light
  const hemi = new THREE.HemisphereLight(0xdff4ff, 0x86c87d, 0.85);
  hemi.position.set(0, 40, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff6e5, 1.38);
  sun.position.set(18, 32, 16);
  if (!isSoftwareGl) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 90;
    const d = 26;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0xa5e6ff, 0.48);
  rim.position.set(-14, 14, -20);
  scene.add(rim);

  let frameId = 0;
  let disposed = false;

  const afterDraw = (cb: () => void) => {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 75);
        }
      };
      frameId = window.setTimeout(poll, 5);
    } else {
      frameId = window.setTimeout(cb, 80);
    }
  };

  const scheduleNext = (tick: () => void) => {
    if (disposed) return;
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  };

  const cancelLoop = () => {
    cancelAnimationFrame(frameId);
    window.clearTimeout(frameId);
  };

  const disposeMaterial = (m: THREE.Material) => {
    const std = m as THREE.MeshStandardMaterial;
    if (std.map) std.map.dispose();
    if (std.normalMap) std.normalMap.dispose();
    if (std.roughnessMap) std.roughnessMap.dispose();
    m.dispose();
  };

  const dispose = () => {
    disposed = true;
    cancelLoop();
    envTex.dispose();
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(disposeMaterial);
        } else if (mesh.material) {
          disposeMaterial(mesh.material);
        }
      }
    });
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    renderer,
    scene,
    sunLight: sun,
    isSoftwareGl,
    scheduleNext,
    cancelLoop,
    dispose,
  };
}

// Procedural asphalt road canvas texture with crisp lane markings & shoulders
export function createRoadTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#364152';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 650; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  ctx.fillStyle = 'rgba(15,23,42,0.08)';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 4);
  }

  // Red & white racing curbs
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? '#EF4444' : '#FFFFFF';
    ctx.fillRect(0, y, 24, 64);
    ctx.fillRect(488, y, 24, 64);
  }

  // Solid edge lines
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(28, 0, 6, 512);
  ctx.fillRect(478, 0, 6, 512);

  // Dashed lane dividers for 3 lanes
  ctx.fillStyle = '#F8FAFC';
  const laneX1 = Math.round(512 / 3);
  const laneX2 = Math.round((512 * 2) / 3);
  for (let y = 20; y < 512; y += 96) {
    ctx.fillRect(laneX1 - 5, y, 10, 52);
    ctx.fillRect(laneX2 - 5, y, 10, 52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 14);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Procedural terracotta athletic running track texture for Health Festival 3D
export function createTrackTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#C85A36';
  ctx.fillRect(0, 0, 512, 512);

  // Tartan track granular texture
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 700; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  ctx.fillStyle = 'rgba(92,28,12,0.09)';
  for (let i = 0; i < 500; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  // White stadium curb borders & 3 crisp lane lines
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(10, 0, 10, 512);
  ctx.fillRect(492, 0, 10, 512);
  ctx.fillRect(172, 0, 8, 512);
  ctx.fillRect(332, 0, 8, 512);

  // Subtle horizontal distance ticks in each lane
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let y = 32; y < 512; y += 128) {
    ctx.fillRect(80, y, 24, 6);
    ctx.fillRect(244, y, 24, 6);
    ctx.fillRect(408, y, 24, 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 18);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Composite 12-part 3D Race Car (clearcoat PBR paint, spinning wheels, turbo exhaust flames, grounded at Y = 0)
export function buildCompositeRaceCar(bodyHex: number, trimHex: number): THREE.Group {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyHex,
    metalness: 0.42,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimHex,
    metalness: 0.58,
    roughness: 0.22,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162b46,
    metalness: 0.75,
    roughness: 0.08,
    clearcoat: 1.0,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.35,
    roughness: 0.6,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x1a202c,
    metalness: 0.05,
    roughness: 0.88,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.82,
    roughness: 0.18,
  });

  // 1. Lower sculpted chassis + front aerodynamic splitter
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.42, 3.05), bodyMat);
  chassis.position.set(0, 0.48, 0);
  chassis.castShadow = true;
  car.add(chassis);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.1, 0.45), carbonMat);
  splitter.position.set(0, 0.27, -1.42);
  car.add(splitter);

  // 2. Racing stripe on hood
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 2.98), trimMat);
  stripe.position.set(0, 0.49, 0);
  car.add(stripe);

  // 3. Cabin canopy
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.44, 1.38), glassMat);
  cabin.position.set(0, 0.86, 0.16);
  cabin.castShadow = true;
  car.add(cabin);

  // 4. Roof cap
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 1.0), bodyMat);
  roof.position.set(0, 1.1, 0.2);
  car.add(roof);

  // 5. Rear wing spoiler + supports
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.1, 0.38), trimMat);
  wing.position.set(0, 1.08, 1.34);
  wing.castShadow = true;
  car.add(wing);

  [-0.54, 0.54].forEach((x) => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.2), carbonMat);
    strut.position.set(x, 0.85, 1.34);
    car.add(strut);
  });

  // 6. Headlights, Taillights & Dual Exhaust Pipes + Turbo Flames
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8dc,
    emissive: 0xfde047,
    emissiveIntensity: 0.95,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xfef2f2,
    emissive: 0xef4444,
    emissiveIntensity: 1.05,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xfb923c,
    emissive: 0xf97316,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });

  const flames: THREE.Mesh[] = [];
  [-0.5, 0.5].forEach((x) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), headMat);
    hl.position.set(x, 0.54, -1.54);
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), tailMat);
    tl.position.set(x, 0.54, 1.54);
    car.add(tl);
  });

  [-0.32, 0.32].forEach((x) => {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.24, 10),
      rimMat
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.34, 1.56);
    car.add(pipe);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.85, 10), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(x, 0.34, 2.02);
    flame.visible = false;
    car.add(flame);
    flames.push(flame);
  });

  // 7. 4 Spinning Wheels with metallic rims & spokes (grounded cleanly at y = 0)
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.3, 0.06, 0.28);

  const wheelCoords: [number, number][] = [
    [-0.84, -0.94],
    [0.84, -0.94],
    [-0.84, 0.94],
    [0.84, 0.94],
  ];
  const wheels: THREE.Group[] = [];
  for (const [wx, wz] of wheelCoords) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.32, wz);

    const w = new THREE.Mesh(wheelGeo, rubberMat);
    w.castShadow = true;
    pivot.add(w);

    const r = new THREE.Mesh(rimGeo, rimMat);
    pivot.add(r);

    const spoke = new THREE.Mesh(spokeGeo, carbonMat);
    pivot.add(spoke);

    car.add(pivot);
    wheels.push(pivot);
  }

  car.userData = { wheels, flames };
  return car;
}

// Composite 10-part 3D Runner Character (named + userData articulated limbs for smooth sprint animation)
export function buildCompositeRunner(shirtHex: number, shortsHex = 0x1e3a8a): THREE.Group {
  const runner = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf7c59f, roughness: 0.62 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.42 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shortsHex, roughness: 0.58 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const soleMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.5 });
  const capMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.38 });
  const bibMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });

  // Torso + athletic bib badge
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirtMat);
  torso.position.set(0, 1.15, 0);
  torso.castShadow = true;
  runner.add(torso);

  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.345), bibMat);
  bib.position.set(0, 1.17, 0);
  runner.add(bib);

  // Shorts
  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.32), shortsMat);
  shorts.position.set(0, 0.72, 0);
  runner.add(shorts);

  // Head + sporty cap
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), skinMat);
  head.position.set(0, 1.72, 0);
  head.castShadow = true;
  runner.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.14, 14), capMat);
  cap.position.set(0, 1.9, 0);
  runner.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.24), capMat);
  brim.position.set(0, 1.85, -0.2);
  runner.add(brim);

  // Articulated Legs
  const makeLeg = (x: number, name: string) => {
    const legPivot = new THREE.Group();
    legPivot.name = name;
    legPivot.position.set(x, 0.65, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 6, 10), skinMat);
    leg.position.set(0, -0.28, 0);
    legPivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.34), shoeMat);
    shoe.position.set(0, -0.57, -0.05);
    legPivot.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.35), soleMat);
    sole.position.set(0, -0.63, -0.05);
    legPivot.add(sole);
    runner.add(legPivot);
    return legPivot;
  };

  const leftLeg = makeLeg(-0.16, 'legL');
  const rightLeg = makeLeg(0.16, 'legR');

  // Articulated Arms
  const makeArm = (x: number, name: string) => {
    const armPivot = new THREE.Group();
    armPivot.name = name;
    armPivot.position.set(x, 1.4, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.18, 10), shirtMat);
    sleeve.position.set(0, -0.06, 0);
    armPivot.add(sleeve);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 6, 10), skinMat);
    arm.position.set(0, -0.26, 0);
    armPivot.add(arm);
    runner.add(armPivot);
    return armPivot;
  };

  const leftArm = makeArm(-0.38, 'armL');
  const rightArm = makeArm(0.38, 'armR');

  runner.userData = { leftLeg, rightLeg, leftArm, rightArm };
  return runner;
}

// Composite 4-part Stylized Pine Tree (grounded at Y = 0)
export function buildCompositeTree(scale = 1): THREE.Group {
  const tree = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
  const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.75 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.72 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.3, 8), trunkMat);
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  tree.add(trunk);

  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.8, 8), leafMat2);
  c1.position.y = 1.9;
  c1.castShadow = true;
  tree.add(c1);

  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.5, 8), leafMat1);
  c2.position.y = 2.95;
  c2.castShadow = true;
  tree.add(c2);

  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.1, 8), leafMat1);
  c3.position.y = 3.85;
  tree.add(c3);

  tree.scale.setScalar(scale);
  return tree;
}

// Distant Rolling Horizon Hills (blends smoothly into fog so worlds feel expansive)
export function buildHorizonHills(): THREE.Group {
  const group = new THREE.Group();
  const hillMat1 = new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.92 });
  const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.92 });

  const defs: [number, number, number, number, number, number][] = [
    [-46, -78, 22, 1.2, 0.55, 1],
    [48, -84, 25, 1.3, 0.52, 0],
    [-28, -104, 28, 1.4, 0.48, 0],
    [26, -106, 26, 1.35, 0.5, 1],
    [-64, -44, 18, 1.1, 0.45, 1],
    [66, -48, 19, 1.1, 0.45, 0],
  ];

  for (const [x, z, r, sx, sy, variant] of defs) {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      variant === 0 ? hillMat1 : hillMat2
    );
    hill.scale.set(sx, sy, 1);
    hill.position.set(x, -0.5, z);
    group.add(hill);
  }
  return group;
}

// Composite Checkered Checkpoint / Racing Arch
export function buildCheckpointArch(accentHex = 0x2563eb): THREE.Group {
  const arch = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.3,
    metalness: 0.25,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.65,
  });

  [-5.9, 5.9].forEach((x) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.8), accentMat);
    base.position.set(x, 0.225, 0);
    arch.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 5.2, 12), pillarMat);
    pillar.position.set(x, 2.8, 0);
    pillar.castShadow = true;
    arch.add(pillar);
  });

  const banner = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.95, 0.42), accentMat);
  banner.position.set(0, 5.25, 0);
  banner.castShadow = true;
  arch.add(banner);

  // Checkered trim blocks along banner
  for (let i = -5; i <= 5; i++) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.26, 0.46),
      i % 2 === 0 ? pillarMat : goldMat
    );
    tile.position.set(i * 1.05, 5.62, 0);
    arch.add(tile);
  }

  return arch;
}

// Golden Floating Summit Crown for Cloud Stairs 3D
export function buildFloatingCrown(): THREE.Group {
  const group = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    metalness: 0.78,
    roughness: 0.18,
    emissive: 0xd97706,
    emissiveIntensity: 0.25,
  });
  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.15,
    roughness: 0.08,
    clearcoat: 1.0,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
  });

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 10, 24), goldMat);
  band.rotation.x = Math.PI / 2;
  group.add(band);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), goldMat);
    spike.position.set(Math.cos(a) * 0.58, 0.32, Math.sin(a) * 0.58);
    group.add(spike);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), gemMat);
    gem.position.set(Math.cos(a) * 0.62, 0.62, Math.sin(a) * 0.62);
    group.add(gem);
  }

  const centerStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), gemMat);
  centerStar.position.y = 0.42;
  group.add(centerStar);

  return group;
}

// Composite Fluffy Cloud Island (5 spheres)
export function buildCloudCluster(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
  });
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1.2],
    [-1.1, -0.15, 0.2, 0.9],
    [1.1, -0.15, -0.15, 0.95],
    [0.4, 0.35, 0.35, 0.75],
    [-0.5, 0.25, -0.35, 0.72],
  ];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cloudMat);
    m.position.set(x, y, z);
    group.add(m);
  }
  group.scale.setScalar(scale);
  return group;
}

// Composite Roadside Green Gas Station Canopy (for Knowledge Race)
export function buildGasStation(): THREE.Group {
  const g = new THREE.Group();
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });

  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 2.0), whiteMat);
  pad.position.y = 0.06;
  g.add(pad);

  [-0.95, 0.95].forEach((x) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), whiteMat);
    pillar.position.set(x, 1.16, 0);
    g.add(pillar);
  });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 2.1), greenMat);
  roof.position.y = 2.38;
  roof.castShadow = true;
  g.add(roof);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.12, 2.14), yellowMat);
  stripe.position.y = 2.24;
  g.add(stripe);

  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.42), yellowMat);
  pump.position.set(0, 0.62, 0);
  g.add(pump);

  return g;
}

// Composite Water Refreshment Station (for Health Festival 3D)
export function buildWaterStation(): THREE.Group {
  const g = new THREE.Group();
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.75 });
  const bottleMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0.15,
    roughness: 0.12,
    clearcoat: 0.9,
  });

  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 0.9), woodMat);
  table.position.set(0, 0.425, 0);
  g.add(table);

  [-1.05, 1.05].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), woodMat);
    post.position.set(x, 1.15, 0);
    g.add(post);
  });

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.28, 1.4), blueMat);
  canopy.position.set(0, 2.32, 0);
  canopy.castShadow = true;
  g.add(canopy);

  // Sparkling water bottles lined on table
  [-0.7, -0.25, 0.25, 0.7].forEach((bx) => {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.38, 10), bottleMat);
    bottle.position.set(bx, 1.04, 0);
    g.add(bottle);
  });

  return g;
}
