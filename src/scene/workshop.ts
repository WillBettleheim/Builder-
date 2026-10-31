// Set dressing around the cutting mat: a wooden desk, a working desk lamp,
// a mug, a solder spool and a parts tray. Decorative only (never picked or wired).
import * as THREE from 'three';

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

/** A square rod from a to b. */
function beam(a: THREE.Vector3, b: THREE.Vector3, size: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const o = mesh(new THREE.BoxGeometry(size, len, size), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A warm wood-grain texture for the desk top. */
export function woodTexture(dark: boolean): THREE.CanvasTexture {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const base = dark ? [58, 42, 32] : [168, 124, 84];
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, W, H);
  // planks
  for (let p = 0; p < 4; p++) {
    const y0 = (p * H) / 4;
    const tint = (Math.random() - 0.5) * 18;
    g.fillStyle = `rgba(${base[0] + tint},${base[1] + tint * 0.7},${base[2] + tint * 0.5},0.6)`;
    g.fillRect(0, y0, W, H / 4);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y0, W, 3);
  }
  // grain lines
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * H;
    const len = 120 + Math.random() * 500;
    const x = Math.random() * W;
    const wobble = (Math.random() - 0.5) * 6;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,24,14' : '220,180,130'},${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + len / 3, y + wobble, x + (2 * len) / 3, y - wobble, x + len, y + wobble / 2);
    g.stroke();
  }
  // a few knots
  for (let k = 0; k < 6; k++) {
    const x = Math.random() * W, y = Math.random() * H;
    for (let r = 14; r > 2; r -= 3) {
      g.strokeStyle = `rgba(40,24,14,${0.08 + (14 - r) * 0.012})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, r * 2.4, r, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Add the props; returns the lamp's light so quality settings can dim it. */
export function buildWorkshop(scene: THREE.Scene): { lampLight: THREE.SpotLight; bulb: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  group.name = 'workshop';

  // --- articulated desk lamp, off the mat's back-left corner ---
  const lamp = new THREE.Group();
  const LAMP = new THREE.Vector3(-22, 0, -48);
  lamp.position.copy(LAMP);
  const black = mat('#1e2024', { metalness: 0.4, roughness: 0.4 });
  const teal = mat('#16857f', { metalness: 0.3, roughness: 0.35 });
  lamp.add(mesh(new THREE.CylinderGeometry(6, 7, 1.6, 40), black, 0, 0.8, 0));
  lamp.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 16), teal, 0, 2.4, 0));
  const elbow = new THREE.Vector3(7.8, 23.4, 7.8);
  const headPos = new THREE.Vector3(20.5, 29.6, 20.5);
  lamp.add(beam(new THREE.Vector3(0, 3.4, 0), elbow, 1.2, teal));
  lamp.add(mesh(new THREE.SphereGeometry(1.4, 16, 12), black, elbow.x, elbow.y, elbow.z));
  lamp.add(beam(elbow, headPos, 1.1, teal));
  const head = new THREE.Group();
  head.position.set(20.5, 29.6, 20.5);
  const shade = mesh(new THREE.ConeGeometry(5, 7, 32, 1, true), teal, 0, 0, 0);
  shade.rotation.x = Math.PI / 2;
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  head.add(shade);
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 6 });
  head.add(mesh(new THREE.SphereGeometry(1.8, 20, 14), bulb, 0, 0, 1.4));
  lamp.add(head);
  lamp.updateMatrixWorld(true);
  head.lookAt(8, 0, 6); // shade aims at the middle of the mat
  group.add(lamp);

  // warm pool of light on the mat from the lamp
  const lampLight = new THREE.SpotLight('#ffd9a0', 900, 120, 0.55, 0.6, 2);
  lampLight.position.copy(LAMP).add(headPos);
  lampLight.target.position.set(4, 0, 8);
  lampLight.castShadow = false;
  group.add(lampLight, lampLight.target);

  // --- coffee mug, off the mat's back-right corner ---
  const mug = new THREE.Group();
  mug.position.set(46, 0, -46);
  const mugMat = mat('#f1ede6', { roughness: 0.25 });
  mug.add(mesh(new THREE.CylinderGeometry(4, 3.7, 9, 40, 1, true), mugMat, 0, 4.5, 0));
  mug.add(mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.5, 40), mugMat, 0, 0.25, 0));
  const coffee = mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.2, 40), mat('#3a2216', { roughness: 0.15 }), 0, 7.8, 0);
  mug.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(2.4, 0.6, 12, 24, Math.PI), mugMat, 4, 4.6, 0);
  handle.rotation.z = -Math.PI / 2;
  mug.add(handle);
  mug.add(mesh(new THREE.CylinderGeometry(4.02, 4.02, 2, 40, 1, true), mat('#16857f', { roughness: 0.3 }), 0, 5, 0));
  (mug.children[mug.children.length - 1] as THREE.Mesh).material = mat('#16857f', { roughness: 0.3, side: THREE.DoubleSide });
  group.add(mug);

  // --- solder spool on its stand, off the front-left corner ---
  const spool = new THREE.Group();
  spool.position.set(-42, 0, -46);
  spool.add(mesh(new THREE.BoxGeometry(10, 1, 6), black, 0, 0.5, 0));
  for (const x of [-3.6, 3.6]) spool.add(mesh(new THREE.BoxGeometry(0.8, 6, 0.8), black, x, 3.5, 0));
  const reel = new THREE.Group();
  reel.position.set(0, 6, 0);
  reel.rotation.z = Math.PI / 2;
  const reelMat = mat('#c43a2f', { roughness: 0.4 });
  reel.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 32), reelMat, 0, -2.4, 0));
  reel.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 32), reelMat, 0, 2.4, 0));
  reel.add(mesh(new THREE.CylinderGeometry(2, 2, 4.4, 32), mat('#c9ccd2', { metalness: 0.9, roughness: 0.25 }), 0, 0, 0));
  spool.add(reel);
  const strand = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4, 2), new THREE.Vector3(1, 1.2, 6), new THREE.Vector3(4, 0.2, 9), new THREE.Vector3(9, 0.15, 10)]);
  spool.add(mesh(new THREE.TubeGeometry(strand, 20, 0.12, 6), mat('#c9ccd2', { metalness: 0.9, roughness: 0.25 })));
  group.add(spool);

  // --- parts tray with little compartments, off the front-right corner ---
  const tray = new THREE.Group();
  tray.position.set(66, 0, -45);
  tray.rotation.y = -0.25;
  const trayMat = mat('#2b2f36', { roughness: 0.6 });
  tray.add(mesh(new THREE.BoxGeometry(16, 0.6, 11), trayMat, 0, 0.3, 0));
  for (const x of [-8, -2.7, 2.7, 8]) tray.add(mesh(new THREE.BoxGeometry(0.4, 2, 11), trayMat, x, 1.3, 0));
  for (const z of [-5.5, 0, 5.5]) tray.add(mesh(new THREE.BoxGeometry(16, 2, 0.4), trayMat, 0, 1.3, z));
  const bits = [['#ff3b30', 0], ['#34c759', 1], ['#2f7bff', 2], ['#e8c06a', 3], ['#ffc107', 4], ['#e9e6df', 5]] as const;
  bits.forEach(([color, i]) => {
    const cx = -5.4 + (i % 3) * 5.4, cz = i < 3 ? -2.7 : 2.7;
    for (let k = 0; k < 7; k++) {
      const b = mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), mat(color, { roughness: 0.4 }), cx + (Math.random() - 0.5) * 3, 1.0 + Math.random() * 0.4, cz + (Math.random() - 0.5) * 3);
      b.rotation.set(Math.random() * 3, Math.random() * 3, Math.PI / 2);
      tray.add(b);
    }
  });
  group.add(tray);

  scene.add(group);
  return { lampLight, bulb };
}
