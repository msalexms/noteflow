// A curated example brain for the marketing hero. Mirrors what useBrainGraph builds from real
// notes (structure layer: group→folder→note→section; content layer: note↔note similarities), but
// hand-authored so the graph reads as a believable developer's second brain — clusters per topic
// with a few cross-topic synapses lighting up between them.

import type { BrainContentEdge, BrainGraphModel, BrainNode, BrainStructureEdge, GroupColor } from './graph';

const nodes: BrainNode[] = [];
const structureEdges: BrainStructureEdge[] = [];
const contentEdges: BrainContentEdge[] = [];

interface NoteSpec {
  id: string;
  label: string;
  sections?: string[];
  favorited?: boolean;
}

function addNote(spec: NoteSpec, colorVar: GroupColor, parentId?: string): string {
  const id = `n:${spec.id}`;
  const sections = spec.sections ?? [];
  nodes.push({
    id,
    kind: 'note',
    label: spec.label,
    colorVar,
    refId: spec.id,
    noteId: spec.id,
    sectionId: `${spec.id}-s0`,
    favorited: spec.favorited,
  });
  if (parentId) structureEdges.push({ source: parentId, target: id });
  // Single-section notes collapse to the soma (matches the app); 2+ sections become dendrites.
  if (sections.length >= 2) {
    sections.forEach((name, i) => {
      const sid = `s:${spec.id}-s${i}`;
      nodes.push({ id: sid, kind: 'section', label: name, colorVar, refId: `${spec.id}-s${i}`, noteId: spec.id, sectionId: `${spec.id}-s${i}`, favorited: spec.favorited });
      structureEdges.push({ source: id, target: sid });
    });
  }
  return id;
}

function addGroup(gid: string, name: string, color: GroupColor): string {
  const id = `g:${gid}`;
  nodes.push({ id, kind: 'group', label: name, colorVar: color, refId: gid });
  return id;
}

function addFolder(fid: string, name: string, color: GroupColor, groupId: string): string {
  const id = `f:${fid}`;
  nodes.push({ id, kind: 'folder', label: name, colorVar: color, refId: fid });
  structureEdges.push({ source: groupId, target: id });
  return id;
}

// ── Engineering ───────────────────────────────────────────────────────────────
const eng = addGroup('eng', 'Engineering', '--accent');
const feFolder = addFolder('eng-fe', 'Frontend', '--accent', eng);
addNote({ id: 'react-patterns', label: 'React patterns', sections: ['Hooks', 'Performance', 'State'] }, '--accent', feFolder);
addNote({ id: 'css-arch', label: 'CSS architecture' }, '--accent', feFolder);
const beFolder = addFolder('eng-be', 'Backend', '--accent', eng);
addNote({ id: 'postgres', label: 'Postgres notes', sections: ['Indexes', 'Query plans'] }, '--accent', beFolder);
addNote({ id: 'rust-async', label: 'Rust async' }, '--accent', beFolder);
addNote({ id: 'k8s', label: 'Kubernetes cheatsheet' }, '--accent', eng);

// ── Research ──────────────────────────────────────────────────────────────────
const research = addGroup('research', 'Research', '--purple');
addNote({ id: 'rag', label: 'RAG architectures', sections: ['Retrieval', 'Reranking'] }, '--purple', research);
addNote({ id: 'embeddings', label: 'Embeddings', sections: ['Models', 'Quantization'] }, '--purple', research);
addNote({ id: 'agents', label: 'Agentic loops' }, '--purple', research);
addNote({ id: 'eval', label: 'LLM evaluation' }, '--purple', research);

// ── Product ───────────────────────────────────────────────────────────────────
const product = addGroup('product', 'Product', '--accent-2');
addNote({ id: 'roadmap', label: 'Q3 roadmap' }, '--accent-2', product);
addNote({ id: 'pricing', label: 'Pricing experiments' }, '--accent-2', product);
addNote({ id: 'feedback', label: 'User feedback' }, '--accent-2', product);

// ── Writing ───────────────────────────────────────────────────────────────────
const writing = addGroup('writing', 'Writing', '--orange');
addNote({ id: 'blog-brain', label: 'Blog: second brain' }, '--orange', writing);
addNote({ id: 'newsletter', label: 'Newsletter ideas' }, '--orange', writing);

// ── Ungrouped (parietal) + favorites (cerebellum) ─────────────────────────────
addNote({ id: 'reading', label: 'Reading list', favorited: true }, '--text');
addNote({ id: 'quotes', label: 'Quotes', favorited: true }, '--text');
addNote({ id: 'daily', label: 'Daily log' }, '--text');
addNote({ id: 'ideas', label: 'Random ideas' }, '--text');

// ── Content layer (synapses) — cross-topic relations that light up ────────────
const rel: Array<[string, string, number]> = [
  ['rag', 'embeddings', 0.92],
  ['rag', 'agents', 0.84],
  ['agents', 'eval', 0.71],
  ['rag', 'blog-brain', 0.68],
  ['agents', 'blog-brain', 0.66],
  ['react-patterns', 'css-arch', 0.74],
  ['postgres', 'rust-async', 0.6],
  ['rust-async', 'k8s', 0.55],
  ['embeddings', 'postgres', 0.5],
  ['roadmap', 'pricing', 0.7],
  ['roadmap', 'agents', 0.52],
  ['feedback', 'roadmap', 0.64],
  ['blog-brain', 'newsletter', 0.72],
  ['ideas', 'blog-brain', 0.6],
  ['reading', 'quotes', 0.5],
  ['daily', 'ideas', 0.46],
  ['eval', 'embeddings', 0.58],
];
for (const [a, b, score] of rel) contentEdges.push({ source: `n:${a}`, target: `n:${b}`, score });

export const SAMPLE_BRAIN_GRAPH: BrainGraphModel = { nodes, structureEdges, contentEdges };
