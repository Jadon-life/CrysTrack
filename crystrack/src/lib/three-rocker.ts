import * as THREE from 'three';

export interface Rocker3D {
  update: (on: boolean, reducedMotion: boolean) => void;
  dispose: () => void;
}

/**
 * Builds the Three.js scene ONCE and renders on demand.
 * The scene is presentation-only: an accessible DOM button receives input.
 */
export function mountRocker(canvas: HTMLCanvasElement, initialOn: boolean): Rocker3D {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 2.5, 0.1, 20);
  camera.position.set(0, 0.45, 3.60);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xe3f7ff, 0x091a32, 3.2));
  const key = new THREE.DirectionalLight(0xffffff, 5.0);
  key.position.set(-2, 3.2, 4);
  scene.add(key);
  const edge = new THREE.DirectionalLight(0x48caff, 3.6);
  edge.position.set(2.8, 1.3, -1.7);
  scene.add(edge);
  const bounce = new THREE.PointLight(0x95e6ff, 4.4, 7);
  bounce.position.set(1.2, -1.5, 3);
  scene.add(bounce);

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
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 1, bevelEnabled: true, bevelSegments: 4,
      bevelThickness: .055, bevelSize: .052, curveSegments: 12,
    });
    geometries.push(geo);
    return geo;
  }

  function material(color: number, metalness: number, roughness: number) {
    const mat = new THREE.MeshPhysicalMaterial({
      color, metalness, roughness, clearcoat: 0.40,
      clearcoatRoughness: 0.14, side: THREE.DoubleSide,
    });
    materials.push(mat);
    return mat;
  }

  function capsule(width: number, height: number, depth: number, color: number, metalness: number, roughness: number) {
    return new THREE.Mesh(pill(width, height, depth), material(color, metalness, roughness));
  }

  const housing = new THREE.Group();
  scene.add(housing);
  const metalBase = capsule(3.05, 0.91, 0.12, 0x21577b, .58, .29);
  metalBase.position.z = -.26;
  housing.add(metalBase);
  const pit = capsule(2.89, .77, .045, 0x092038, .32, .40);
  pit.position.z = -.115;
  housing.add(pit);
  const cyanEdge = capsule(2.84, .76, .07, 0x1377a6, .56, .24);
  cyanEdge.position.z = -.015;
  housing.add(cyanEdge);

  const pivot = new THREE.Group();
  pivot.position.z = .08;
  housing.add(pivot);
  const face = capsule(2.81, .74, .14, 0xd4e5f2, .22, .23);
  pivot.add(face);

  // Tiny raised dividing seam catches actual light as the rocker tilts.
  const seamGeo = new THREE.BoxGeometry(.018, .59, .014);
  geometries.push(seamGeo);
  const seam = new THREE.Mesh(seamGeo, material(0x7896ad, .35, .42));
  seam.position.z = .205;
  pivot.add(seam);
  const bevelGlintGeo = new THREE.BoxGeometry(2.5, .012, .007);
  geometries.push(bevelGlintGeo);
  const glint = new THREE.Mesh(bevelGlintGeo, material(0xf8fdff, .02, .18));
  glint.position.set(0, .265, .208);
  pivot.add(glint);

  // ON/OFF are printed on the physical face itself, not stuck on a static
  // HTML layer. Their perspective follows the rocker and its pivot.
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 768;
  labelCanvas.height = 192;
  const context = labelCanvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '800 78px Arial, sans-serif';
    context.fillStyle = '#243b4e';
    context.fillText('ON', 190, 100);
    context.fillText('OFF', 576, 100);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const labelGeo = new THREE.PlaneGeometry(2.55, .60);
  geometries.push(labelGeo);
  const labelMat = new THREE.MeshBasicMaterial({
    map: labelTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  materials.push(labelMat);
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.z = .216;
  pivot.add(labelMesh);

  let disposed = false;
  let raf = 0;
  let currentAngle = initialOn ? -.19 : .19;
  pivot.rotation.y = currentAngle;
  pivot.rotation.x = initialOn ? .075 : -.075;
  const draw = () => { if (!disposed) renderer.render(scene, camera); };
  const resize = () => {
    const container = canvas.parentElement;
    if (!container || disposed) return;
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

  function update(on: boolean, reducedMotion: boolean) {
    window.cancelAnimationFrame(raf);
    const target = on ? -.19 : .19;
    const targetTilt = on ? .075 : -.075;
    const from = currentAngle;
    const tiltFrom = pivot.rotation.x;
    if (reducedMotion || Math.abs(from - target) < .001) {
      pivot.rotation.y = currentAngle = target;
      pivot.rotation.x = targetTilt;
      draw();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      if (disposed) return;
      const t = Math.min(1, (now - start) / 250);
      const ease = 1 - (1 - t) ** 3;
      pivot.rotation.y = currentAngle = from + (target - from) * ease;
      pivot.rotation.x = tiltFrom + (targetTilt - tiltFrom) * ease;
      draw();
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
  }
  resize();

  return {
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      labelTexture.dispose();
      renderer.dispose();
    },
  };
}
