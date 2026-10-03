import { useEffect, useState } from 'react';
import type { ItemKind, ItemRecord } from '@irtc/protocol';
import { assetUrl } from '../lib/api';

interface Props {
  item: ItemRecord | null;
  kind: ItemKind;
  size?: number;
  hidden?: boolean;
  label?: string;
}

/**
 * Item sprite. Priority: local sprite from the user's extracted game files (served by
 * the Companion) -> remote wiki icon -> an original hand-drawn placeholder.
 */
export function ItemImage({ item, kind, size = 64, hidden, label }: Props) {
  const sources = [assetUrl(item?.image ?? null), item?.imageRemote ?? null].filter((s, i, a): s is string => !!s && a.indexOf(s) === i);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [item?.kind, item?.id]);
  const src = hidden ? null : sources[index];
  if (src) {
    return (
      <img
        className="item-img"
        src={src}
        width={size}
        height={size}
        alt={item?.name ?? label ?? ''}
        draggable={false}
        onError={() => setIndex((i) => i + 1)}
      />
    );
  }
  return <Placeholder kind={kind} size={size} glyph={hidden ? '?' : (item?.name ?? label ?? '?').slice(0, 1).toUpperCase()} />;
}

function Placeholder({ kind, size, glyph }: { kind: ItemKind; size: number; glyph: string }) {
  const shape =
    kind === 'card' ? (
      <rect x="18" y="10" width="28" height="44" rx="3" />
    ) : kind === 'pill' ? (
      <rect x="14" y="24" width="36" height="16" rx="8" />
    ) : kind === 'trinket' ? (
      <path d="M32 9l19 12-7 25H20l-7-25L32 9z" />
    ) : (
      <path d="M32 7c13 .3 24.5 10.8 24.4 24.6C56.2 45.4 45.5 56.8 32 57 18.3 57.2 7.4 46 7.6 32.1 7.8 18.6 18.6 6.8 32 7z" />
    );
  return (
    <svg className="item-img item-img--placeholder" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g fill="var(--parch-dark)" stroke="var(--ink-soft)" strokeWidth="2.4" strokeLinejoin="round" filter="url(#sketch)">
        {shape}
      </g>
      <text x="32" y="40" textAnchor="middle" fontFamily="var(--font-title)" fontSize="22" fill="var(--ink-soft)">
        {glyph}
      </text>
    </svg>
  );
}
