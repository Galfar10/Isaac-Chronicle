import type { ItemKind } from '@irtc/protocol';

export interface SourceRef {
  name: 'game' | 'wiki' | 'manual';
  url: string | null;
  license: string | null;
}

/** One item as produced by an importer. Every field is optional except identity. */
export interface RawItem {
  kind: ItemKind;
  id: number;
  name?: string;
  nameEs?: string;
  quote?: string;
  quoteEs?: string;
  description?: string;
  quality?: number;
  type?: string;
  maxCharges?: number;
  gfx?: string;
  imageRemote?: string;
  pools?: string[];
  tags?: string[];
  effects?: string[];
  statCaches?: string[];
  source: SourceRef;
}

export interface RawSynergy {
  a: { kind: ItemKind; id: number };
  /** Partner as referenced on the wiki (resolved to an id during normalization). */
  b: { kind: ItemKind; name: string; id?: number };
  description: string;
  source: SourceRef;
}

export interface RawCharacter {
  id: number;
  name: string;
  nameEs?: string;
  tainted: boolean;
}

export interface RawTransformation {
  id: number;
  name: string;
  nameEs?: string;
  tag?: string;
  required?: number;
}

export interface ImportedDataset {
  generatedAt: string;
  source: SourceRef['name'];
  gameVersion?: string;
  items: RawItem[];
  synergies: RawSynergy[];
  characters: RawCharacter[];
  transformations: RawTransformation[];
}

export interface NormalizedItem {
  kind: ItemKind;
  id: number;
  name: string;
  nameEs: string | null;
  quote: string | null;
  quoteEs: string | null;
  description: string | null;
  quality: number | null;
  type: string | null;
  maxCharges: number | null;
  gfx: string | null;
  imageRemote: string | null;
  pools: string[];
  tags: string[];
  effects: string[];
  statCaches: string[];
  sources: SourceRef[];
}

export interface NormalizedSynergy {
  a: { kind: ItemKind; id: number };
  b: { kind: ItemKind; id: number };
  description: string;
  source: SourceRef;
}

export interface NormalizedDataset {
  version: string;
  items: NormalizedItem[];
  synergies: NormalizedSynergy[];
  characters: RawCharacter[];
  transformations: RawTransformation[];
}
