/* NoteFlow background mesh — a sparse 2D echo of the 3D brain. Nodes are scattered across the
   whole page (a jittered grid, so the spread is even but organic) and each is wired to its
   nearest neighbours, forming an interconnected web rather than disjoint straight scratches.
   The lines you SEE are the same links the impulses travel along, so a spark always follows the
   mesh node → node → node instead of darting along invisible paths. "Relationships" fire as
   fast, coloured sparks that zig-zag from one node to another (the brain's synapses). The field
   drifts with scroll (parallax) so fresh parts of the web slide into view. Reads --brain-bg /
   --brain-text + the --brain-* accents so it recolours with the theme. No dependencies. */
(function () {
  function readTriple(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const p = raw.split(/[\s,]+/).map(Number);
    return (p.length >= 3 && p.every((n) => !Number.isNaN(n))) ? [p[0], p[1], p[2]] : [20, 20, 26];
  }

  class NetBg extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = 'block';
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      this.appendChild(c);
      this._canvas = c;
      this._ctx = c.getContext('2d');
      this._reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._readColors();
      this._resize();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._mo = new MutationObserver(() => { this._readColors(); if (this._reduced) this._drawStatic(); });
      this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      // The document can grow taller after late images/fonts load — rebuild the field then
      // so the parallax covers the whole page.
      this._onLoad = () => this._resize();
      window.addEventListener('load', this._onLoad);
      this._loop = this._loop.bind(this);
      // Reduced motion: the mesh is drawn once per resize/theme change and the loop never
      // starts (no sparks, no twinkle). Otherwise animate, but pause while the tab is
      // hidden — shifting _t0 by the hidden span so the phases don't jump on resume.
      if (!this._reduced) this._raf = requestAnimationFrame(this._loop);
      this._onVis = () => {
        if (this._reduced) return;
        if (document.hidden) {
          cancelAnimationFrame(this._raf);
          this._raf = 0;
          this._hiddenAt = performance.now();
        } else {
          if (this._hiddenAt && this._t0) this._t0 += performance.now() - this._hiddenAt;
          this._hiddenAt = 0;
          if (!this._raf) this._raf = requestAnimationFrame(this._loop);
        }
      };
      document.addEventListener('visibilitychange', this._onVis);
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._mo) this._mo.disconnect();
      if (this._onLoad) window.removeEventListener('load', this._onLoad);
      if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    }

    _readColors() {
      const bg = readTriple('--brain-bg'), text = readTriple('--brain-text');
      const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
      this._dark = lum < 0.5;
      this._bg = 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')';
      const t = this._dark ? 0.6 : 0.72; // blend text toward bg → faint wire color
      this._wire = text.map((v, i) => Math.round(v + (bg[i] - v) * t));
      // Accent palette for the impulses — the same saturated synapse colours the brain uses.
      this._accents = ['--brain-accent', '--brain-accent-2', '--brain-purple', '--brain-orange', '--brain-cyan', '--brain-pink'].map(readTriple);
    }

    _resize() {
      // Cap the backing store harder on touch devices: phones pair high dpr with weak fill rate.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      const w = this.clientWidth || window.innerWidth;
      const h = this.clientHeight || window.innerHeight;
      this._w = w; this._h = h;
      this._canvas.width = Math.max(1, Math.round(w * dpr));
      this._canvas.height = Math.max(1, Math.round(h * dpr));
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._build();
      if (this._reduced) this._drawStatic();
    }

    // One still frame of the mesh (nodes + edges at their base brightness, no sparks) for
    // prefers-reduced-motion users. Re-run on resize and theme change.
    _drawStatic() {
      const ctx = this._ctx, w = this._w, h = this._h, edges = this._edges;
      if (!edges || !ctx) return;
      const wr = this._wire[0], wg = this._wire[1], wb = this._wire[2];
      const wcol = (a) => 'rgba(' + wr + ',' + wg + ',' + wb + ',' + a.toFixed(3) + ')';
      const off = -(window.scrollY || window.pageYOffset || 0) * this._parallax;
      ctx.fillStyle = this._bg;
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const base = this._dark ? 0.065 : 0.085;
      for (const e of edges) {
        const ay = e.a.y + off, by = e.b.y + off;
        if ((ay < -40 && by < -40) || (ay > h + 40 && by > h + 40)) continue;
        ctx.strokeStyle = wcol(base);
        ctx.beginPath(); ctx.moveTo(e.a.x, ay); ctx.lineTo(e.b.x, by); ctx.stroke();
      }
      const al = (this._dark ? 0.22 : 0.28) * 0.725; // mid-twinkle brightness, frozen
      ctx.fillStyle = wcol(al);
      for (const nd of this._allNodes) {
        const y = nd.y + off;
        if (y < -20 || y > h + 20) continue;
        ctx.beginPath(); ctx.arc(nd.x, y, nd.r, 0, 6.2832); ctx.fill();
      }
    }

    _build() {
      const w = this._w, h = this._h;
      // Parallax: the field drifts slower than the page so fresh mesh scrolls into view.
      this._parallax = 0.45;
      const docH = Math.max(document.documentElement.scrollHeight || h, h);
      // Virtual field height covering the whole scroll range plus a viewport of slack.
      const fieldH = docH * this._parallax + h;
      this._fieldH = fieldH;

      // Scatter nodes on a jittered grid: even coverage, but no rigid lattice.
      const target = Math.max(24, Math.min(200, Math.round((w * fieldH) / 52000)));
      const cols = Math.max(2, Math.round(Math.sqrt(target * w / fieldH)));
      const rows = Math.max(2, Math.round(target / cols));
      const cw = w / cols, ch = fieldH / rows;
      const nodes = [];
      for (let r = 0; r < rows; r++) {
        for (let cI = 0; cI < cols; cI++) {
          nodes.push({
            x: (cI + 0.5 + (Math.random() - 0.5) * 0.72) * cw,
            y: (r + 0.5 + (Math.random() - 0.5) * 0.72) * ch,
            r: 1 + Math.random() * 1.3, ph: Math.random() * 6.2832,
            sp: 0.4 + Math.random() * 0.8, lit: 0, near: [],
          });
        }
      }

      // Wire each node to its few nearest neighbours → the visible mesh. Edges are
      // deduplicated, and the same list drives the impulses, so what you see IS what
      // sparks travel along. O(n²) once at build time; n stays small (≤ 200).
      const maxR = Math.hypot(cw, ch) * 1.45;
      const K = 3;
      const edges = [];
      const seen = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        const cands = [];
        for (let j = 0; j < nodes.length; j++) {
          if (j === i) continue;
          const o = nodes[j];
          const d = Math.hypot(o.x - nd.x, o.y - nd.y);
          if (d < maxR) cands.push({ j, o, d });
        }
        cands.sort((p, q) => p.d - q.d);
        let added = 0;
        for (const cand of cands) {
          if (added >= K) break;
          const a = Math.min(i, cand.j), b = Math.max(i, cand.j);
          const key = a * 1000003 + b;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ a: nd, b: cand.o, ph: Math.random() * 6.2832, sp: 0.3 + Math.random() * 0.5 });
          added++;
        }
      }
      // Bidirectional adjacency for the sparks (both ends of every edge).
      for (const e of edges) { e.a.near.push(e.b); e.b.near.push(e.a); }

      this._nodes = nodes;
      this._allNodes = nodes;
      this._edges = edges;

      this._sparks = [];
      this._nextSpark = 1.6 + Math.random() * 2.5;
    }

    _spawnSpark(off, h, t) {
      const nodes = this._allNodes;
      if (!nodes || nodes.length < 2) return;
      const col = this._accents[(Math.random() * this._accents.length) | 0];

      // Only start where the flash will actually be seen.
      const vis = [];
      for (const nd of nodes) { const y = nd.y + off; if (y > -0.05 * h && y < 1.05 * h) vis.push(nd); }
      if (vis.length < 2) return;

      // Build a zig-zag path: hop from node to a near neighbour, again and again, so the
      // impulse darts THROUGH the mesh instead of drawing a straight a→b line. To keep it
      // streaking outward (rather than doubling back), bias each hop toward neighbours that
      // continue roughly the current heading.
      const start = vis[(Math.random() * vis.length) | 0];
      // Mostly short darts, but ~30% are LONG sweeps that streak across the field. Long ones
      // lean harder on the forward bias so they keep their heading instead of wandering.
      const long = Math.random() < 0.3;
      const hops = long ? 10 + (Math.random() * 12 | 0) : 3 + (Math.random() * 5 | 0); // 10..21 vs 3..7
      const fwd = long ? 1.1 : 0.6;
      const path = [start];
      let prev = null, cur = start;
      for (let i = 0; i < hops; i++) {
        const near = cur.near;
        if (!near || !near.length) break;
        // Heading we came in with (null on the first hop → go anywhere).
        let hx = 0, hy = 0;
        if (prev) { hx = cur.x - prev.x; hy = cur.y - prev.y; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m; }
        // Score candidates: random, but nudged to keep going forward.
        let next = null, best = -Infinity;
        for (const cand of near) {
          if (cand === prev || path.indexOf(cand) !== -1) continue;
          let score = Math.random();
          if (prev) {
            const dx = cand.x - cur.x, dy = cand.y - cur.y, m = Math.hypot(dx, dy) || 1;
            score += fwd * ((dx / m) * hx + (dy / m) * hy); // forward dot product
          }
          if (score > best) { best = score; next = cand; }
        }
        if (!next) break;
        path.push(next); prev = cur; cur = next;
      }
      if (path.length < 2) return;

      // Cumulative length along the polyline (for the travelling pulse + node lighting).
      const cum = [0];
      for (let i = 1; i < path.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
      }
      const len = cum[cum.length - 1] || 1;
      // Fast, but longer zig-zags take a touch more time so the sweep reads.
      const dur = 0.34 + (len / Math.max(this._w, h)) * 0.45 + Math.random() * 0.22;
      this._sparks.push({ path, cum, len, col, s: t, dur });
    }

    _loop(ts) {
      this._raf = requestAnimationFrame(this._loop);
      if (!this._t0) this._t0 = ts;
      const t = (ts - this._t0) / 1000;
      const ctx = this._ctx, w = this._w, h = this._h, edges = this._edges;
      if (!edges || !ctx) return;
      const wr = this._wire[0], wg = this._wire[1], wb = this._wire[2];
      const wcol = (a) => 'rgba(' + wr + ',' + wg + ',' + wb + ',' + a.toFixed(3) + ')';
      const off = -(window.scrollY || window.pageYOffset || 0) * this._parallax;

      ctx.fillStyle = this._bg;
      ctx.fillRect(0, 0, w, h);

      // Mesh links: each edge connects two neighbouring nodes; it brightens when either
      // endpoint is lit by a passing impulse.
      ctx.lineWidth = 1;
      for (const e of edges) {
        const ay = e.a.y + off, by = e.b.y + off;
        if ((ay < -40 && by < -40) || (ay > h + 40 && by > h + 40)) continue; // cull off-screen
        const base = (this._dark ? 0.065 : 0.085) + 0.022 * Math.sin(t * e.sp + e.ph);
        const lit = e.a.lit > e.b.lit ? e.a.lit : e.b.lit;
        ctx.strokeStyle = wcol(base + lit * 0.5);
        ctx.beginPath(); ctx.moveTo(e.a.x, ay); ctx.lineTo(e.b.x, by); ctx.stroke();
      }

      // Spawn impulses at a relaxed, random cadence (kept uncommon on purpose).
      if (t >= this._nextSpark) {
        this._spawnSpark(off, h, t);
        this._nextSpark = t + 1.6 + Math.random() * 3.2;
      }
      // Impulses: a coloured pulse zig-zagging node → node → node through the mesh,
      // tracing a glowing trail behind it as it goes.
      for (let i = this._sparks.length - 1; i >= 0; i--) {
        const s = this._sparks[i];
        const f = (t - s.s) / s.dur;
        if (f >= 1) { this._sparks.splice(i, 1); continue; }
        const env = Math.sin(Math.PI * f);
        const c = s.col;
        const ccol = (a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
        const path = s.path, cum = s.cum;
        const trav = s.len * f;

        // Locate the segment the pulse is on, and its position within it.
        let seg = 0;
        while (seg < cum.length - 2 && cum[seg + 1] <= trav) seg++;
        const segLen = (cum[seg + 1] - cum[seg]) || 1;
        const lf = Math.min(1, Math.max(0, (trav - cum[seg]) / segLen));
        const ax = path[seg].x, ay = path[seg].y + off;
        const bx = path[seg + 1].x, by = path[seg + 1].y + off;
        const px = ax + (bx - ax) * lf, py = ay + (by - ay) * lf;

        // The whole zig-zag glows faintly; the part already travelled glows brighter.
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = ccol(0.22 * env);
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y + off);
        for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y + off);
        ctx.stroke();
        ctx.strokeStyle = ccol(0.6 * env);
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y + off);
        for (let k = 1; k <= seg; k++) ctx.lineTo(path[k].x, path[k].y + off);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.lineWidth = 1;

        // Travelling pulse head.
        ctx.fillStyle = ccol(0.95 * env);
        ctx.beginPath(); ctx.arc(px, py, 2.3, 0, 6.2832); ctx.fill();

        // Light each node as the pulse sweeps past it.
        for (let k = 0; k < path.length; k++) {
          const d = trav - cum[k];
          const g = d >= 0 ? Math.max(0, 1 - d / 90) : Math.max(0, 1 + d / 36);
          if (g > 0) { path[k].lit = Math.max(path[k].lit, g * env); path[k].litCol = c; }
        }
      }

      // Nodes on top of the mesh.
      for (const nd of this._allNodes) {
        const y = nd.y + off;
        if (y < -20 || y > h + 20) { nd.lit *= 0.9; continue; }
        nd.lit *= 0.92;
        const tw = 0.5 + 0.5 * Math.sin(t * nd.sp + nd.ph);
        const al = Math.min(1, (this._dark ? 0.22 : 0.28) * (0.45 + 0.55 * tw) + nd.lit * 0.6);
        ctx.fillStyle = wcol(al);
        ctx.beginPath(); ctx.arc(nd.x, y, nd.r * (1 + nd.lit * 0.8), 0, 6.2832); ctx.fill();
        if (nd.lit > 0.05 && nd.litCol) {
          const lc = nd.litCol;
          // Coloured core + halo while an impulse is touching this node.
          ctx.fillStyle = 'rgba(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ',' + (nd.lit * 0.85).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nd.x, y, nd.r * (0.9 + nd.lit * 0.6), 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ',' + (nd.lit * 0.22).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(nd.x, y, nd.r * 3.4 * (0.5 + nd.lit), 0, 6.2832); ctx.fill();
        }
      }
    }
  }

  if (!customElements.get('nf-netbg')) customElements.define('nf-netbg', NetBg);
})();
