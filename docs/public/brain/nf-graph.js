/* NoteFlow brain — graph model, sample graph, vertex assignment & palette.
   Vanilla port of sampleGraph.ts + assign.ts + colors.ts. Attaches to window.NF.graph. */
(function () {
  const NF = (window.NF = window.NF || {});
  const REGION_CODE = NF.mesh.REGION_CODE;

  // ── sample brain graph (a believable developer's second brain) ──
  function buildSampleGraph() {
    const nodes = [], structureEdges = [], contentEdges = [];
    function addGroup(gid, name, color) { const id = 'g:' + gid; nodes.push({ id, kind: 'group', label: name, colorVar: color, refId: gid }); return id; }
    function addFolder(fid, name, color, groupId) { const id = 'f:' + fid; nodes.push({ id, kind: 'folder', label: name, colorVar: color, refId: fid }); structureEdges.push({ source: groupId, target: id }); return id; }
    function addNote(spec, colorVar, parentId) {
      const id = 'n:' + spec.id;
      const sections = spec.sections || [];
      nodes.push({ id, kind: 'note', label: spec.label, colorVar, refId: spec.id, noteId: spec.id, sectionId: spec.id + '-s0', favorited: spec.favorited });
      if (parentId) structureEdges.push({ source: parentId, target: id });
      if (sections.length >= 2) {
        sections.forEach((name, i) => {
          const sid = 's:' + spec.id + '-s' + i;
          nodes.push({ id: sid, kind: 'section', label: name, colorVar, refId: spec.id + '-s' + i, noteId: spec.id, sectionId: spec.id + '-s' + i, favorited: spec.favorited });
          structureEdges.push({ source: id, target: sid });
        });
      }
      return id;
    }

    const eng = addGroup('eng', 'Engineering', '--accent');
    const feFolder = addFolder('eng-fe', 'Frontend', '--accent', eng);
    addNote({ id: 'react-patterns', label: 'React patterns', sections: ['Hooks', 'Performance', 'State'] }, '--accent', feFolder);
    addNote({ id: 'css-arch', label: 'CSS architecture' }, '--accent', feFolder);
    const beFolder = addFolder('eng-be', 'Backend', '--accent', eng);
    addNote({ id: 'postgres', label: 'Postgres notes', sections: ['Indexes', 'Query plans'] }, '--accent', beFolder);
    addNote({ id: 'rust-async', label: 'Rust async' }, '--accent', beFolder);
    addNote({ id: 'k8s', label: 'Kubernetes cheatsheet' }, '--accent', eng);

    const research = addGroup('research', 'Research', '--purple');
    addNote({ id: 'rag', label: 'RAG architectures', sections: ['Retrieval', 'Reranking'] }, '--purple', research);
    addNote({ id: 'embeddings', label: 'Embeddings', sections: ['Models', 'Quantization'] }, '--purple', research);
    addNote({ id: 'agents', label: 'Agentic loops' }, '--purple', research);
    addNote({ id: 'eval', label: 'LLM evaluation' }, '--purple', research);

    const product = addGroup('product', 'Product', '--accent-2');
    addNote({ id: 'roadmap', label: 'Q3 roadmap' }, '--accent-2', product);
    addNote({ id: 'pricing', label: 'Pricing experiments' }, '--accent-2', product);
    addNote({ id: 'feedback', label: 'User feedback' }, '--accent-2', product);

    const writing = addGroup('writing', 'Writing', '--orange');
    addNote({ id: 'blog-brain', label: 'Blog: second brain' }, '--orange', writing);
    addNote({ id: 'newsletter', label: 'Newsletter ideas' }, '--orange', writing);

    addNote({ id: 'reading', label: 'Reading list', favorited: true }, '--text');
    addNote({ id: 'quotes', label: 'Quotes', favorited: true }, '--text');
    addNote({ id: 'daily', label: 'Daily log' }, '--text');
    addNote({ id: 'ideas', label: 'Random ideas' }, '--text');

    const rel = [
      ['rag', 'embeddings', 0.92], ['rag', 'agents', 0.84], ['agents', 'eval', 0.71],
      ['rag', 'blog-brain', 0.68], ['agents', 'blog-brain', 0.66], ['react-patterns', 'css-arch', 0.74],
      ['postgres', 'rust-async', 0.6], ['rust-async', 'k8s', 0.55], ['embeddings', 'postgres', 0.5],
      ['roadmap', 'pricing', 0.7], ['roadmap', 'agents', 0.52], ['feedback', 'roadmap', 0.64],
      ['blog-brain', 'newsletter', 0.72], ['ideas', 'blog-brain', 0.6], ['reading', 'quotes', 0.5],
      ['daily', 'ideas', 0.46], ['eval', 'embeddings', 0.58],
    ];
    for (const r of rel) contentEdges.push({ source: 'n:' + r[0], target: 'n:' + r[1], score: r[2] });

    return { nodes, structureEdges, contentEdges };
  }

  // ── vertex assignment ──
  const GROUP_LOBES = ['frontal', 'temporal', 'occipital'];
  const CEREBRUM = new Set([REGION_CODE.frontal, REGION_CODE.parietal, REGION_CODE.temporal, REGION_CODE.occipital]);
  const CEREBELLUM = new Set([REGION_CODE.cerebellum]);

  function assignVertices(mesh, model) {
    const assignment = new Map();
    const free = new Set();
    for (let i = 0; i < mesh.vertexCount; i++) free.add(i);
    const pos = mesh.positions;
    const claimed = [];
    const claim = (id, v) => { assignment.set(id, v); free.delete(v); claimed.push(v); };
    const dist2 = (a, b) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
    const anyFreeIn = (allowed) => { for (const v of free) if (allowed.has(mesh.regionOf[v])) return v; return -1; };
    const seedInRegion = (region, allowed) => {
      const verts = mesh.verticesByRegion[region];
      if (!claimed.length) { for (const v of verts) if (free.has(v)) return v; }
      let best = -1, bestScore = -Infinity;
      for (const v of verts) {
        if (!free.has(v)) continue;
        let nd = Infinity;
        for (const c of claimed) { const d = dist2(v, c); if (d < nd) nd = d; }
        if (nd > bestScore) { bestScore = nd; best = v; }
      }
      return best >= 0 ? best : anyFreeIn(allowed);
    };
    const nearestFree = (start, region, allowed) => {
      if (start < 0) return anyFreeIn(allowed);
      const want = REGION_CODE[region];
      const seen = new Uint8Array(mesh.vertexCount);
      const q = [start]; seen[start] = 1;
      let head = 0, fallback = -1;
      while (head < q.length) {
        const cur = q[head++];
        if (free.has(cur) && allowed.has(mesh.regionOf[cur])) {
          if (mesh.regionOf[cur] === want) return cur;
          if (fallback < 0) fallback = cur;
        }
        for (const nb of mesh.adjacency[cur]) if (!seen[nb]) { seen[nb] = 1; q.push(nb); }
      }
      return fallback >= 0 ? fallback : anyFreeIn(allowed);
    };
    const freeNeighbor = (v, allowed) => { for (const nb of mesh.adjacency[v]) if (free.has(nb) && allowed.has(mesh.regionOf[nb])) return nb; return -1; };

    const parentOf = new Map();
    for (const e of model.structureEdges) parentOf.set(e.target, e.source);
    const regionByNode = new Map();
    const anchorOf = new Map();
    const allowedOf = new Map();
    let lobeIdx = 0;

    for (const node of model.nodes) {
      if (node.kind === 'group') {
        const region = GROUP_LOBES[lobeIdx++ % GROUP_LOBES.length];
        const v = seedInRegion(region, CEREBRUM);
        if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v); }
        regionByNode.set(node.id, region); allowedOf.set(node.id, CEREBRUM);
      } else if (node.kind === 'folder') {
        const pg = parentOf.get(node.id);
        const region = (pg !== undefined ? regionByNode.get(pg) : undefined) || 'parietal';
        const pa = pg !== undefined ? anchorOf.get(pg) : undefined;
        const v = nearestFree(pa != null ? pa : seedInRegion(region, CEREBRUM), region, CEREBRUM);
        if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v); }
        regionByNode.set(node.id, region); allowedOf.set(node.id, CEREBRUM);
      } else if (node.kind === 'note') {
        const coloured = node.colorVar !== '--text';
        let region, anchor, allowed;
        if (coloured) {
          const p = parentOf.get(node.id);
          region = (p !== undefined ? regionByNode.get(p) : undefined) || 'parietal';
          anchor = (p !== undefined ? anchorOf.get(p) : undefined);
          if (anchor == null) anchor = seedInRegion(region, CEREBRUM);
          allowed = CEREBRUM;
        } else if (node.favorited) {
          region = 'cerebellum'; anchor = seedInRegion(region, CEREBELLUM); allowed = CEREBELLUM;
        } else {
          region = 'parietal'; anchor = seedInRegion(region, CEREBRUM); allowed = CEREBRUM;
        }
        const v = nearestFree(anchor, region, allowed);
        if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v); }
        regionByNode.set(node.id, region); allowedOf.set(node.id, allowed);
      } else {
        const noteNodeId = 'n:' + node.noteId;
        const noteV = anchorOf.get(noteNodeId);
        if (noteV == null) continue;
        const allowed = allowedOf.get(noteNodeId) || CEREBRUM;
        let v = freeNeighbor(noteV, allowed);
        if (v < 0) v = nearestFree(noteV, regionByNode.get(noteNodeId) || 'parietal', allowed);
        if (v >= 0) claim(node.id, v);
      }
    }
    return assignment;
  }

  // ── palette: read CSS vars (space/comma RGB triples) ──
  function readVar(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parts = raw.split(/[\s,]+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) return [parts[0], parts[1], parts[2]];
    return [128, 128, 128];
  }
  // The graph tags groups/notes with the site accent tokens (--accent, --purple, …), but the
  // wireframe should glow in the saturated app palette. Remap those tokens to the --brain-*
  // synapse colours; everything else (e.g. --text for favourites) reads through unchanged.
  const BRAIN_ACCENTS = {
    '--accent': '--brain-accent', '--accent-2': '--brain-accent-2', '--purple': '--brain-purple',
    '--orange': '--brain-orange', '--cyan': '--brain-cyan', '--pink': '--brain-pink', '--red': '--brain-red',
  };
  function readBrainPalette() {
    const cache = new Map();
    const color = (cssVar) => {
      const v = BRAIN_ACCENTS[cssVar] || cssVar;
      let c = cache.get(v); if (!c) { c = readVar(v); cache.set(v, c); } return c;
    };
    return {
      bg: readVar('--brain-bg'),
      text: readVar('--brain-text'),
      color,
    };
  }

  NF.graph = { buildSampleGraph, assignVertices, readBrainPalette };
})();
