// Brain graph model — standalone copy of the app's type contract (src/components/Brain/useBrainGraph.ts
// + src/types/index.ts GroupColor). The web build has no notes/stores, so there's no hook: the graph
// is provided statically (see sampleGraph.ts). Node ids are prefixed so groups, folders, notes and
// sections never collide: `g:<id>`, `f:<id>`, `n:<id>`, `s:<id>`.

export type GroupColor =
  | '--accent'
  | '--accent-2'
  | '--red'
  | '--cyan'
  | '--purple'
  | '--text'
  | '--orange'
  | '--pink';

export type BrainNodeKind = 'group' | 'folder' | 'note' | 'section';

export interface BrainNode {
  id: string;
  kind: BrainNodeKind;
  label: string;
  colorVar: GroupColor; // group color; folders/notes inherit their group's (ungrouped → --text)
  refId: string;
  noteId?: string;
  sectionId?: string;
  favorited?: boolean;
}

export interface BrainStructureEdge {
  source: string;
  target: string;
}
export interface BrainContentEdge {
  source: string;
  target: string;
  score: number;
}

export interface BrainGraphModel {
  nodes: BrainNode[];
  structureEdges: BrainStructureEdge[];
  contentEdges: BrainContentEdge[];
}
