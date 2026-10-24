// Añade un esqueleto sencillo (cuerpo, cabeza, brazos, antebrazos, piernas) a un GLB estático
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
const [inp, out, cfgName] = process.argv.slice(2);
const CFG = JSON.parse(fs.readFileSync(new URL('./rigs.json', import.meta.url)))[cfgName];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot(), buf = root.listBuffers()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray();
const N = pos.length / 3;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function segInfo(p, a, b) { const ab = sub(b, a), L2 = dot(ab, ab); const t = dot(sub(p, a), ab) / L2; const tc = Math.max(0, Math.min(1, t)); const q = [a[0] + ab[0] * tc, a[1] + ab[1] * tc, a[2] + ab[2] * tc]; const d = Math.hypot(...sub(p, q)); return { t, tc, d, len: Math.sqrt(L2) }; }
// joints: 0 cuerpo, 1 cabeza, 2 brazo_izq, 3 antebrazo_izq, 4 brazo_der, 5 antebrazo_der, 6 pierna_izq, 7 pierna_der
const names = ['cuerpo', 'cabeza', 'brazo_izq', 'antebrazo_izq', 'brazo_der', 'antebrazo_der', 'pierna_izq', 'pierna_der'];
const C = CFG, mir = (v) => [-v[0], v[1], v[2]];
const arm = { izq: { sh: C.sh, el: C.el, wr: C.wr, tip: C.tip }, der: { sh: mir(C.sh), el: mir(C.el), wr: mir(C.wr), tip: mir(C.tip) } };
const J = new Uint16Array(N * 4), Wt = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const side = p[0] >= 0 ? 'izq' : 'der', A = arm[side];
  const s1 = segInfo(p, A.sh, A.el), s2 = segInfo(p, A.el, A.wr), s3 = segInfo(p, A.wr, A.tip);
  // radio admitido según el tramo más cercano
  const cands = [[s1, lerpR(C.r[0], C.r[1], s1.tc)], [s2, lerpR(C.r[1], C.r[2], s2.tc)], [s3, lerpR(C.r[2], C.r[3], s3.tc)]];
  let best = 0, bestScore = Infinity; cands.forEach(([s, R], k) => { const sc = s.d / R; if (sc < bestScore) { bestScore = sc; best = k; } });
  let a = (1 - smooth(1.0, 1.15, bestScore)) * smooth(C.armStart[0], C.armStart[1], s1.t * s1.len);
  if (p[1] < C.sh[1] - 0.1 && p[1] > -0.5) a = Math.max(a, smooth(C.armX - 0.02, C.armX + 0.02, Math.abs(p[0])));
  // posición a lo largo del brazo respecto al codo
  const sEl = best === 0 ? (s1.t - 1) * s1.len : best === 1 ? s2.t * s2.len : s2.len + s3.t * s3.len;
  const fore = smooth(-0.035, 0.035, sEl);
  const rest = 1 - a;
  const h = smooth(C.neck[0], C.neck[1], p[1]) * (Math.abs(p[0]) < C.headHalfW ? 1 : 0);
  let legAll = smooth(C.hip[1] + C.legBlend, C.hip[1] - C.legBlend, p[1]);
  if (C.apron && p[1] > C.apron[2]) legAll *= 1 - 0.65 * smooth(C.apron[0], C.apron[1], p[2]);
  const li = smooth(-0.035, 0.035, p[0]);
  const w = new Float32Array(8);
  w[side === 'izq' ? 2 : 4] += a * (1 - fore); w[side === 'izq' ? 3 : 5] += a * fore;
  w[1] += rest * h;
  w[6] += rest * (1 - h) * legAll * li; w[7] += rest * (1 - h) * legAll * (1 - li);
  w[0] += rest * (1 - h) * (1 - legAll);
  const idx = [...w.keys()].sort((x, y) => w[y] - w[x]).slice(0, 4);
  let sum = 0; idx.forEach((k) => sum += w[k]);
  idx.forEach((k, j) => { J[4 * i + j] = k; Wt[4 * i + j] = w[k] / sum; });
}
function lerpR(a, b, t) { return a + (b - a) * t; }
// nodos del esqueleto (sin rotación en la pose de enlace)
const world = {
  cuerpo: [0, C.hip[1], C.hip[2]], cabeza: [0, C.neck[0] + 0.02, C.headZ],
  brazo_izq: arm.izq.sh, antebrazo_izq: arm.izq.el, brazo_der: arm.der.sh, antebrazo_der: arm.der.el,
  pierna_izq: [C.hip[0], C.hip[1], C.hip[2]], pierna_der: [-C.hip[0], C.hip[1], C.hip[2]]
};
const parent = { cabeza: 'cuerpo', brazo_izq: 'cuerpo', brazo_der: 'cuerpo', antebrazo_izq: 'brazo_izq', antebrazo_der: 'brazo_der', pierna_izq: 'cuerpo', pierna_der: 'cuerpo' };
const nodes = {};
names.forEach((n) => { const pw = parent[n] ? world[parent[n]] : [0, 0, 0]; nodes[n] = doc.createNode(n).setTranslation(sub(world[n], pw)); });
names.forEach((n) => { if (parent[n]) nodes[parent[n]].addChild(nodes[n]); });
const ibm = new Float32Array(16 * names.length);
names.forEach((n, k) => { const w = world[n]; ibm.set([1,0,0,0, 0,1,0,0, 0,0,1,0, -w[0],-w[1],-w[2],1], 16 * k); });
const skin = doc.createSkin('esqueleto').setSkeleton(nodes.cuerpo).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
names.forEach((n) => skin.addJoint(nodes[n]));
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Wt).setBuffer(buf));
// el nodo de la malla debe estar sin transformación para que la pose de enlace coincida
if (meshNode.getMatrix().some((v, i) => v !== [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1][i])) throw new Error('mesh node has transform');
meshNode.setSkin(skin).setName(cfgName);
root.listScenes()[0].addChild(nodes.cuerpo);
// pose de reposo: brazos algo más pegados al cuerpo
const q = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
nodes.brazo_izq.setRotation(q(-C.armsDown)); nodes.brazo_der.setRotation(q(C.armsDown));
await io.write(out, doc);
console.log('ok', N, 'verts');
