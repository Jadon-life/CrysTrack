import * as THREE from 'three';

export interface RockerPalette {
  surfaceGlass: string;
  surfaceStrong: string;
  border: string;
  primary: string;
}

export interface Rocker3D {
  update: (light: boolean, reducedMotion: boolean, palette: RockerPalette) => void;
  dispose: () => void;
}

function color(value: string, fallback: number) {
  const result = new THREE.Color(fallback);
  try { result.setStyle(value); } catch { /* retain fallback */ }
  return result;
}

/**
 * Builds a compact physical rocker once and renders only on demand.
 * No input is captured here; the accessible DOM button owns interaction.
 */
export function mountRocker(
  canvas: HTMLCanvasElement,
  initialLight: boolean,
  initialPalette: RockerPalette,
): Rocker3D {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(23, 2.5, 0.1, 20);
  camera.position.set(0, 0.68, 3.72);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0x78b7d7, 0x06101f, 1.85);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0x8fc9e5, 2.25);
  key.position.set(-2.2, 3.2, 4.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x2387c3, 2.55);
  rim.position.set(2.7, 1.0, -1.5);
  scene.add(rim);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  function pill(width: number, height: number, depth: number) {
    const radius = height * .48;
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 1, bevelEnabled: true, bevelSegments: 5,
      bevelThickness: .065, bevelSize: .058, curveSegments: 14,
    });
    geometries.push(geometry);
    return geometry;
  }

  function physical(initial: number, metalness: number, roughness: number, clearcoat = .32) {
    const material = new THREE.MeshPhysicalMaterial({
      color: initial,
      metalness,
      roughness,
      clearcoat,
      clearcoatRoughness: .16,
      side: THREE.DoubleSide,
    });
    materials.push(material);
    return material;
  }

  function capsule(width: number, height: number, depth: number, material: THREE.Material) {
    return new THREE.Mesh(pill(width, height, depth), material);
  }

  const baseMat = physical(0x0d2941, .46, .34);
  const pitMat = physical(0x071727, .25, .43, .18);
  const edgeMat = physical(0x167eae, .56, .25);
  const faceMat = physical(0x173a55, .38, .27, .48);
  const seamMat = physical(0x2e7399, .42, .34, .22);
  const iconMat = new THREE.MeshStandardMaterial({
    color: 0x64ccff, emissive: 0x155f88, emissiveIntensity: .22,
    metalness: .18, roughness: .34,
  });
  materials.push(iconMat);
  const inactiveIconMat = new THREE.MeshStandardMaterial({
    color: 0x7695a9, emissive: 0x0a1e31, emissiveIntensity: .04,
    metalness: .16, roughness: .42,
  });
  materials.push(inactiveIconMat);

  const housing = new THREE.Group();
  housing.rotation.x = -0.04;
  scene.add(housing);

  const base = capsule(3.08, .94, .19, baseMat);
  base.position.z = -.34;
  housing.add(base);
  const pit = capsule(2.89, .78, .10, pitMat);
  pit.position.z = -.13;
  housing.add(pit);
  const edge = capsule(2.84, .75, .09, edgeMat);
  edge.position.z = -.035;
  housing.add(edge);

  // Noticeably thick rocker: when it pivots, one side physically rises and
  // its opposite wall becomes visible instead of reading as a flat toggle.
  const pivot = new THREE.Group();
  pivot.position.z = .055;
  housing.add(pivot);
  const face = capsule(2.79, .72, .245, faceMat);
  pivot.add(face);

  const seamGeo = new THREE.BoxGeometry(.022, .56, .025);
  geometries.push(seamGeo);
  const seam = new THREE.Mesh(seamGeo, seamMat);
  seam.position.z = .322;
  pivot.add(seam);

  // Sun: a raised circular centre with eight tiny hardware rays.
  const sunGroup = new THREE.Group();
  sunGroup.position.set(-.71, 0, .338);
  pivot.add(sunGroup);
  const sunDiscGeo = new THREE.CylinderGeometry(.105, .105, .026, 24);
  geometries.push(sunDiscGeo);
  const sunDisc = new THREE.Mesh(sunDiscGeo, iconMat);
  sunDisc.rotation.x = Math.PI / 2;
  sunGroup.add(sunDisc);
  for (let index = 0; index < 8; index += 1) {
    const rayGeo = new THREE.BoxGeometry(.045, .016, .020);
    geometries.push(rayGeo);
    const ray = new THREE.Mesh(rayGeo, iconMat);
    const angle = index * Math.PI / 4;
    ray.position.set(Math.cos(angle) * .16, Math.sin(angle) * .16, 0);
    ray.rotation.z = angle;
    sunGroup.add(ray);
  }

  // Moon: a raised C-shaped torus reads as a crescent at navigation size.
  const moonGeo = new THREE.TorusGeometry(.115, .034, 10, 30, Math.PI * 1.52);
  geometries.push(moonGeo);
  const moon = new THREE.Mesh(moonGeo, inactiveIconMat);
  moon.position.set(.70, .005, .342);
  moon.rotation.z = .78;
  pivot.add(moon);

  let disposed = false;
  let frame = 0;
  let currentAngle = initialLight ? -.255 : .255;
  pivot.rotation.y = currentAngle;
  pivot.rotation.x = initialLight ? .105 : -.105;

  const draw = () => { if (!disposed) renderer.render(scene, camera); };
  const resize = () => {
    if (disposed) return;
    const container = canvas.parentElement;
    if (!container) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement || canvas);
  window.addEventListener('resize', resize);

  function applyPalette(palette: RockerPalette, light: boolean) {
    const glass = color(palette.surfaceGlass, 0x103243);
    const strong = color(palette.surfaceStrong, 0x071927);
    const border = color(palette.border, 0x9cc8e3);
    const primary = color(palette.primary, 0x38a8ff);

    // Match the existing weather indicator: quiet glass surface, normal
    // CrysTrack border, and primary colour only for the active symbol.
    baseMat.color.copy(strong);
    pitMat.color.copy(strong).multiplyScalar(.68);
    edgeMat.color.copy(border).lerp(strong, .48);
    faceMat.color.copy(glass).lerp(strong, light ? .18 : .27);
    seamMat.color.copy(border).lerp(strong, .38);
    iconMat.color.copy(primary).lerp(glass, .18);
    iconMat.emissive.copy(primary).multiplyScalar(.06);
    inactiveIconMat.color.copy(glass).lerp(strong, .38);
    inactiveIconMat.emissive.copy(strong).multiplyScalar(.03);

    // Selected side gets the brighter embedded symbol.
    sunGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) object.material = light ? iconMat : inactiveIconMat;
    });
    moon.material = light ? inactiveIconMat : iconMat;
    rim.color.copy(primary).lerp(glass, .42);
    key.color.copy(border).lerp(glass, .58);
  }

  function update(light: boolean, reducedMotion: boolean, palette: RockerPalette) {
    applyPalette(palette, light);
    window.cancelAnimationFrame(frame);
    const target = light ? -.255 : .255;
    const targetTilt = light ? .105 : -.105;
    const from = currentAngle;
    const tiltFrom = pivot.rotation.x;
    if (reducedMotion || Math.abs(target - from) < .001) {
      pivot.rotation.y = currentAngle = target;
      pivot.rotation.x = targetTilt;
      draw();
      return;
    }
    const start = performance.now();
    const duration = 270;
    const tick = (now: number) => {
      if (disposed) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      pivot.rotation.y = currentAngle = from + (target - from) * eased;
      pivot.rotation.x = tiltFrom + (targetTilt - tiltFrom) * eased;
      draw();
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
  }

  applyPalette(initialPalette, initialLight);
  resize();

  return {
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    },
  };
}
