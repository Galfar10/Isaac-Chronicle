import { useEffect, useState } from 'react';
import type { ItemKind } from '@irtc/protocol';
import { useGameEvents, useItem } from '../lib/gameStore';
import { itemName, itemQuote, useLang } from '../lib/i18n';
import { ItemImage } from './ItemImage';
import { Quality } from './ItemCard';

/**
 * Floating popup that slides in from the bottom when a collectible/trinket appears
 * (useful on mobile or when the featured card is not on screen).
 */
export function SpawnPopup({ onOpen, enabled }: { onOpen: (r: { kind: ItemKind; id: number }) => void; enabled: boolean }) {
  const [current, setCurrent] = useState<{ kind: ItemKind; id: number; n: number } | null>(null);
  const lang = useLang();
  useGameEvents(
    (events) => {
      if (!enabled) return;
      // Only when the player is close enough to identify it (never on mere spawn).
      for (const e of events) {
        const data = e.event === 'item_revealed' || e.event === 'item_spawned' ? e.data : null;
        if (data && data.id !== null && data.revealed) {
          setCurrent((c) => ({ kind: data.kind, id: data.id!, n: (c?.n ?? 0) + 1 }));
          break;
        }
      }
      if (events.some((e) => e.event === 'room_changed')) setCurrent(null);
    },
    [enabled],
  );
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 7000);
    return () => clearTimeout(t);
  }, [current]);
  const { item } = useItem(current?.kind, current?.id);
  if (!current) return null;
  return (
    <button key={current.n} className="spawn-popup card-rise" onClick={() => onOpen(current)}>
      <ItemImage item={item} kind={current.kind} size={48} />
      <span className="spawn-popup__text">
        <span className="spawn-popup__label">OBJETO DISPONIBLE</span>
        <strong>{itemName(item, lang, `#${current.id}`)}</strong>
        <Quality q={item?.quality} />
        <em>{itemQuote(item, lang)}</em>
      </span>
    </button>
  );
}
