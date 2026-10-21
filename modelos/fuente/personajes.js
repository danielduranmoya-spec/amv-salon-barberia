/* Personajes de AMV Salón barbería, modelados por código a partir de las láminas de referencia.
   Estilo dibujo animado años 30: formas redondeadas, contorno de tinta (casco invertido) y colores planos.
   Cada personaje tiene articulaciones con nombre para animarlo desde la web:
   cuerpo · cabeza · brazo_izq/der · antebrazo_izq/der · pierna_izq/der  (mirando hacia +Z, pies en y = 0). */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ───── Materiales y texturas ───── */
function mat(name, color, rough = 0.8, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ name, color: new THREE.Color(color), roughness: rough, metalness: metal, ...extra });
}
const ink = () => new THREE.MeshBasicMaterial({ name: 'tinta', color: new THREE.Color('#1c1611') });
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}
function worn(base, light, dark, seed, n = 900) {
  return canvasTex(512, 512, (g, w, h) => {
    const R = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.06 + R() * 0.08; g.fillStyle = R() < 0.5 ? light : dark; g.beginPath(); g.ellipse(R() * w, R() * h, 20 + R() * 60, 10 + R() * 40, R() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < n; i++) { g.globalAlpha = 0.25 + R() * 0.5; g.fillStyle = R() < 0.6 ? light : dark; const s = 0.6 + R() * 2.2; g.fillRect(R() * w, R() * h, s, s); }
    g.globalAlpha = 1;
  });
}
function stripes(a, b) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    for (let i = -h; i < w + h; i += 44) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i + 22 - h, h); g.lineTo(i - h, h); g.closePath(); g.fill(); }
  });
}

/* ───── Geometría ───── */
function prep(g) {
  if (g.index === null) g = mergeVertices(g, 1e-5);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {}; g.clearGroups();
  return g;
}
function smooth(g) { g.deleteAttribute('normal'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); return g; }
const M4 = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...(typeof s === 'number' ? [s, s, s] : s)));
const ell = (rx, ry, rz, w = 32, h = 22) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
function lathe(pts, segs = 44, phiStart = 0, phiLen = Math.PI * 2) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLen); }
function profileR(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) { const [r0, y0] = pts[i], [r1, y1] = pts[i + 1]; if (y >= y0 && y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0 || 1)); }
  return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
}
// tubo de radio variable a lo largo de una curva (mechones, bigotes, correas, cejas)
function tube(points, rad, segs = 18, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(...p))));
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const rf = typeof rad === 'function' ? rad : () => rad;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), r = rf(t), N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, n = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r); nor.push(n.x, n.y, n.z); uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // tapas redondeadas en los extremos gruesos
  const parts = [g];
  [0, 1].forEach((t) => { const r = rf(t); if (r > 0.004) { const s = new THREE.SphereGeometry(r, 12, 8); const p = curve.getPointAt(t); s.translate(p.x, p.y, p.z); parts.push(s); } });
  return parts.length > 1 ? mergeGeometries(parts.map(prep)) : g;
}
const taper = (r0, r1 = 0.0015, pow = 0.8) => (t) => lerp(r1, r0, Math.pow(1 - t, pow));
// pieza plana proyectada sobre una superficie z = surf(x, y)
function decal(shapes, depth, surf, eps = 0.002, curveSegments = 28) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, surf(p.getX(i), p.getY(i)) + eps + p.getZ(i));
  return smooth(g);
}
function remapUV(g) {
  g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  return g;
}
function shape(pts, close = true) { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]); if (close) s.closePath(); return s; }
function ovalShape(cx, cy, rx, ry) { const s = new THREE.Shape(); s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false); return s; }
// pupila con el «corte de tarta» típico de los dibujos de los años 30
function pieShape(cx, cy, rx, ry) { const s = new THREE.Shape(); s.moveTo(cx, cy); s.absellipse(cx, cy, rx, ry, 1.2, 0.42 + Math.PI * 2, false); s.lineTo(cx, cy); return s; }
// elipsoide de cabeza con mandíbula estrecha; devuelve geometría y la función de superficie frontal
function headShape(cx, cy, cz, rx, ry, rz, jaw = 0.28, chin = 0.12) {
  const g = new THREE.SphereGeometry(1, 48, 34), p = g.attributes.position;
  const kx = (u) => (u < 0 ? 1 - jaw * Math.pow(-u, 1.3) : 1), kz = (u) => (u < 0 ? 1 - chin * -u : 1);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, cx + x * rx * kx(y), cy + y * ry, cz + z * rz * kz(y)); }
  g.computeVertexNormals();
  const surf = (X, Y) => { const u = (Y - cy) / ry, x = (X - cx) / (rx * kx(u)); return cz + rz * kz(u) * Math.sqrt(Math.max(0, 1 - x * x - u * u)); };
  const deform = (s) => { // misma forma escalada (gorro de pelo, interior)
    const h = new THREE.SphereGeometry(1, 48, 34), q = h.attributes.position;
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), y = q.getY(i), z = q.getZ(i); q.setXYZ(i, cx + x * rx * s * kx(y), cy + y * ry * s, cz + z * rz * s * kz(y)); }
    return h;
  };
  return { g, surf, deform, cx, cy, cz, rx, ry, rz };
}
const ellSurf = (cx, cy, cz, rx, ry, rz) => (X, Y) => { const x = (X - cx) / rx, y = (Y - cy) / ry; return cz + rz * Math.sqrt(Math.max(0, 1 - x * x - y * y)); };
// pelo que cubre el cráneo por encima de una línea de nacimiento que depende del ángulo
function hairCap(H, grow, line) {
  const out = H.deform(grow), inn = H.deform(0.95), p = out.attributes.position, q = inn.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ang = Math.abs(Math.atan2(x - H.cx, z - H.cz));
    const w = sstep(line(ang) - 0.012, line(ang) + 0.018, y);
    p.setXYZ(i, lerp(q.getX(i), x, w), lerp(q.getY(i), y, w), lerp(q.getZ(i), z, w));
  }
  out.computeVertexNormals();
  return out;
}
const pw = (pts) => (a) => { for (let i = 0; i < pts.length - 1; i++) if (a <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], sstep(pts[i][0], pts[i + 1][0], a)); return pts[pts.length - 1][1]; };
function tuftPath(start, dir, len, curl) {
  const d = dir.clone().normalize();
  return [start.clone(), start.clone().addScaledVector(d, len * 0.38), start.clone().addScaledVector(d, len * 0.75).addScaledVector(curl, len * 0.22), start.clone().addScaledVector(d, len * 0.92).addScaledVector(curl, len * 0.55)];
}

