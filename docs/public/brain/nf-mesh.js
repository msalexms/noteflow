/* NoteFlow brain — geometry core. Vanilla port of mesh.ts (no build step).
   Attaches to window.NF.mesh. Deterministic, asset-free procedural brain. */
(function () {
  const NF = (window.NF = window.NF || {});

  const REGIONS = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'stem'];
  const REGION_CODE = { frontal: 0, parietal: 1, temporal: 2, occipital: 3, cerebellum: 4, stem: 5 };

  // Baked default brain shape (the user's final sculpt).
  const DEFAULT_BRAIN_PARAMS = {
    detail: 2.4,
    ax: 0.8, ay: 0.83, az: 1.15,
    topDome: 0.13,
    bottomTaper: 0.34,
    bottomFlatten: 0,
    baseFlatten: 0.72,
    fissureDepth: 0.16, fissureWidth: 0.08, hemisphereSpread: 0.04,
    temporalBulge: 0.11,
    noiseAmp: 0.065, noiseFreq: 2.4,
    shells: [1],
    interior: { fillDensity: 1.4, margin: 0.92, neighbors: 3, maxEdge: 0.4 },
    centerY: 0.2,
    rotation: [-8, 0, 0],
    lobes: {
      frontal: { scale: 0.81, density: 0 },
      parietal: { scale: 0.74, density: 0 },
      temporal: { scale: 0.9, density: 0 },
      occipital: { scale: 0.9, density: 0 },
    },
    bulges: [
      { x: 0.36258189862548323, y: -0.6148027480554756, z: 0.7003941374487475, radius: 0.35, strength: -0.14 },
      { x: 0.0014222987611771703, y: -0.6511899177061468, z: 0.7589134786944395, radius: 0.35, strength: -0.14 },
      { x: -0.3494717980173508, y: -0.6247386732824586, z: 0.6982628820836703, radius: 0.35, strength: -0.14 },
      { x: 0.562971642608837, y: -0.6270229992367372, z: 0.5384283499654103, radius: 0.35, strength: -0.14 },
      { x: -0.5986325830260595, y: -0.5479024454905748, z: 0.5843303353112826, radius: 0.35, strength: -0.14 },
      { x: 0.5410098214688089, y: -0.8327376423924832, z: 0.11771317690427256, radius: 0.35, strength: 0.14 },
      { x: 0.019433177709388558, y: -0.9760790587453959, z: 0.2165456595797231, radius: 0.35, strength: 0.14 },
      { x: -0.36302245328870864, y: -0.909984043042981, z: 0.20035902728701133, radius: 0.35, strength: 0.14 },
      { x: -0.025401903091053436, y: -0.5409730914569073, z: 0.8406562065665781, radius: 0.5, strength: 0.06 },
      { x: -0.02133451094986953, y: -0.582068046492168, z: 0.8128601527294356, radius: 0.5, strength: 0.06 },
    ],
    densityPoints: [],
    cerebellum: { detail: 2, scale: [0.26, 0.22, 0.36], center: [0.01, -0.6, -0.51], wrinkleAmp: 0.28, wrinkleFreq: 7 },
    stem: { points: 9, top: [-0.01, -0.53, -0.12], bottom: [0.01, -1.06, -0.33], strands: 4, spread: 0.075 },
  };

  const LOBE_CENTERS = {
    frontal: [[0, 0.15, 1]],
    parietal: [[0, 1, -0.1]],
    temporal: [[0.95, -0.35, 0.2], [-0.95, -0.35, 0.2]],
    occipital: [[0, 0.15, -1]],
  };
  const LOBE_RADIUS = 1.0;
  const LOBE_BULGE_GAIN = 0.6;

  // ── deterministic value noise ──
  function hash3(x, y, z) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
  }
  const fade = (t) => t * t * (3 - 2 * t);
  function valueNoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
    const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
    const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    return lerp(
      lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
      lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
      w
    );
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  const DEG = Math.PI / 180;
  const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
  const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
  function rotateAround(p, deg, c, inverse) {
    const rx = deg[0] * DEG, ry = deg[1] * DEG, rz = deg[2] * DEG;
    let v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    if (!inverse) { v = rotX(v, rx); v = rotY(v, ry); v = rotZ(v, rz); }
    else { v = rotZ(v, -rz); v = rotY(v, -ry); v = rotX(v, -rx); }
    return [v[0] + c[0], v[1] + c[1], v[2] + c[2]];
  }

  // ── icosphere ──
  function icosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(normalize);
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    return { verts, faces };
  }
  function icosphere(detail) {
    const { verts, faces: f0 } = icosahedron();
    let faces = f0;
    for (let i = 0; i < detail; i++) {
      const mid = new Map();
      const getMid = (a, b) => {
        const key = a < b ? a + '_' + b : b + '_' + a;
        const found = mid.get(key);
        if (found !== undefined) return found;
        const va = verts[a], vb = verts[b];
        const m = normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
        const idx = verts.length;
        verts.push(m); mid.set(key, idx);
        return idx;
      };
      const next = [];
      for (const f of faces) {
        const a = f[0], b = f[1], c = f[2];
        const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    return { verts, faces };
  }

  function cerebrumTopology(detail, density, maxExtra) {
    if (maxExtra == null) maxExtra = 2;
    const baseLevel = Math.max(0, Math.floor(detail));
    const frac = detail - baseLevel;
    const base = icosphere(baseLevel);
    const verts = base.verts.slice();
    const mid = new Map();
    const getMid = (a, b) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      const found = mid.get(key);
      if (found !== undefined) return found;
      const va = verts[a], vb = verts[b];
      const m = normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
      const idx = verts.length;
      verts.push(m); mid.set(key, idx);
      return idx;
    };
    const dnorm = density.map((d) => ({ n: normalize([d.x, d.y, d.z]), radius: d.radius, level: d.level }));
    const extraFor = (a, b, c) => {
      const va = verts[a], vb = verts[b], vc = verts[c];
      const cen = normalize([(va[0] + vb[0] + vc[0]) / 3, (va[1] + vb[1] + vc[1]) / 3, (va[2] + vb[2] + vc[2]) / 3]);
      let lvl = frac > 0.001 && hash3(Math.round(cen[0] * 997), Math.round(cen[1] * 997), Math.round(cen[2] * 997)) < frac ? 1 : 0;
      for (const d of dnorm) {
        const ang = Math.acos(clamp(cen[0] * d.n[0] + cen[1] * d.n[1] + cen[2] * d.n[2], -1, 1));
        if (ang < d.radius) lvl = Math.max(lvl, Math.round(d.level * (1 - ang / d.radius)));
      }
      return Math.min(lvl, maxExtra);
    };
    const out = [];
    const subdiv = (face, level) => {
      if (level <= 0) { out.push(face); return; }
      const a = face[0], b = face[1], c = face[2];
      const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
      subdiv([a, ab, ca], level - 1); subdiv([b, bc, ab], level - 1);
      subdiv([c, ca, bc], level - 1); subdiv([ab, bc, ca], level - 1);
    };
    for (const face of base.faces) subdiv(face, extraFor(face[0], face[1], face[2]));
    return { verts, faces: out };
  }

  function cerebrumVertex(dir, p, bulges) {
    const dx = dir[0], dy = dir[1], dz = dir[2];
    let x = dx * p.ax, y = dy * p.ay, z = dz * p.az;
    const n = (valueNoise(dx * p.noiseFreq + 11, dy * p.noiseFreq + 4, dz * p.noiseFreq + 7) - 0.5) * p.noiseAmp;
    const temporal = p.temporalBulge * smoothstep(-0.05, -0.55, dy) * smoothstep(0.35, 0.75, Math.abs(dx)) * smoothstep(-0.45, 0.4, dz);
    let bulge = 0;
    for (const b of bulges) {
      const ang = Math.acos(clamp(dx * b.n[0] + dy * b.n[1] + dz * b.n[2], -1, 1));
      bulge += b.strength * Math.exp(-Math.pow(ang / b.radius, 2));
    }
    const s = 1 + n + temporal + bulge;
    x *= s; y *= s; z *= s;
    y += p.topDome * smoothstep(0.0, 1.0, dy);
    const taper = 1 - p.bottomTaper * smoothstep(0.0, -1.0, dy);
    x *= taper; z *= taper;
    if (dy < 0) y *= 1 - p.bottomFlatten;
    const baseY = -p.ay * 0.5;
    if (y < baseY) y = baseY + (y - baseY) * (1 - p.baseFlatten);
    const fissure = p.fissureDepth * Math.exp(-Math.pow(dx / p.fissureWidth, 2)) * smoothstep(-0.05, 0.65, dy);
    y -= fissure;
    x += Math.sign(dx) * p.hemisphereSpread * Math.exp(-Math.pow(dx / (p.fissureWidth * 1.5), 2)) * smoothstep(0.0, 0.7, dy);
    return [x, y, z];
  }

  function regionForCerebrum(dir) {
    const dx = dir[0], dy = dir[1], dz = dir[2];
    if (dy < -0.18 && Math.abs(dx) > 0.42 && dz > -0.25) return 'temporal';
    if (dz > 0.42) return 'frontal';
    if (dz < -0.4) return 'occipital';
    return 'parietal';
  }

  function effectiveBulges(p) {
    const out = (p.bulges || []).map((b) => ({ n: normalize([b.x, b.y, b.z]), radius: b.radius, strength: b.strength }));
    for (const lobe of ['frontal', 'parietal', 'temporal', 'occipital']) {
      const scale = (p.lobes && p.lobes[lobe] && p.lobes[lobe].scale) != null ? p.lobes[lobe].scale : 1;
      if (Math.abs(scale - 1) > 0.001) {
        for (const c of LOBE_CENTERS[lobe]) out.push({ n: normalize(c), radius: LOBE_RADIUS, strength: (scale - 1) * LOBE_BULGE_GAIN });
      }
    }
    return out;
  }
  function effectiveDensity(p) {
    const out = (p.densityPoints || []).slice();
    for (const lobe of ['frontal', 'parietal', 'temporal', 'occipital']) {
      const d = (p.lobes && p.lobes[lobe] && p.lobes[lobe].density) || 0;
      if (d > 0) for (const c of LOBE_CENTERS[lobe]) { const n = normalize(c); out.push({ x: n[0], y: n[1], z: n[2], radius: LOBE_RADIUS, level: d }); }
    }
    return out;
  }

  function buildBrainMesh(params) {
    params = params || DEFAULT_BRAIN_PARAMS;
    const positions = [];
    const regionOf = [];
    const edgeSet = new Set();
    const edgePairs = [];
    const surfaceFaces = [];
    let vCount = 0;

    const pushVertex = (px, py, pz, region) => { const idx = vCount++; positions.push(px, py, pz); regionOf.push(REGION_CODE[region]); return idx; };
    const addEdge = (a, b) => {
      if (a === b) return;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const key = lo * 1000000 + hi;
      if (edgeSet.has(key)) return;
      edgeSet.add(key); edgePairs.push([lo, hi]);
    };
    const addFaceEdges = (faces, offset) => {
      for (const f of faces) { addEdge(f[0] + offset, f[1] + offset); addEdge(f[1] + offset, f[2] + offset); addEdge(f[2] + offset, f[0] + offset); }
    };

    const cy = params.centerY;
    const bulges = effectiveBulges(params);
    const density = effectiveDensity(params);

    const topo = cerebrumTopology(params.detail, density);
    const outerPos = topo.verts.map((d) => cerebrumVertex(d, params, bulges));
    const shells = params.shells && params.shells.length ? params.shells : [1];
    const shellIndex = [];
    for (const scale of shells) {
      const idxMap = [];
      const off = vCount;
      for (let i = 0; i < outerPos.length; i++) {
        const o = outerPos[i];
        idxMap.push(pushVertex(o[0] * scale, cy + (o[1] - cy) * scale, o[2] * scale, regionForCerebrum(topo.verts[i])));
      }
      addFaceEdges(topo.faces, off);
      shellIndex.push(idxMap);
    }
    for (let s = 0; s < shellIndex.length - 1; s++) {
      for (let i = 0; i < outerPos.length; i++) addEdge(shellIndex[s][i], shellIndex[s + 1][i]);
    }
    const cerebrumIndex = shellIndex[0];
    const outerOff = shellIndex[0][0];
    for (const f of topo.faces) surfaceFaces.push(f[0] + outerOff, f[1] + outerOff, f[2] + outerOff);

    const interiorVertices = [];
    const fill = params.interior;
    if (fill && fill.fillDensity > 0) {
      const rng = mulberry32(0x1a2b3c4d);
      const C = [0, cy, 0];
      const nInterior = Math.round(outerPos.length * fill.fillDensity);
      const intPos = [];
      for (let i = 0; i < nInterior; i++) {
        const u = rng() * 2 - 1, theta = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
        const dir = [sq * Math.cos(theta), u, sq * Math.sin(theta)];
        const surf = cerebrumVertex(dir, params, bulges);
        const r = Math.cbrt(rng()) * fill.margin;
        const pt = [C[0] + (surf[0] - C[0]) * r, C[1] + (surf[1] - C[1]) * r, C[2] + (surf[2] - C[2]) * r];
        interiorVertices.push(pushVertex(pt[0], pt[1], pt[2], regionForCerebrum(dir)));
        intPos.push(pt);
      }
      const candIdx = cerebrumIndex.concat(interiorVertices);
      const candPos = outerPos.concat(intPos);
      const maxE2 = fill.maxEdge * fill.maxEdge;
      for (let i = 0; i < interiorVertices.length; i++) {
        const pi = intPos[i];
        const near = [];
        let bestIdx = -1, bestD2 = Infinity;
        for (let j = 0; j < candIdx.length; j++) {
          if (candIdx[j] === interiorVertices[i]) continue;
          const pj = candPos[j];
          const d2 = (pi[0] - pj[0]) ** 2 + (pi[1] - pj[1]) ** 2 + (pi[2] - pj[2]) ** 2;
          if (d2 < bestD2) { bestD2 = d2; bestIdx = candIdx[j]; }
          if (d2 <= maxE2) near.push({ idx: candIdx[j], d2 });
        }
        near.sort((a, b) => a.d2 - b.d2);
        const k = Math.min(fill.neighbors, near.length);
        for (let n = 0; n < k; n++) addEdge(interiorVertices[i], near[n].idx);
        if (k === 0 && bestIdx >= 0) addEdge(interiorVertices[i], bestIdx);
      }
    }

    const cb = icosphere(params.cerebellum.detail);
    const cbOff = vCount;
    const cbS = params.cerebellum.scale, cbC = params.cerebellum.center;
    const wrinkleAmp = params.cerebellum.wrinkleAmp, wrinkleFreq = params.cerebellum.wrinkleFreq;
    const cbIndex = [];
    for (const dir of cb.verts) {
      const wrinkle = (valueNoise(dir[0] * wrinkleFreq + 30, dir[1] * wrinkleFreq, dir[2] * wrinkleFreq) - 0.5) * wrinkleAmp;
      cbIndex.push(pushVertex(
        cbC[0] + dir[0] * cbS[0] * (1 + wrinkle),
        cbC[1] + dir[1] * cbS[1] * (1 + wrinkle),
        cbC[2] + dir[2] * cbS[2] * (1 + wrinkle),
        'cerebellum'
      ));
    }
    addFaceEdges(cb.faces, cbOff);
    for (const f of cb.faces) surfaceFaces.push(f[0] + cbOff, f[1] + cbOff, f[2] + cbOff);

    const nStem = params.stem.points, sTop = params.stem.top, sBot = params.stem.bottom, strands = params.stem.strands, spread = params.stem.spread;
    const stemIndex = [];
    for (let st = 0; st < strands; st++) {
      const ang = (st / Math.max(1, strands)) * Math.PI * 2;
      const ox = Math.cos(ang) * spread, oz = Math.sin(ang) * spread;
      let prev = -1;
      for (let i = 0; i < nStem; i++) {
        const t = i / Math.max(1, nStem - 1);
        const idx = pushVertex(
          sTop[0] + (sBot[0] - sTop[0]) * t + ox * (1 - t * 0.3),
          sTop[1] + (sBot[1] - sTop[1]) * t,
          sTop[2] + (sBot[2] - sTop[2]) * t + oz * (1 - t * 0.3),
          'stem'
        );
        if (prev !== -1) addEdge(prev, idx);
        prev = idx;
        if (st === 0) stemIndex.push(idx);
      }
    }

    const posArr = new Float32Array(positions);

    const rot = params.rotation || [0, 0, 0];
    if (rot[0] || rot[1] || rot[2]) {
      const S = [0, cy, 0];
      for (let i = 0; i < vCount; i++) {
        if (regionOf[i] >= REGION_CODE.cerebellum) continue;
        const r = rotateAround([posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]], rot, S);
        posArr[i * 3] = r[0]; posArr[i * 3 + 1] = r[1]; posArr[i * 3 + 2] = r[2];
      }
    }

    const dist2 = (i, j) => (posArr[i * 3] - posArr[j * 3]) ** 2 + (posArr[i * 3 + 1] - posArr[j * 3 + 1]) ** 2 + (posArr[i * 3 + 2] - posArr[j * 3 + 2]) ** 2;
    const nearestIn = (target, pool) => { let best = pool[0], bestD = Infinity; for (const j of pool) { const d = dist2(target, j); if (d < bestD) { bestD = d; best = j; } } return best; };

    for (const v of cbIndex) { if (posArr[v * 3 + 1] > cbC[1] + 0.16) addEdge(v, nearestIn(v, cerebrumIndex)); }
    if (stemIndex.length) {
      addEdge(stemIndex[0], nearestIn(stemIndex[0], cerebrumIndex));
      addEdge(stemIndex[Math.floor(stemIndex.length / 2)], nearestIn(stemIndex[Math.floor(stemIndex.length / 2)], cbIndex));
    }

    const adjacency = Array.from({ length: vCount }, () => []);
    for (const e of edgePairs) { adjacency[e[0]].push(e[1]); adjacency[e[1]].push(e[0]); }

    const verticesByRegion = { frontal: [], parietal: [], temporal: [], occipital: [], cerebellum: [], stem: [] };
    for (let i = 0; i < vCount; i++) verticesByRegion[REGIONS[regionOf[i]]].push(i);

    const radialFrac = new Float64Array(vCount);
    {
      let rMax = 0;
      for (let i = 0; i < vCount; i++) {
        const r = Math.hypot(posArr[i * 3], posArr[i * 3 + 1] - cy, posArr[i * 3 + 2]);
        radialFrac[i] = r; if (r > rMax) rMax = r;
      }
      if (rMax > 0) for (let i = 0; i < vCount; i++) radialFrac[i] /= rMax;
    }

    const edgeId = new Map();
    for (let i = 0; i < edgePairs.length; i++) edgeId.set(edgePairs[i][0] * vCount + edgePairs[i][1], i);
    const edgeKey = (u, v) => (u < v ? u * vCount + v : v * vCount + u);

    const dijkstra = (a, b, weight) => {
      if (a === b) return [a];
      const dist = new Float64Array(vCount).fill(Infinity);
      const prev = new Int32Array(vCount).fill(-1);
      const done = new Uint8Array(vCount);
      dist[a] = 0;
      const heap = [a];
      const swap = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; };
      const siftUp = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (dist[heap[p]] <= dist[heap[i]]) break; swap(p, i); i = p; } };
      const siftDown = (i) => { const n = heap.length; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && dist[heap[l]] < dist[heap[m]]) m = l; if (r < n && dist[heap[r]] < dist[heap[m]]) m = r; if (m === i) break; swap(m, i); i = m; } };
      let found = false;
      while (heap.length) {
        const cur = heap[0];
        const last = heap.pop();
        if (heap.length) { heap[0] = last; siftDown(0); }
        if (done[cur]) continue;
        done[cur] = 1;
        if (cur === b) { found = true; break; }
        const dcur = dist[cur];
        for (const nb of adjacency[cur]) {
          if (done[nb]) continue;
          const nd = dcur + weight(cur, nb);
          if (nd < dist[nb]) { dist[nb] = nd; prev[nb] = cur; heap.push(nb); siftUp(heap.length - 1); }
        }
      }
      if (!found) return null;
      const path = [];
      for (let cur = b; cur !== -1; cur = prev[cur]) path.push(cur);
      path.reverse();
      return path;
    };
    const makePather = (weight) => {
      const cache = new Map();
      return (a, b) => {
        if (a === b) return [a];
        const key = edgeKey(a, b);
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const path = dijkstra(a, b, weight);
        cache.set(key, path);
        return path;
      };
    };
    const pathBetween = makePather((u, v) => Math.sqrt(dist2(u, v)));
    const EXTERIOR_BIAS = 5.5, EXTERIOR_POW = 3;
    const contentWeight = (u, v) => Math.sqrt(dist2(u, v)) * (1 + EXTERIOR_BIAS * 0.5 * (radialFrac[u] ** EXTERIOR_POW + radialFrac[v] ** EXTERIOR_POW));
    const pathThroughInterior = makePather(contentWeight);
    const CONGESTION = 2.6;
    const routeContentEdges = (pairs) => {
      const usage = new Float64Array(edgePairs.length);
      const routes = new Map();
      for (const pr of pairs) {
        const a = pr[0], b = pr[1];
        const key = edgeKey(a, b);
        if (routes.has(key)) continue;
        const path = a === b ? [a] : dijkstra(a, b, (u, v) => {
          const eid = edgeId.get(edgeKey(u, v));
          return contentWeight(u, v) * (1 + CONGESTION * (eid != null ? usage[eid] : 0));
        });
        const seq = path && path.length >= 2 ? path : [a, b];
        routes.set(key, seq);
        for (let i = 0; i < seq.length - 1; i++) { const eid = edgeId.get(edgeKey(seq[i], seq[i + 1])); if (eid != null) usage[eid] += 1; }
      }
      return routes;
    };

    const edges = new Uint32Array(edgePairs.length * 2);
    for (let i = 0; i < edgePairs.length; i++) { edges[i * 2] = edgePairs[i][0]; edges[i * 2 + 1] = edgePairs[i][1]; }

    return {
      positions: posArr, edges, faces: new Uint32Array(surfaceFaces), regionOf: new Int8Array(regionOf),
      adjacency, vertexCount: vCount, verticesByRegion, interiorVertices, pathBetween, pathThroughInterior, routeContentEdges,
    };
  }

  const VERTS_PER_NODE = 5, DETAIL_MIN = 1.6, DETAIL_MAX = 3.3;
  function adaptiveDetail(nodeCount) {
    const target = Math.max(40, nodeCount * VERTS_PER_NODE);
    const d = Math.log((target - 2) / 10) / Math.log(4);
    const clamped = Math.max(DETAIL_MIN, Math.min(DETAIL_MAX, d));
    return Math.round(clamped * 10) / 10;
  }

  NF.mesh = { REGIONS, REGION_CODE, DEFAULT_BRAIN_PARAMS, buildBrainMesh, adaptiveDetail, rotateAround };
})();
