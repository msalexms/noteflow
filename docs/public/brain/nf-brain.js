/* NoteFlow brain — three.js scene as a <noteflow-brain> custom element.
   Vanilla port of BrainScene.tsx using global THREE (r128) + examples/js post-processing.
   Attributes (all optional):
     data-content-edges  "true"|"false"  show the faint content synapses (default true)
     data-controls       present → orbit drag + wheel-zoom + hover (default off: just auto-rotate)
     data-transparent    present → transparent canvas (brain floats over the page bg)
     data-labels         present → project node labels (default off)
     data-cam            initial camera distance (default 2.95)
     data-rotate-speed   auto-rotate speed (default 0.35)
   Methods: setHighlight(Set<noteId>), setThinking(bool), resetView()
   Reacts to the document's `data-theme` attribute changing → re-reads palette + rebuilds. */
(function () {
  const NF = (window.NF = window.NF || {});
  const T = window.THREE;

  const rgbTo = (rgb) => new T.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

  function makeDotTexture() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const tex = new T.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }
  function makeRingTexture() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2); ctx.stroke();
    const tex = new T.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  const CENTER_SIZE = 0.014;
  const RING_SIZE = { group: 0.075, folder: 0.052, note: 0.04, section: 0.026 };
  const LOOK = { bloomStrength: 0.36, bloomRadius: 0.5, bloomThreshold: 0.2, wireOpacity: 0.11, dotSize: 0.02, dotOpacity: 0.4, fogNear: 4.5, fogFar: 10 };

  class NoteflowBrain extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = 'block';
      if (getComputedStyle(this).position === 'static') this.style.position = 'relative';

      const opts = {
        contentEdges: this.getAttribute('data-content-edges') !== 'false',
        controls: this.hasAttribute('data-controls'),
        transparent: this.hasAttribute('data-transparent'),
        labels: this.hasAttribute('data-labels'),
        cam: parseFloat(this.getAttribute('data-cam') || '2.95'),
        rotateSpeed: parseFloat(this.getAttribute('data-rotate-speed') || '0.35'),
        shiftX: parseFloat(this.getAttribute('data-shift-x') || '0'),
        targetY: parseFloat(this.getAttribute('data-target-y') || '-0.05'),
      };
      this._opts = opts;
      this._highlight = null;
      this._thinking = false;

      const container = document.createElement('div');
      // Ambient brains (no controls) overlay scrollable content (hero/footer), so the whole
      // container must be transparent to the hit-test or touch scrolling dies on top of them.
      // Interactive ones keep `pan-y`: vertical swipes still scroll the page, horizontal
      // drags rotate the brain.
      container.style.cssText = opts.controls
        ? 'position:absolute;inset:0;touch-action:pan-y;'
        : 'position:absolute;inset:0;pointer-events:none;';
      this.appendChild(container);
      this._container = container;

      this._start();
    }
    disconnectedCallback() { if (this._cleanup) this._cleanup(); }

    setHighlight(set) { this._highlight = set; }
    setThinking(b) { this._thinking = b; }
    setContentEdges(b) { if (this._opts) this._opts.contentEdges = b; }
    // 0 → 1 scroll progress: dollies the wireframe back into depth and dims its glow,
    // so the brain recedes as the page slides over the hero. Driven by the page.
    setScroll(p) { this._scroll = p < 0 ? 0 : p > 1 ? 1 : p; }
    resetView() { if (this._resetView) this._resetView(); }

    _start() {
      const container = this._container, opts = this._opts;
      const mesh0 = NF.mesh;
      const model = NF.graph.buildSampleGraph();
      let palette = NF.graph.readBrainPalette();

      const buildScene = () => {
        palette = NF.graph.readBrainPalette();
        const pal = palette;
        const bg = rgbTo(pal.bg);
        const bgLum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
        const isDark = bgLum < 0.5;
        const wireBlend = isDark ? T.AdditiveBlending : T.NormalBlending;
        const wireOpacityFor = (b) => (isDark ? b * 1.9 : Math.max(b, 0.5));
        const dotOpacityFor = (b) => (isDark ? b * 1.6 : Math.max(b, 0.75));

        // lowPower tier (coarse pointer ≈ phones/tablets): lower pixel ratio and no bloom
        // pass — the additive-blended wireframe still glows acceptably without it.
        const lowPower = window.matchMedia('(pointer: coarse)').matches;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: opts.transparent });
        renderer.setPixelRatio(pixelRatio);
        if (opts.transparent) renderer.setClearColor(0x000000, 0); else renderer.setClearColor(bg, 1);
        let width = container.clientWidth || 1, height = container.clientHeight || 1;
        renderer.setSize(width, height);
        if (!opts.controls) renderer.domElement.style.pointerEvents = 'none';
        container.appendChild(renderer.domElement);

        const scene = new T.Scene();
        const fog = new T.Fog(bg.getHex(), LOOK.fogNear, LOOK.fogFar);
        scene.fog = fog;
        if (!opts.transparent) scene.background = bg;

        const camera = new T.PerspectiveCamera(50, width / height, 0.1, 100);
        camera.position.set(0, 0.18, opts.cam);

        const controls = new T.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 1.6;
        controls.maxDistance = 7;
        controls.target.set(0, opts.targetY, 0);
        controls.autoRotate = !reducedMotion;
        controls.autoRotateSpeed = opts.rotateSpeed;
        controls.enabled = opts.controls;
        if (!opts.controls) { controls.enableZoom = false; controls.enableRotate = false; }
        const applyViewOffset = () => { if (opts.shiftX) camera.setViewOffset(width, height, -opts.shiftX * width, 0, width, height); else camera.clearViewOffset(); camera.updateProjectionMatrix(); };
        applyViewOffset();

        const wireColor = rgbTo(pal.text).lerp(bg, isDark ? 0.28 : 0.22);

        let mesh = mesh0.buildBrainMesh(structuredClone({ ...mesh0.DEFAULT_BRAIN_PARAMS, detail: mesh0.adaptiveDetail(model.nodes.length) }));

        const makeWireGeo = (m) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(m.positions, 3)); g.setIndex(new T.BufferAttribute(m.edges, 1)); return g; };
        const makeDotGeo = (m) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(m.positions, 3)); return g; };

        const brainGroup = new T.Group(); scene.add(brainGroup);
        const wireMat = new T.LineBasicMaterial({ color: wireColor, transparent: true, opacity: wireOpacityFor(LOOK.wireOpacity), depthWrite: false, blending: wireBlend });
        const wireframe = new T.LineSegments(makeWireGeo(mesh), wireMat); brainGroup.add(wireframe);

        const dotTex = makeDotTexture();
        const dotMat = new T.PointsMaterial({ color: wireColor, map: dotTex, alphaTest: 0.02, size: LOOK.dotSize, transparent: true, opacity: dotOpacityFor(LOOK.dotOpacity), depthWrite: false, blending: wireBlend, sizeAttenuation: true });
        const dots = new T.Points(makeDotGeo(mesh), dotMat); brainGroup.add(dots);

        const ringTex = makeRingTexture();
        const colorCache = new Map();
        const colorOf = (cssVar) => { let c = colorCache.get(cssVar); if (!c) { c = rgbTo(pal.color(cssVar)); colorCache.set(cssVar, c); } return c; };

        const dataGroup = new T.Group(); brainGroup.add(dataGroup);
        const structureGroup = new T.Group(), synapseGroup = new T.Group(), dendriteGroup = new T.Group(), nodeGroup = new T.Group(), hoverGroup = new T.Group(), thinkGroup = new T.Group(), idleGroup = new T.Group(), litGroup = new T.Group();
        dataGroup.add(structureGroup, synapseGroup, dendriteGroup, nodeGroup, hoverGroup, thinkGroup, idleGroup, litGroup);

        const placedNodes = new Map();
        let pickPoints = [];
        let connectedNoteNodeIds = [];
        let assignment = new Map();

        const disposeObj = (obj) => { const o = obj; if (o.geometry) o.geometry.dispose(); const mat = o.material; if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose()); else if (mat) mat.dispose(); };
        const clearGroup = (g) => { for (const child of [...g.children]) { g.remove(child); disposeObj(child); } };
        const removeObj = (g, obj) => { g.remove(obj); disposeObj(obj); };
        const disposeData = () => [structureGroup, synapseGroup, dendriteGroup, nodeGroup].forEach(clearGroup);
        const lineGeo = (lp, lc) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(lp, 3)); g.setAttribute('color', new T.Float32BufferAttribute(lc, 3)); return g; };

        let contentRoutes = new Map();
        const routeContent = (a, b) => {
          const key = a < b ? a * mesh.vertexCount + b : b * mesh.vertexCount + a;
          const p = contentRoutes.get(key) || mesh.pathThroughInterior(a, b);
          if (!p || p.length < 2) return [a, b];
          return p[0] === a ? p : p.slice().reverse();
        };

        const rebuildData = (m) => {
          disposeData();
          assignment = NF.graph.assignVertices(mesh, m);
          const p = mesh.positions;
          const nodeById = new Map(m.nodes.map((n) => [n.id, n]));
          const posOf = (v) => new T.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
          placedNodes.clear(); pickPoints = [];
          for (const node of m.nodes) {
            const v = assignment.get(node.id);
            if (v == null) continue;
            placedNodes.set(node.id, { v, pos: posOf(v), kind: node.kind, label: node.label, colorVar: node.colorVar, refId: node.refId, noteId: node.noteId, sectionId: node.sectionId });
          }
          const routePairs = [];
          for (const e of [...m.contentEdges].sort((x, y) => y.score - x.score)) {
            const a = assignment.get(e.source), b = assignment.get(e.target);
            if (a != null && b != null) routePairs.push([a, b]);
          }
          contentRoutes = mesh.routeContentEdges(routePairs);

          const allPlaced = m.nodes.filter((n) => assignment.has(n.id));
          if (allPlaced.length) {
            const arr = new Float32Array(allPlaced.length * 3), carr = new Float32Array(allPlaced.length * 3);
            allPlaced.forEach((node, i) => {
              const v = assignment.get(node.id);
              arr[i * 3] = p[v * 3]; arr[i * 3 + 1] = p[v * 3 + 1]; arr[i * 3 + 2] = p[v * 3 + 2];
              const c = colorOf(node.colorVar).clone().multiplyScalar(node.colorVar === '--text' ? 1.1 : node.kind === 'note' ? 1.15 : node.kind === 'group' ? 1.95 : 1.5);
              carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b;
            });
            const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); g.setAttribute('color', new T.BufferAttribute(carr, 3));
            const pts = new T.Points(g, new T.PointsMaterial({ map: dotTex, vertexColors: true, size: CENTER_SIZE, transparent: true, depthWrite: false, blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02 }));
            nodeGroup.add(pts); pickPoints.push({ points: pts, ids: allPlaced.map((n) => n.id) });
          }
          const byKind = {};
          for (const node of allPlaced) (byKind[node.kind] = byKind[node.kind] || []).push(node);
          for (const kind of Object.keys(byKind)) {
            const list = byKind[kind];
            const arr = new Float32Array(list.length * 3), carr = new Float32Array(list.length * 3);
            list.forEach((node, i) => {
              const v = assignment.get(node.id);
              arr[i * 3] = p[v * 3]; arr[i * 3 + 1] = p[v * 3 + 1]; arr[i * 3 + 2] = p[v * 3 + 2];
              const c = colorOf(node.colorVar).clone().multiplyScalar(node.colorVar === '--text' ? 0.8 : node.kind === 'group' ? 1.3 : 1.0);
              carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b;
            });
            const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); g.setAttribute('color', new T.BufferAttribute(carr, 3));
            const pts = new T.Points(g, new T.PointsMaterial({ map: ringTex, vertexColors: true, size: RING_SIZE[kind], transparent: true, opacity: kind === 'note' ? 0.72 : kind === 'group' ? 1.0 : 0.95, depthWrite: false, blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02 }));
            nodeGroup.add(pts); pickPoints.push({ points: pts, ids: list.map((n) => n.id) });
          }
          // dendrites
          {
            const lp = [], lc = [];
            for (const e of m.structureEdges) {
              if (!e.target.startsWith('s:')) continue;
              const a = assignment.get(e.source), b = assignment.get(e.target);
              if (a == null || b == null) continue;
              const col = colorOf(nodeById.get(e.target).colorVar);
              lp.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
              lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
            }
            if (lp.length) dendriteGroup.add(new T.LineSegments(lineGeo(lp, lc), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: wireBlend })));
          }
          // structure routes
          {
            const lp = [], lc = [];
            for (const e of m.structureEdges) {
              if (e.target.startsWith('s:')) continue;
              const a = assignment.get(e.source), b = assignment.get(e.target);
              if (a == null || b == null) continue;
              const col = colorOf(nodeById.get(e.target).colorVar).clone().multiplyScalar(1.3);
              const path = mesh.pathBetween(a, b);
              const seq = path && path.length >= 2 ? path : [a, b];
              for (let i = 0; i < seq.length - 1; i++) {
                const u = seq[i], w = seq[i + 1];
                lp.push(p[u * 3], p[u * 3 + 1], p[u * 3 + 2], p[w * 3], p[w * 3 + 1], p[w * 3 + 2]);
                lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
              }
            }
            if (lp.length) structureGroup.add(new T.LineSegments(lineGeo(lp, lc), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false, blending: wireBlend })));
          }
          // synapses
          {
            const syn = colorOf('--text');
            const lp = [], lc = [];
            for (const e of m.contentEdges) {
              const a = assignment.get(e.source), b = assignment.get(e.target);
              if (a == null || b == null) continue;
              const seq = routeContent(a, b);
              for (let i = 0; i < seq.length - 1; i++) {
                const u = seq[i], w = seq[i + 1];
                lp.push(p[u * 3], p[u * 3 + 1], p[u * 3 + 2], p[w * 3], p[w * 3 + 1], p[w * 3 + 2]);
                lc.push(syn.r, syn.g, syn.b, syn.r, syn.g, syn.b);
              }
            }
            if (lp.length) synapseGroup.add(new T.LineSegments(lineGeo(lp, lc), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, blending: T.AdditiveBlending })));
          }
          const conn = new Set();
          for (const e of m.contentEdges) { if (placedNodes.has(e.source)) conn.add(e.source); if (placedNodes.has(e.target)) conn.add(e.target); }
          connectedNoteNodeIds = [...conn];
        };
        rebuildData(model);

        // ── sparks / sweeps ──
        const TAIL = 4;
        const tmpV = new T.Vector3();
        const sampleAt = (pp, u, out) => {
          const d = Math.max(0, Math.min(1, u)) * pp.total;
          let i = 1;
          while (i < pp.cum.length - 1 && pp.cum[i] < d) i++;
          const j = i - 1, seg = pp.cum[i] - pp.cum[j] || 1, f = (d - pp.cum[j]) / seg;
          out.set(pp.pts[j * 3] + (pp.pts[i * 3] - pp.pts[j * 3]) * f, pp.pts[j * 3 + 1] + (pp.pts[i * 3 + 1] - pp.pts[j * 3 + 1]) * f, pp.pts[j * 3 + 2] + (pp.pts[i * 3 + 2] - pp.pts[j * 3 + 2]) * f);
        };
        const pathFromSeq = (seq, col) => {
          const pos = mesh.positions, pts = new Float32Array(seq.length * 3), cum = new Float32Array(seq.length);
          for (let i = 0; i < seq.length; i++) {
            pts[i * 3] = pos[seq[i] * 3]; pts[i * 3 + 1] = pos[seq[i] * 3 + 1]; pts[i * 3 + 2] = pos[seq[i] * 3 + 2];
            if (i > 0) { const dx = pts[i * 3] - pts[(i - 1) * 3], dy = pts[i * 3 + 1] - pts[(i - 1) * 3 + 1], dz = pts[i * 3 + 2] - pts[(i - 1) * 3 + 2]; cum[i] = cum[i - 1] + Math.hypot(dx, dy, dz); }
          }
          return { pts, cum, total: cum[seq.length - 1] || 1, r: col.r, g: col.g, b: col.b };
        };
        const sparkMat = () => new T.PointsMaterial({ map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02 });
        const fxGroup = new T.Group(); brainGroup.add(fxGroup);

        let hoverLines = [], hoverStartT = 0;
        let litMat = null, lastLitKey = '';
        const rebuildLit = (noteIds) => {
          clearGroup(litGroup); litMat = null;
          if (noteIds.size === 0) return;
          const pos = [], col = [];
          for (const info of placedNodes.values()) {
            if (info.kind !== 'note' || !info.noteId || !noteIds.has(info.noteId)) continue;
            pos.push(info.pos.x, info.pos.y, info.pos.z);
            const c = colorOf(info.colorVar).clone().multiplyScalar(2.4); col.push(c.r, c.g, c.b);
          }
          if (pos.length === 0) return;
          const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
          litMat = new T.PointsMaterial({ map: ringTex, vertexColors: true, size: RING_SIZE.note * 1.9, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, alphaTest: 0.02 });
          litGroup.add(new T.Points(g, litMat));
        };

        const AMBIENT_MAX = 6;
        const ambient = [];
        let nextAmbientAt = 1.5;
        const ambientCol = wireColor.clone().multiplyScalar(1.4);
        const ambientGeo = new T.BufferGeometry();
        ambientGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(AMBIENT_MAX * TAIL * 3), 3));
        ambientGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(AMBIENT_MAX * TAIL * 3), 3));
        ambientGeo.setDrawRange(0, 0);
        const ambientMat = sparkMat(); ambientMat.size = 0.03;
        fxGroup.add(new T.Points(ambientGeo, ambientMat));

        // post — skipped on lowPower: UnrealBloomPass runs a full-res blur chain per frame,
        // which is what tanks mobile GPUs when several brains are mounted.
        let composer = null, bloom = null;
        if (!lowPower) {
          composer = new T.EffectComposer(renderer);
          composer.addPass(new T.RenderPass(scene, camera));
          bloom = new T.UnrealBloomPass(new T.Vector2(width, height), LOOK.bloomStrength, LOOK.bloomRadius, Math.max(LOOK.bloomThreshold, opts.transparent ? 0 : bgLum));
          composer.addPass(bloom);
          composer.setPixelRatio(pixelRatio);
          composer.setSize(width, height);
        }
        const renderFrame = () => { if (composer) composer.render(); else renderer.render(scene, camera); };

        const ro = new ResizeObserver(() => {
          const w = container.clientWidth || 1, h = container.clientHeight || 1;
          // Skip no-op resizes (initial observe fire, mobile URL-bar show/hide): re-setting
          // canvas.width reallocates the drawing buffer and stalls the GPU on readback.
          if (w === width && h === height) return;
          width = w; height = h;
          camera.aspect = width / height; applyViewOffset();
          renderer.setSize(width, height);
          if (composer) { composer.setSize(width, height); bloom.setSize(width, height); }
          if (motionDone) renderFrame(); // static (reduced-motion) frame must track resizes
        });
        ro.observe(container);

        // interaction
        const raycaster = new T.Raycaster();
        const ndc = new T.Vector2();
        let hoverId = null, selectedId = null, lastHoverBuilt = null;
        let thinkSweeps = [], nextAutoSweepAt = 0, thinkingCursor = 0;
        let idleSweeps = [], nextIdleSweepAt = 4 + Math.random() * 4;
        const THINK_MAX = 6;
        const pickThinkingNode = () => {
          if (!connectedNoteNodeIds.length) return null;
          const lit = this._highlight;
          if (lit && lit.size) {
            const cited = connectedNoteNodeIds.filter((id) => { const info = placedNodes.get(id); return info && info.noteId != null && lit.has(info.noteId); });
            if (cited.length) return cited[thinkingCursor++ % cited.length];
          }
          return connectedNoteNodeIds[(Math.random() * connectedNoteNodeIds.length) | 0];
        };

        const labelLayer = document.createElement('div');
        labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
        container.appendChild(labelLayer);
        const labelPool = new Map();
        const v3 = new T.Vector3();
        const updateLabels = () => {
          if (!opts.labels) return;
          const camDist = camera.position.distanceTo(controls.target);
          const showFolders = camDist < 2.8, showNotes = camDist < 2.2;
          const fovScale = height / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
          const active = new Set();
          for (const [id, info] of placedNodes) {
            const focus = id === hoverId || id === selectedId;
            const show = focus || info.kind === 'group' || (info.kind === 'folder' && showFolders) || (info.kind === 'note' && showNotes);
            if (!show) continue;
            v3.copy(info.pos).project(camera);
            if (v3.z > 1) continue;
            const x = (v3.x * 0.5 + 0.5) * width, y = (-v3.y * 0.5 + 0.5) * height;
            if (x < -60 || x > width + 60 || y < -20 || y > height + 20) continue;
            let el = labelPool.get(id);
            if (!el) { el = document.createElement('div'); el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:11px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.9);will-change:transform;letter-spacing:.02em;'; labelLayer.appendChild(el); labelPool.set(id, el); }
            el.textContent = info.label.length > 24 ? info.label.slice(0, 23) + '…' : info.label;
            const ringPx = (RING_SIZE[info.kind] * fovScale) / Math.max(camera.position.distanceTo(info.pos), 0.001);
            const lift = Math.min(ringPx * 0.4 + 4, 110);
            el.style.left = x + 'px'; el.style.top = (y - lift) + 'px';
            el.style.color = colorOf(info.colorVar).getStyle();
            el.style.opacity = focus ? '1' : info.kind === 'group' ? '0.85' : '0.55';
            el.style.fontWeight = info.kind === 'group' ? '700' : '400';
            active.add(id);
          }
          for (const [id, el] of labelPool) if (!active.has(id)) { el.remove(); labelPool.delete(id); }
        };

        const pickAt = (clientX, clientY) => {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          raycaster.params.Points.threshold = 0.035;
          let bestId = null, bestDist = Infinity;
          for (const pp of pickPoints) {
            const hits = raycaster.intersectObject(pp.points, false);
            if (hits.length && hits[0].index != null && hits[0].distance < bestDist) { bestDist = hits[0].distance; bestId = pp.ids[hits[0].index]; }
          }
          const info = bestId ? placedNodes.get(bestId) : undefined;
          return info ? { id: bestId, info } : null;
        };

        const buildSweepLines = (id, group) => {
          const lines = [], objects = [];
          const info = placedNodes.get(id);
          if (!info) return { lines, marker: null, objects };
          const mg = new T.BufferGeometry();
          mg.setAttribute('position', new T.Float32BufferAttribute([info.pos.x, info.pos.y, info.pos.z], 3));
          const marker = new T.Points(mg, new T.PointsMaterial({ map: ringTex, color: colorOf(info.colorVar).clone().multiplyScalar(1.8), size: 0.07, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, alphaTest: 0.02 }));
          group.add(marker); objects.push(marker);
          const noteId = info.noteId;
          if (!noteId) return { lines, marker, objects };
          const m = model, pos = mesh.positions, self = 'n:' + noteId;
          const col = colorOf(info.colorVar).clone().multiplyScalar(1.6);
          for (const e of m.contentEdges) {
            const isSrc = e.source === self, isTgt = e.target === self;
            if (!isSrc && !isTgt) continue;
            const a = assignment.get(e.source), b = assignment.get(e.target);
            if (a == null || b == null) continue;
            let seq = routeContent(a, b);
            if (!isSrc) seq = seq.slice().reverse();
            const n = seq.length;
            if (n < 2) continue;
            const posArr = new Float32Array(n * 3), arc = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              posArr[i * 3] = pos[seq[i] * 3]; posArr[i * 3 + 1] = pos[seq[i] * 3 + 1]; posArr[i * 3 + 2] = pos[seq[i] * 3 + 2];
              if (i > 0) { const dx = posArr[i * 3] - posArr[(i - 1) * 3], dy = posArr[i * 3 + 1] - posArr[(i - 1) * 3 + 1], dz = posArr[i * 3 + 2] - posArr[(i - 1) * 3 + 2]; arc[i] = arc[i - 1] + Math.hypot(dx, dy, dz); }
            }
            const total = arc[n - 1] || 1;
            for (let i = 0; i < n; i++) arc[i] /= total;
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.BufferAttribute(posArr, 3));
            const colorAttr = new T.BufferAttribute(new Float32Array(n * 3), 3);
            g.setAttribute('color', colorAttr);
            const line = new T.Line(g, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
            group.add(line); objects.push(line);
            lines.push({ colorAttr, arc, n, r: col.r, g: col.g, b: col.b });
          }
          return { lines, marker, objects };
        };
        const rebuildHover = (id) => { clearGroup(hoverGroup); hoverLines = id ? buildSweepLines(id, hoverGroup).lines : []; };

        const clock = new T.Clock();
        let raf = 0;
        let inView = true;      // updated by the IntersectionObserver below
        let motionDone = false; // reduced-motion: loop stopped for good after a few frames
        let settleFrames = 0;
        const animate = () => {
          const t = clock.getElapsedTime();
          controls.update();
          // Scroll-driven dive: pull the camera *in* along its view direction so the
          // wireframe swells to fill the screen as you scroll — like plunging into the
          // brain. Set to an *absolute* radius each frame (after controls.update) so it
          // never compounds with, or gets clamped by, the auto-rotate orbit.
          const sp = this._scroll || 0;
          if (sp > 0) {
            tmpV.copy(camera.position).sub(controls.target);
            const r = tmpV.length() || 1;
            tmpV.multiplyScalar((opts.cam * (1 - sp * 0.74)) / r);
            camera.position.copy(controls.target).add(tmpV);
          }
          synapseGroup.visible = opts.contentEdges;
          if (hoverId !== lastHoverBuilt) { rebuildHover(hoverId); lastHoverBuilt = hoverId; hoverStartT = t; }
          updateLabels();

          if (!hoverId && this._thinking && connectedNoteNodeIds.length) {
            if (t >= nextAutoSweepAt && thinkSweeps.length < THINK_MAX) {
              const id = pickThinkingNode();
              const built = id ? buildSweepLines(id, thinkGroup) : null;
              if (built && built.lines.length) thinkSweeps.push(Object.assign({}, built, { start: t, dur: 0.6 + Math.random() * 0.3 }));
              else if (built) built.objects.forEach((o) => removeObj(thinkGroup, o));
              nextAutoSweepAt = t + 0.16 + Math.random() * 0.12;
            }
          } else if (thinkSweeps.length) { clearGroup(thinkGroup); thinkSweeps = []; }

          // idle content sweeps — always-on, lower rate / fewer than hover-thinking
          if (!hoverId && !this._thinking && connectedNoteNodeIds.length && idleSweeps.length < 2) {
            if (t >= nextIdleSweepAt) {
              const id = connectedNoteNodeIds[(Math.random() * connectedNoteNodeIds.length) | 0];
              const built = id ? buildSweepLines(id, idleGroup) : null;
              if (built && built.lines.length) idleSweeps.push(Object.assign({}, built, { start: t, dur: 0.7 + Math.random() * 0.4 }));
              else if (built) built.objects.forEach((o) => removeObj(idleGroup, o));
              nextIdleSweepAt = t + 3.5 + Math.random() * 4.5;
            }
          }

          const litSet = this._highlight;
          const litKey = litSet && litSet.size ? [...litSet].sort().join(',') : '';
          if (litKey !== lastLitKey) { rebuildLit(litSet || new Set()); lastLitKey = litKey; }
          if (litMat) litMat.opacity = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4.5));

          const EDGE = 0.06;
          if (hoverLines.length) {
            const h = Math.min(2, (t - hoverStartT) / 0.22);
            for (const hl of hoverLines) { const ca = hl.colorAttr; for (let i = 0; i < hl.n; i++) { const f = Math.max(0, Math.min(1, (h - hl.arc[i]) / EDGE)); ca.setXYZ(i, hl.r * f, hl.g * f, hl.b * f); } ca.needsUpdate = true; }
          }
          for (let s = thinkSweeps.length - 1; s >= 0; s--) {
            const sw = thinkSweeps[s]; const age = t - sw.start;
            if (age >= sw.dur) { for (const o of sw.objects) removeObj(thinkGroup, o); thinkSweeps.splice(s, 1); continue; }
            const h = age / 0.1, life = age / sw.dur, env = life < 0.6 ? 1 : 1 - (life - 0.6) / 0.4;
            if (sw.marker) sw.marker.material.opacity = env;
            for (const hl of sw.lines) { const ca = hl.colorAttr; for (let i = 0; i < hl.n; i++) { const f = Math.max(0, Math.min(1, (h - hl.arc[i]) / EDGE)) * env; ca.setXYZ(i, hl.r * f, hl.g * f, hl.b * f); } ca.needsUpdate = true; }
          }
          for (let s = idleSweeps.length - 1; s >= 0; s--) {
            const sw = idleSweeps[s]; const age = t - sw.start;
            if (age >= sw.dur) { for (const o of sw.objects) removeObj(idleGroup, o); idleSweeps.splice(s, 1); continue; }
            const h = age / 0.1, life = age / sw.dur, env = life < 0.6 ? 1 : 1 - (life - 0.6) / 0.4;
            if (sw.marker) sw.marker.material.opacity = env * 0.8;
            for (const hl of sw.lines) { const ca = hl.colorAttr; for (let i = 0; i < hl.n; i++) { const f = Math.max(0, Math.min(1, (h - hl.arc[i]) / EDGE)) * env; ca.setXYZ(i, hl.r * f, hl.g * f, hl.b * f); } ca.needsUpdate = true; }
          }

          if (t >= nextAmbientAt && ambient.length < AMBIENT_MAX && mesh.edges.length >= 2) {
            const ei = (Math.random() * (mesh.edges.length / 2)) | 0;
            let a = mesh.edges[ei * 2], b = mesh.edges[ei * 2 + 1];
            if (Math.random() < 0.5) { const tmp = a; a = b; b = tmp; }
            ambient.push({ path: pathFromSeq([a, b], ambientCol), start: t, dur: 0.3 + Math.random() * 0.2 });
            nextAmbientAt = t + 1.4 + Math.random() * 2.4;
          }
          {
            for (let i = ambient.length - 1; i >= 0; i--) if ((t - ambient[i].start) / ambient[i].dur >= 1) ambient.splice(i, 1);
            const posAttr = ambientGeo.getAttribute('position'), colAttr = ambientGeo.getAttribute('color');
            let w = 0;
            for (const am of ambient) {
              const head = (t - am.start) / am.dur, env = Math.sin(Math.PI * Math.min(head, 1));
              for (let k = 0; k < TAIL; k++) {
                const u = head - k * 0.06; sampleAt(am.path, u, tmpV);
                posAttr.setXYZ(w, tmpV.x, tmpV.y, tmpV.z);
                const f = (u >= 0 ? env : 0) * (1 - k / TAIL);
                colAttr.setXYZ(w, am.path.r * f, am.path.g * f, am.path.b * f); w++;
              }
            }
            posAttr.needsUpdate = true; colAttr.needsUpdate = true; ambientGeo.setDrawRange(0, w);
          }

          if (bloom) bloom.strength = (LOOK.bloomStrength + 0.08 * Math.sin(t * 1.1)) * (1 + sp * 0.7);
          wireMat.opacity = (wireOpacityFor(LOOK.wireOpacity) + 0.015 * Math.sin(t * 1.1 + 1)) * (1 + sp * 0.5);
          renderFrame();
          raf = 0;
          // Reduced motion: let a handful of frames settle the scene (data groups, labels),
          // then hold a static frame — no auto-rotate, no continuous loop.
          if (reducedMotion && ++settleFrames >= 5) { motionDone = true; return; }
          raf = requestAnimationFrame(animate);
        };
        // Only burn GPU while actually visible: the home page mounts up to three of these
        // scenes, so the loop pauses when the host leaves the viewport or the tab hides.
        // (The three.js clock keeps running while paused; the animation just skips ahead.)
        const startLoop = () => { if (!raf && !motionDone) raf = requestAnimationFrame(animate); };
        const stopLoop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
        const syncLoop = () => { if (inView && !document.hidden) startLoop(); else stopLoop(); };
        const io = new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; syncLoop(); });
        io.observe(this);
        const onVisibility = () => syncLoop();
        document.addEventListener('visibilitychange', onVisibility);
        startLoop();

        let downX = 0, downY = 0, moved = false, pointerActive = false;
        const onDown = (e) => { downX = e.clientX; downY = e.clientY; moved = false; pointerActive = true; controls.autoRotate = false; };
        const onMove = (e) => {
          if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
          if (pointerActive) return;
          const hit = pickAt(e.clientX, e.clientY);
          hoverId = hit ? hit.id : null;
          renderer.domElement.style.cursor = hit && (hit.info.kind === 'note' || hit.info.kind === 'section' || hit.info.kind === 'group') ? 'pointer' : 'grab';
        };
        const onUp = (e) => {
          pointerActive = false;
          if (moved) return;
          const hit = pickAt(e.clientX, e.clientY);
          if (!hit) { selectedId = null; return; }
          selectedId = selectedId === hit.id ? null : hit.id;
          this.dispatchEvent(new CustomEvent('nodeactivate', { detail: { id: hit.id, info: hit.info } }));
        };
        const onLeave = () => { hoverId = null; };
        if (opts.controls) {
          renderer.domElement.addEventListener('pointerdown', onDown);
          renderer.domElement.addEventListener('pointermove', onMove);
          renderer.domElement.addEventListener('pointerup', onUp);
          renderer.domElement.addEventListener('pointerleave', onLeave);
        }

        this._resetView = () => { camera.position.set(0, 0.18, opts.cam); controls.target.set(0, -0.05, 0); controls.autoRotate = !reducedMotion; };
        this._dbg = { renderer, scene, camera, composer, bloom, brainGroup };

        return () => {
          cancelAnimationFrame(raf); raf = 0; ro.disconnect();
          io.disconnect();
          document.removeEventListener('visibilitychange', onVisibility);
          if (opts.controls) {
            renderer.domElement.removeEventListener('pointerdown', onDown);
            renderer.domElement.removeEventListener('pointermove', onMove);
            renderer.domElement.removeEventListener('pointerup', onUp);
            renderer.domElement.removeEventListener('pointerleave', onLeave);
          }
          controls.dispose();
          for (const el of labelPool.values()) el.remove();
          if (labelLayer.parentNode === container) container.removeChild(labelLayer);
          wireframe.geometry.dispose(); wireMat.dispose();
          dots.geometry.dispose(); dotMat.dispose(); dotTex.dispose();
          ringTex.dispose();
          disposeData(); clearGroup(hoverGroup); clearGroup(thinkGroup); clearGroup(idleGroup); clearGroup(litGroup);
          ambientGeo.dispose(); ambientMat.dispose();
          if (composer && typeof composer.dispose === 'function') composer.dispose(); renderer.dispose();
          if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
        };
      };

      let teardown = buildScene();
      this._rebuildAll = () => { if (teardown) teardown(); teardown = buildScene(); };
      this._cleanup = () => { if (teardown) teardown(); teardown = null; };
    }
  }

  if (!customElements.get('noteflow-brain')) customElements.define('noteflow-brain', NoteflowBrain);
})();