/* ───── Montaje: piezas agrupadas por articulación y material, con contorno de tinta ───── */
class Rig {
  constructor(name) { this.root = new THREE.Group(); this.root.name = name; this.j = {}; this.parts = {}; this.ink = ink(); this.joint('cuerpo', null, [0, 0, 0]); }
  joint(name, parent, pos, rot = [0, 0, 0]) {
    const g = new THREE.Group(); g.name = name; g.position.set(...pos); g.rotation.set(...rot);
    (parent ? this.j[parent] : this.root).add(g); this.j[name] = g; this.parts[name] = []; return g;
  }
  // world = true: la geometría viene en coordenadas del personaje; si no, en las de la articulación
  add(joint, geo, material, { m = null, outline = 0.006, key = null, world = true } = {}) {
    let g = prep(geo.clone());
    if (m) g.applyMatrix4(m);
    if (world) { this.root.updateMatrixWorld(true); g.applyMatrix4(this.j[joint].matrixWorld.clone().invert()); }
    this.parts[joint].push({ g, material, outline, key: key || material.name });
    return this;
  }
  hull(g, t) {
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, acc = new Map();
    const key = (i) => `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    for (let i = 0; i < n; i++) { const k = key(i); let a = acc.get(k); if (!a) acc.set(k, (a = [0, 0, 0])); a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); }
    const h = g.clone(), hp = h.attributes.position, hn = h.attributes.normal;
    for (let i = 0; i < n; i++) {
      const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      hp.setXYZ(i, pos.getX(i) + (a[0] / l) * t, pos.getY(i) + (a[1] / l) * t, pos.getZ(i) + (a[2] / l) * t);
      hn.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    }
    const ix = h.index.array; for (let i = 0; i < ix.length; i += 3) { const s = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = s; }
    return h;
  }
  build() {
    let tris = 0;
    for (const [jn, list] of Object.entries(this.parts)) {
      const groups = new Map(), hulls = [];
      list.forEach((p) => {
        if (!groups.has(p.key)) groups.set(p.key, { material: p.material, geos: [] });
        groups.get(p.key).geos.push(p.g);
        if (p.outline > 0) hulls.push(this.hull(p.g, p.outline));
      });
      for (const [k, { material, geos }] of groups) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material); mesh.name = `${jn}_${k}`; this.j[jn].add(mesh); tris += mesh.geometry.index.count / 3;
      }
      if (hulls.length) { const mesh = new THREE.Mesh(mergeGeometries(hulls), this.ink); mesh.name = `${jn}_tinta`; this.j[jn].add(mesh); tris += mesh.geometry.index.count / 3; }
    }
    this.root.userData.triangulos = Math.round(tris);
    return this.root;
  }
}

/* ───── Piezas comunes ───── */
function hand(R, joint, y, mat, { glove = false, s = 1, outline = 0.005 } = {}) {
  const k = glove ? 1.12 : 1;
  R.add(joint, ell(0.036 * k, 0.062 * k, 0.058 * k), mat, { m: M4([0, y, 0]), world: false, outline });
  const fy = y - 0.058 * k;
  [[0.032, 0.1], [0.0, 0], [-0.032, -0.1]].forEach(([z, rx], i) => {
    const len = (i === 1 ? 0.062 : 0.054) * k;
    R.add(joint, new THREE.CapsuleGeometry(0.019 * k, len, 6, 12), mat, { m: M4([s * 0.004, fy - len * 0.45, z * k], [rx, 0, s * 0.05]), world: false, outline });
  });
  R.add(joint, new THREE.CapsuleGeometry(0.02 * k, 0.04 * k, 6, 12), mat, { m: M4([-s * 0.012, y - 0.01, 0.06 * k], [0.95, 0, -s * 0.25]), world: false, outline });
}
function eye(R, joint, H, ex, ey, rx, ry, rz, white, black, look = [0, 0]) {
  const ez = H.surf(ex, ey) - rz * 0.45;
  R.add(joint, ell(rx, ry, rz), white, { m: M4([ex, ey, ez]), outline: 0.0035 });
  const es = ellSurf(ex, ey, ez, rx, ry, rz);
  R.add(joint, decal(pieShape(ex + look[0], ey + look[1], rx * 0.5, ry * 0.58), 0.003, es, 0.0008), black, { outline: 0 });
}

/* ═════════════ PELUQUERO ═════════════ */
export function peluquero() {
  const R = new Rig('peluquero');
  const piel = mat('piel', '#f4e9d3', 0.72), camisa = mat('camisa', '#d9d8d1', 0.85), chaleco = mat('chaleco', '#283146', 0.78);
  const pantalon = mat('pantalon', '#232a3a', 0.85), zapato = mat('zapato', '#3a2418', 0.45), suela = mat('suela', '#1c120c', 0.7);
  const pelo = mat('pelo', '#1d1a19', 0.38), blanco = mat('ojo', '#fbf8f1', 0.3), negro = mat('negro', '#131213', 0.4);
  const boca = mat('boca', '#2a1212', 0.6), lengua = mat('lengua', '#b8483f', 0.6), dientes = mat('dientes', '#fffdf6', 0.35);
  const delantal = mat('delantal', '#ffffff', 0.92, 0, { map: worn('#8c6b48', '#b39570', '#5e4429', 7) });
  const correa = mat('correa', '#654730', 0.6), metal = mat('metal', '#d3d6da', 0.22, 1), laton = mat('laton', '#c79a4a', 0.3, 1);
  const pajarita = mat('pajarita', '#ffffff', 0.6, 0, { map: stripes('#b3393a', '#283146') });
  const peine = mat('peine', '#4a2c1c', 0.45), marfil = mat('marfil', '#eee4cd', 0.45), cerdas = mat('cerdas', '#d8ccb1', 0.95), spray = mat('spray', '#a6d3e3', 0.18);

  R.joint('cabeza', 'cuerpo', [0, 1.27, 0]);
  R.joint('brazo_der', 'cuerpo', [-0.205, 1.19, 0], [0.02, 0, -0.17]);
  R.joint('brazo_izq', 'cuerpo', [0.205, 1.19, 0], [0.02, 0, 0.17]);
  R.joint('antebrazo_der', 'brazo_der', [0, -0.245, 0], [-0.1, 0, 0.04]);
  R.joint('antebrazo_izq', 'brazo_izq', [0, -0.245, 0], [-0.1, 0, -0.04]);
  R.joint('pierna_der', 'cuerpo', [-0.085, 0.9, 0]);
  R.joint('pierna_izq', 'cuerpo', [0.085, 0.9, 0]);

  // piernas y zapatos
  for (const s of [-1, 1]) {
    const j = s < 0 ? 'pierna_der' : 'pierna_izq', o = { world: false };
    R.add(j, lathe([[0, -0.795], [0.075, -0.79], [0.071, -0.74], [0.069, -0.6], [0.073, -0.4], [0.082, -0.16], [0.09, 0.0], [0, 0.04]], 32), pantalon, { ...o, m: M4([0, 0, 0], [0, 0, 0], [1, 1, 0.95]) });
    const sh = ell(0.072, 0.068, 0.138, 36, 24), sp = sh.attributes.position;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < -0.04) sp.setY(i, -0.04);
    sh.computeVertexNormals();
    R.add(j, sh, zapato, { ...o, m: M4([s * 0.004, -0.86, 0.045]) });
    R.add(j, ell(0.074, 0.011, 0.14, 32, 12), suela, { ...o, m: M4([s * 0.004, -0.893, 0.045]), outline: 0.004 });
  }
  // tronco: cadera, camisa, chaleco y cuello
  R.add('cuerpo', ell(0.175, 0.11, 0.125), pantalon, { m: M4([0, 0.93, 0]) });
  const torso = [[0, 0.86], [0.17, 0.87], [0.18, 0.95], [0.195, 1.05], [0.2, 1.12], [0.19, 1.19], [0.152, 1.235], [0.07, 1.262], [0, 1.27]];
  R.add('cuerpo', lathe(torso), camisa, { m: M4([0, 0, 0], [0, 0, 0], [1, 1, 0.72]) });
  R.add('cuerpo', lathe([[0.176, 0.86], [0.187, 0.95], [0.201, 1.04]]), chaleco, { m: M4([0, 0, 0], [0, 0, 0], [1.035, 1, 0.76]), outline: 0.005 });
  R.add('cuerpo', lathe([[0.201, 1.04], [0.206, 1.12], [0.196, 1.19], [0.158, 1.236]], 44, 0.42, Math.PI * 2 - 0.84), chaleco, { m: M4([0, 0, 0], [0, 0, 0], [1.035, 1, 0.76]), outline: 0.005 });
  R.add('cuerpo', new THREE.CylinderGeometry(0.056, 0.06, 0.1, 28), piel, { m: M4([0, 1.28, 0]), outline: 0 });
  R.add('cuerpo', new THREE.TorusGeometry(0.063, 0.016, 12, 36), camisa, { m: M4([0, 1.262, 0.004], [Math.PI / 2 + 0.28, 0, 0]), outline: 0.004 });
  for (const s of [-1, 1]) R.add('cuerpo', new THREE.ConeGeometry(0.028, 0.06, 3), camisa, { m: M4([s * 0.032, 1.236, 0.07], [0.5, 0, s * 2.6]), outline: 0.003 });
  // pajarita de rayas
  const bowS = [shape([[0, 0], [-0.09, 0.038], [-0.098, -0.034], [0, 0]]), shape([[0, 0], [0.09, 0.038], [0.098, -0.034], [0, 0]])];
  const bowG = remapUV(new THREE.ExtrudeGeometry(bowS, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }));
  R.add('cuerpo', bowG, pajarita, { m: M4([0, 1.232, 0.073]), outline: 0.003 });
  R.add('cuerpo', ell(0.022, 0.025, 0.018), pajarita, { m: M4([0, 1.232, 0.1]), outline: 0.003 });

  // delantal envolvente
  const AR = 0.24, zf = (y) => (y > 0.95 ? 0.178 : lerp(0.178, 0.2, sstep(0.95, 0.455, y)));
  const apronS = new THREE.Shape();
  apronS.moveTo(-0.098, 1.212); apronS.lineTo(0.098, 1.212); apronS.lineTo(0.118, 0.975); apronS.quadraticCurveTo(0.125, 0.95, 0.18, 0.945);
  apronS.lineTo(0.183, 0.47); apronS.quadraticCurveTo(0.183, 0.455, 0.168, 0.455); apronS.lineTo(-0.168, 0.455); apronS.quadraticCurveTo(-0.183, 0.455, -0.183, 0.47);
  apronS.lineTo(-0.18, 0.945); apronS.quadraticCurveTo(-0.125, 0.95, -0.118, 0.975); apronS.closePath();
  const wrap = (g, extra = 0) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i) + extra, a = x / AR; p.setXYZ(i, (AR + z) * Math.sin(a), y, (AR + z) * Math.cos(a) - AR + zf(y)); } return smooth(g); };
  const apG = remapUV(new THREE.ExtrudeGeometry(apronS, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 12 }));
  apG.translate(0, 0, -0.005);
  R.add('cuerpo', wrap(apG), delantal, { outline: 0.005 });
  const apronSurf = (x, y) => (AR + 0.009) * Math.cos(x / AR) - AR + zf(y);
  const pocket = (s, depth = 0.005) => { const g = remapUV(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 })); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, (AR + 0.009 + p.getZ(i)) * Math.sin(x / AR), y, (AR + 0.009 + p.getZ(i)) * Math.cos(x / AR) - AR + zf(y)); } return smooth(g); };
  R.add('cuerpo', pocket(shape([[-0.046, 1.15], [0.046, 1.15], [0.046, 1.085], [0, 1.062], [-0.046, 1.085]])), delantal, { outline: 0.0025 });
  R.add('cuerpo', pocket(shape([[-0.155, 0.775], [0.155, 0.775], [0.152, 0.61], [-0.152, 0.61]])), delantal, { outline: 0.0025 });
  [-0.075, 0.0, 0.075].forEach((x) => R.add('cuerpo', tube([[x, 0.772, apronSurf(x, 0.772) + 0.007], [x, 0.69, apronSurf(x, 0.69) + 0.007], [x, 0.614, apronSurf(x, 0.614) + 0.007]], 0.0022, 6, 6), correa, { outline: 0 }));
  // utensilios asomando del bolsillo
  const tz = (x) => apronSurf(x, 0.77) - 0.004;
  [[-0.118, 0.818, 0.35], [-0.092, 0.832, -0.3]].forEach(([x, y, r]) => R.add('cuerpo', new THREE.TorusGeometry(0.017, 0.0048, 10, 24), metal, { m: M4([x, y, tz(x)], [0, 0.15, r]), outline: 0.0025 }));
  R.add('cuerpo', new THREE.BoxGeometry(0.012, 0.06, 0.005), metal, { m: M4([-0.103, 0.78, tz(-0.103)], [0, 0, 0.12]), outline: 0.002 });
  R.add('cuerpo', new THREE.BoxGeometry(0.03, 0.12, 0.006), peine, { m: M4([-0.042, 0.8, tz(-0.042)], [0, 0, -0.05]), outline: 0.0025 });
  for (let i = 0; i < 7; i++) R.add('cuerpo', new THREE.BoxGeometry(0.012, 0.0035, 0.0062), peine, { m: M4([-0.025 + Math.sin(-0.05) * 0, 0.765 + i * 0.012, tz(-0.03)], [0, 0, -0.05]), outline: 0 });
  R.add('cuerpo', lathe([[0, 0.74], [0.016, 0.74], [0.018, 0.78], [0.014, 0.8], [0.019, 0.81], [0, 0.812]], 20), marfil, { m: M4([0.018, 0, tz(0.018)]), outline: 0.0025 });
  R.add('cuerpo', ell(0.026, 0.034, 0.026), cerdas, { m: M4([0.018, 0.84, tz(0.018)]), outline: 0.0025 });
  R.add('cuerpo', lathe([[0, 0.72], [0.027, 0.72], [0.028, 0.83], [0.02, 0.855], [0.009, 0.865], [0.009, 0.88], [0, 0.88]], 22), spray, { m: M4([0.098, 0, tz(0.098) - 0.004]), outline: 0.0025 });
  R.add('cuerpo', new THREE.BoxGeometry(0.03, 0.026, 0.04), negro, { m: M4([0.098, 0.892, tz(0.098)]), outline: 0.0025 });
  R.add('cuerpo', new THREE.BoxGeometry(0.03, 0.01, 0.01), negro, { m: M4([0.122, 0.896, tz(0.098)]), outline: 0 });
  R.add('cuerpo', new THREE.BoxGeometry(0.008, 0.035, 0.01), negro, { m: M4([0.11, 0.87, tz(0.098) + 0.01], [0, 0, 0.3]), outline: 0 });
  // correas al cuello, remaches y lazada trasera
  R.add('cuerpo', tube([[-0.092, 1.205, 0.172], [-0.112, 1.262, 0.112], [-0.088, 1.3, 0.005], [0, 1.31, -0.074], [0.088, 1.3, 0.005], [0.112, 1.262, 0.112], [0.092, 1.205, 0.172]], 0.011, 40, 10), correa, { outline: 0.004 });
  for (const s of [-1, 1]) {
    R.add('cuerpo', ell(0.009, 0.009, 0.005), laton, { m: M4([s * 0.085, 1.196, apronSurf(s * 0.085, 1.196) + 0.005]), outline: 0.002 });
    R.add('cuerpo', tube([[s * 0.176, 0.945, 0.1], [s * 0.198, 0.94, -0.02], [s * 0.13, 0.938, -0.128], [s * 0.02, 0.935, -0.152]], 0.008, 16, 8), delantal, { outline: 0.003 });
    R.add('cuerpo', new THREE.TorusGeometry(0.026, 0.008, 8, 20), delantal, { m: M4([s * 0.028, 0.935, -0.156], [0, 0, 0], [1, 0.62, 0.7]), outline: 0.003 });
    R.add('cuerpo', tube([[s * 0.006, 0.93, -0.156], [s * 0.016, 0.88, -0.162], [s * 0.012, 0.83, -0.16]], 0.007, 8, 8), delantal, { outline: 0.003 });
  }
  R.add('cuerpo', ell(0.013, 0.013, 0.01), delantal, { m: M4([0, 0.934, -0.157]), outline: 0.003 });

  // brazos: manga gris remangada, antebrazo y mano
  for (const s of [-1, 1]) {
    const ja = s < 0 ? 'brazo_der' : 'brazo_izq', jf = s < 0 ? 'antebrazo_der' : 'antebrazo_izq', o = { world: false };
    R.add(ja, ell(0.078, 0.082, 0.074), camisa, { ...o, m: M4([0, -0.01, 0]) });
    R.add(ja, lathe([[0, -0.24], [0.069, -0.235], [0.07, -0.19], [0.074, -0.1], [0.078, -0.02], [0, 0.03]], 32), camisa, o);
    R.add(ja, new THREE.TorusGeometry(0.068, 0.021, 12, 32), camisa, { ...o, m: M4([0, -0.226, 0], [Math.PI / 2, 0, 0]), outline: 0.004 });
    R.add(ja, new THREE.TorusGeometry(0.071, 0.015, 10, 32), camisa, { ...o, m: M4([0, -0.197, 0], [Math.PI / 2, 0, 0]), outline: 0.003 });
    R.add(jf, lathe([[0, -0.2], [0.041, -0.192], [0.045, -0.1], [0.052, 0.0], [0, 0.03]], 24), piel, o);
    hand(R, jf, -0.245, piel, { s });
  }

  // cabeza
  const H = headShape(0, 1.52, 0, 0.138, 0.185, 0.142, 0.3, 0.12);
  R.add('cabeza', H.g, piel, { outline: 0.006 });
  for (const s of [-1, 1]) {
    R.add('cabeza', ell(0.024, 0.05, 0.036), piel, { m: M4([s * 0.134, 1.533, -0.006], [0, 0, s * 0.16]), outline: 0.004 });
    R.add('cabeza', tube([[s * 0.142, 1.555, 0.004], [s * 0.15, 1.53, 0.008], [s * 0.142, 1.508, 0.006]], 0.0035, 8, 6), negro, { outline: 0 });
    eye(R, 'cabeza', H, s * 0.05, 1.572, 0.043, 0.06, 0.03, blanco, negro, [-s * 0.006, -0.008]);
  }
  R.add('cabeza', ell(0.05, 0.043, 0.042), piel, { m: M4([0, 1.508, H.surf(0, 1.508) + 0.018]), outline: 0.005 });
  // sonrisa con dientes
  const my = 1.414;
  const mouth = new THREE.Shape(); mouth.moveTo(-0.088, my + 0.016); mouth.quadraticCurveTo(0, my - 0.006, 0.088, my + 0.016); mouth.quadraticCurveTo(0.06, my - 0.088, 0, my - 0.088); mouth.quadraticCurveTo(-0.06, my - 0.088, -0.088, my + 0.016);
  R.add('cabeza', decal(mouth, 0.002, H.surf, 0.003), boca, { outline: 0 });
  const teeth = new THREE.Shape(); teeth.moveTo(-0.074, my + 0.007); teeth.quadraticCurveTo(0, my - 0.012, 0.074, my + 0.007); teeth.lineTo(0.064, my - 0.026); teeth.quadraticCurveTo(0, my - 0.044, -0.064, my - 0.026); teeth.closePath();
  R.add('cabeza', decal(teeth, 0.002, H.surf, 0.0055), dientes, { outline: 0 });
  R.add('cabeza', decal(ovalShape(0, my - 0.066, 0.034, 0.014), 0.002, H.surf, 0.0055), lengua, { outline: 0 });
  [-0.045, -0.015, 0.015, 0.045].forEach((x) => R.add('cabeza', decal(shape([[x - 0.0018, my + 0.004], [x + 0.0018, my + 0.004], [x + 0.0018, my - 0.034], [x - 0.0018, my - 0.034]]), 0.001, H.surf, 0.0078), boca, { outline: 0 }));
  // bigote de manillar
  const onF = (x, y, lift, minZ = -1) => V(x, y, Math.max(H.surf(x, y) + lift, minZ));
  for (const s of [-1, 1]) {
    R.add('cabeza', tube([onF(s * 0.004, 1.47, 0.028), onF(s * 0.04, 1.463, 0.026), onF(s * 0.078, 1.452, 0.024), onF(s * 0.11, 1.462, 0.02, 0.07), V(s * 0.13, 1.49, 0.065), V(s * 0.122, 1.513, 0.066), V(s * 0.104, 1.506, 0.075)], (t) => (t < 0.28 ? 0.025 : lerp(0.025, 0.005, Math.pow((t - 0.28) / 0.72, 0.8))), 30, 12), pelo, { outline: 0.004, key: 'bigote' });
  }
  R.add('cabeza', ell(0.036, 0.024, 0.022), pelo, { m: M4([0, 1.47, H.surf(0, 1.47) + 0.027]), outline: 0.004, key: 'bigote' });
  // pelo engominado con tupé
  R.add('cabeza', hairCap(H, 1.045, pw([[0, 1.655], [0.7, 1.645], [1.25, 1.6], [1.5, 1.505], [1.75, 1.5], [2.2, 1.43], [3.2, 1.4]])), pelo, { outline: 0.006 });
  R.add('cabeza', ell(0.122, 0.1, 0.122), pelo, { m: M4([0, 1.712, 0.0], [-0.32, 0, -0.05]), outline: 0.006 });
  R.add('cabeza', tube([[-0.098, 1.72, 0.06], [-0.04, 1.77, 0.085], [0.03, 1.787, 0.09], [0.088, 1.768, 0.075], [0.116, 1.725, 0.05]], (t) => 0.036 + 0.024 * Math.sin(Math.PI * t), 24, 14), pelo, { outline: 0.005 });
  R.add('cabeza', tube([[0.05, 1.8, 0.07], [0.1, 1.818, 0.08], [0.13, 1.79, 0.09], [0.118, 1.762, 0.095], [0.1, 1.775, 0.1]], taper(0.022, 0.005, 0.7), 18, 10), pelo, { outline: 0.004 });
  for (const s of [-1, 1]) R.add('cabeza', ell(0.03, 0.052, 0.065), pelo, { m: M4([s * 0.132, 1.62, -0.03], [0, 0, s * 0.18]), outline: 0.004 });
  R.j.cabeza.position.y -= 0.055;   // cuello más corto, como en la lámina
  return R.build();
}

/* ═════════════ CLIENTE ═════════════ */
export function cliente() {
  const R = new Rig('cliente');
  const rnd = rng(2024);
  const piel = mat('piel', '#f3e9d5', 0.72), traje = mat('traje', '#4a4f61', 0.86), solapa = mat('solapa', '#3d4252', 0.86);
  const pelo = mat('pelo', '#6e4628', 0.86), pelo2 = mat('pelo_oscuro', '#53341d', 0.86), blanco = mat('ojo', '#fbf8f1', 0.3), negro = mat('negro', '#141314', 0.4);
  const guante = mat('guante', '#f6f2e8', 0.6), camisa = mat('camisa', '#f4f0e6', 0.7), calcetin = mat('calcetin', '#eee5d1', 0.85);
  const zapato = mat('zapato', '#6c4226', 0.5), suela = mat('suela', '#2a1a10', 0.7);

  R.joint('cabeza', 'cuerpo', [0, 1.33, 0]);
  R.joint('brazo_der', 'cuerpo', [-0.268, 1.235, 0], [0.02, 0, -0.22]);
  R.joint('brazo_izq', 'cuerpo', [0.268, 1.235, 0], [0.02, 0, 0.22]);
  R.joint('antebrazo_der', 'brazo_der', [0, -0.215, 0], [-0.08, 0, 0.05]);
  R.joint('antebrazo_izq', 'brazo_izq', [0, -0.215, 0], [-0.08, 0, -0.05]);
  R.joint('pierna_der', 'cuerpo', [-0.11, 0.75, 0]);
  R.joint('pierna_izq', 'cuerpo', [0.11, 0.75, 0]);

  // bombachos, calcetines y mocasines
  for (const s of [-1, 1]) {
    const j = s < 0 ? 'pierna_der' : 'pierna_izq', o = { world: false };
    R.add(j, lathe([[0, -0.515], [0.06, -0.51], [0.1, -0.49], [0.128, -0.43], [0.138, -0.3], [0.133, -0.12], [0.122, 0.0], [0, 0.05]], 36), traje, o);
    R.add(j, new THREE.TorusGeometry(0.062, 0.014, 10, 28), traje, { ...o, m: M4([0, -0.503, 0], [Math.PI / 2, 0, 0]), outline: 0.003 });
    R.add(j, new THREE.CylinderGeometry(0.05, 0.047, 0.2, 24), calcetin, { ...o, m: M4([0, -0.6, 0]), outline: 0.005 });
    const sh = ell(0.08, 0.064, 0.145, 36, 24), sp = sh.attributes.position;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < -0.03) sp.setY(i, -0.03);
    sh.computeVertexNormals();
    R.add(j, sh, zapato, { ...o, m: M4([s * 0.006, -0.707, 0.045]) });
    R.add(j, new THREE.TorusGeometry(0.06, 0.009, 8, 28), zapato, { ...o, m: M4([s * 0.006, -0.68, 0.015], [Math.PI / 2 - 0.15, 0, 0], [1, 1.35, 1]), outline: 0.003 });
    R.add(j, ell(0.082, 0.011, 0.147, 32, 12), suela, { ...o, m: M4([s * 0.006, -0.74, 0.045]), outline: 0.004 });
  }
  // chaqueta cruzada
  R.add('cuerpo', ell(0.235, 0.1, 0.165), traje, { m: M4([0, 0.77, 0]) });
  const jk = [[0, 0.7], [0.24, 0.705], [0.272, 0.78], [0.292, 0.93], [0.296, 1.08], [0.284, 1.18], [0.25, 1.255], [0.15, 1.305], [0, 1.32]], JZ = 0.68;
  R.add('cuerpo', lathe(jk, 48), traje, { m: M4([0, 0, 0], [0, 0, 0], [1, 1, JZ]) });
  const jSurf = (x, y) => JZ * Math.sqrt(Math.max(0, profileR(jk, y) ** 2 - x * x));
  R.add('cuerpo', decal(shape([[-0.062, 1.31], [0.062, 1.31], [0, 1.12]]), 0.002, jSurf, 0.002), camisa, { outline: 0 });
  for (const s of [-1, 1]) {
    R.add('cuerpo', decal(shape([[s * 0.0, 1.12], [s * 0.062, 1.31], [s * 0.14, 1.3], [s * 0.115, 1.255], [s * 0.15, 1.225], [s * 0.04, 1.08]]), 0.006, jSurf, 0.003), solapa, { outline: 0.003 });
    [0.93, 1.035, 1.14].forEach((y) => R.add('cuerpo', ell(0.016, 0.016, 0.008, 16, 10), negro, { m: M4([s * 0.068, y, jSurf(s * 0.068, y) + 0.002]), outline: 0.002 }));
  }
  R.add('cuerpo', decal(shape([[0.1, 1.12], [0.18, 1.12], [0.18, 1.111], [0.1, 1.111]]), 0.002, jSurf, 0.003), negro, { outline: 0 });
  R.add('cuerpo', decal(shape([[0.108, 1.12], [0.124, 1.155], [0.14, 1.132], [0.155, 1.158], [0.172, 1.12]]), 0.006, jSurf, 0.002), camisa, { outline: 0.0025 });
  const tie = [shape([[0, 1.29], [-0.035, 1.305], [-0.035, 1.275]]), shape([[0, 1.29], [0.035, 1.305], [0.035, 1.275]])];
  R.add('cuerpo', decal(tie, 0.012, jSurf, 0.004), negro, { outline: 0.002 });
  R.add('cuerpo', new THREE.CylinderGeometry(0.07, 0.075, 0.1, 28), piel, { m: M4([0, 1.335, 0]), outline: 0 });
  R.add('cuerpo', new THREE.TorusGeometry(0.072, 0.014, 10, 32), camisa, { m: M4([0, 1.305, 0], [Math.PI / 2 + 0.2, 0, 0]), outline: 0.003 });
  R.add('cuerpo', tube([[0, 0.82, -0.2 * JZ - 0.0], [0, 1.15, -0.29 * JZ], [0, 1.27, -0.2]], 0.0025, 10, 6), solapa, { outline: 0 });

  // brazos con guantes
  for (const s of [-1, 1]) {
    const ja = s < 0 ? 'brazo_der' : 'brazo_izq', jf = s < 0 ? 'antebrazo_der' : 'antebrazo_izq', o = { world: false };
    R.add(ja, ell(0.092, 0.095, 0.088), traje, { ...o, m: M4([0, -0.01, 0]) });
    R.add(ja, lathe([[0, -0.235], [0.078, -0.23], [0.08, -0.12], [0.088, -0.02], [0, 0.04]], 32), traje, o);
    R.add(jf, lathe([[0, -0.215], [0.072, -0.21], [0.074, -0.1], [0.078, 0.0], [0, 0.04]], 32), traje, o);
    R.add(jf, new THREE.CylinderGeometry(0.066, 0.064, 0.032, 28), camisa, { ...o, m: M4([0, -0.222, 0]), outline: 0.003 });
    R.add(jf, new THREE.CylinderGeometry(0.06, 0.05, 0.05, 28), guante, { ...o, m: M4([0, -0.255, 0]), outline: 0.003 });
    hand(R, jf, -0.322, guante, { s, glove: true });
  }

  // cabeza
  const H = headShape(0, 1.6, 0, 0.148, 0.17, 0.152, 0.3, 0.12);
  R.add('cabeza', H.g, piel, { outline: 0.006 });
  for (const s of [-1, 1]) {
    R.add('cabeza', ell(0.026, 0.05, 0.038), piel, { m: M4([s * 0.158, 1.6, -0.005], [0, 0, s * 0.15]), outline: 0.004 });
    eye(R, 'cabeza', H, s * 0.055, 1.638, 0.041, 0.055, 0.026, blanco, negro, [-s * 0.004, -0.006]);
    R.add('cabeza', tube([[s * 0.022, 1.7, H.surf(s * 0.022, 1.7) + 0.01], [s * 0.058, 1.716, H.surf(s * 0.058, 1.716) + 0.01], [s * 0.098, 1.704, H.surf(s * 0.098, 1.704) + 0.008]], taper(0.012, 0.005, 1), 12, 8), pelo, { outline: 0.003, key: 'cejas' });
  }
  R.add('cabeza', ell(0.052, 0.044, 0.046), piel, { m: M4([0, 1.583, H.surf(0, 1.583) + 0.02]), outline: 0.005 });
  // barba poblada: volumen principal, patillas y mechones
  const bc = V(0, 1.425, 0.045), br = V(0.152, 0.118, 0.112);
  R.add('cabeza', ell(br.x, br.y, br.z), pelo, { m: M4([bc.x, bc.y, bc.z]), key: 'barba' });
  for (const s of [-1, 1]) {
    R.add('cabeza', ell(0.055, 0.1, 0.07), pelo, { m: M4([s * 0.12, 1.475, -0.005], [0, 0, s * 0.1]), key: 'barba' });
    R.add('cabeza', ell(0.03, 0.075, 0.05), pelo, { m: M4([s * 0.14, 1.565, -0.004]), key: 'barba' });
  }
  for (let i = 0; i < 30; i++) {
    const az = lerp(-1.75, 1.75, rnd()), el = lerp(-1.35, 0.05, rnd());
    const n = V(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const st = V(bc.x + br.x * n.x * 0.86, bc.y + br.y * n.y * 0.86, bc.z + br.z * n.z * 0.86);
    const dir = n.clone().multiplyScalar(0.55).add(V((rnd() - 0.5) * 0.4, -0.9, 0.1));
    const curl = V(Math.sign(n.x || 1) * (0.4 + rnd() * 0.6), 0.25, (rnd() - 0.5) * 0.4);
    R.add('cabeza', tube(tuftPath(st, dir, 0.07 + rnd() * 0.06, curl), taper(0.036 + rnd() * 0.014), 12, 8), i % 3 ? pelo : pelo2, { outline: 0.003, key: i % 3 ? 'barba' : 'barba2' });
  }
  [-0.05, 0, 0.05].forEach((x, i) => R.add('cabeza', tube(tuftPath(V(x, 1.33, 0.12), V(x * 1.5, -1, 0.15), 0.08 + (i === 1 ? 0.03 : 0), V(x * 6, 0.2, 0)), taper(0.032), 12, 8), pelo, { outline: 0.004, key: 'barba' }));
  // bigote de manillar
  const onF = (x, y, lift, minZ = -1) => V(x, y, Math.max(H.surf(x, y) + lift, minZ));
  for (const s of [-1, 1]) {
    R.add('cabeza', tube([onF(s * 0.004, 1.552, 0.03), onF(s * 0.048, 1.546, 0.03), onF(s * 0.1, 1.54, 0.026, 0.09), V(s * 0.15, 1.555, 0.085), V(s * 0.178, 1.59, 0.07), V(s * 0.165, 1.618, 0.07), V(s * 0.142, 1.606, 0.078)], (t) => (t < 0.3 ? 0.03 : lerp(0.03, 0.006, Math.pow((t - 0.3) / 0.7, 0.8))), 30, 12), pelo, { outline: 0.004, key: 'barba' });
  }
  // melena alborotada
  R.add('cabeza', hairCap(H, 1.05, pw([[0, 1.71], [0.7, 1.7], [1.2, 1.66], [1.5, 1.58], [1.8, 1.55], [2.3, 1.47], [3.2, 1.44]])), pelo, { outline: 0.006, key: 'pelo' });
  const hc = V(0, 1.6, 0), hr = V(0.148 * 1.05, 0.17 * 1.05, 0.152 * 1.05);
  for (let i = 0; i < 34; i++) {
    const az = rnd() * Math.PI * 2 - Math.PI, el = lerp(0.12, 1.45, Math.sqrt(rnd()));
    if (Math.abs(az) < 1.0 && el < 0.85) continue;          // deja libre la frente
    const n = V(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const st = V(hc.x + hr.x * n.x * 0.9, hc.y + hr.y * n.y * 0.9, hc.z + hr.z * n.z * 0.9);
    const dir = n.clone().add(V((rnd() - 0.5) * 0.5, 0.55 + rnd() * 0.3, -0.15));
    const curl = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize().multiplyScalar(rnd() < 0.5 ? 1 : -1).add(V(0, -0.35, 0));
    R.add('cabeza', tube(tuftPath(st, dir, 0.1 + rnd() * 0.07, curl), taper(0.05 + rnd() * 0.018), 12, 8), i % 3 ? pelo : pelo2, { outline: 0.003, key: i % 3 ? 'pelo' : 'pelo2' });
  }
  [[-0.06, 0.4], [0.0, 0.1], [0.07, -0.3]].forEach(([x, c]) => R.add('cabeza', tube(tuftPath(V(x, 1.74, 0.1), V(x * 0.8, 1, 0.2), 0.13, V(c, 0.25, -0.9)), taper(0.04), 14, 8), pelo, { outline: 0.004, key: 'pelo' }));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    R.add('cabeza', tube(tuftPath(V(s * (0.1 + k * 0.02), 1.47 + k * 0.025, -0.1 + k * 0.01), V(s * 1, -0.35 + k * 0.15, -0.3), 0.1, V(0, 0.8, 0)), taper(0.032), 12, 8), pelo, { outline: 0.004, key: 'pelo' });
  }
  return R.build();
}
