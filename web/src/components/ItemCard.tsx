import { useEffect, useMemo, useState } from 'react';
import type { ItemKind, ItemRecord, SynergyRecord, UnknownReason } from '@irtc/protocol';
import { fetchSynergiesFor } from '../lib/api';
import { useClient } from '../lib/gameStore';
import { itemName, itemQuote, refName, useLang } from '../lib/i18n';
import { useT, type T } from '../lib/strings';
import { ItemImage } from './ItemImage';
import { StarIcon } from './Icons';

const STAT_CACHES = ['damage', 'firedelay', 'range', 'shotspeed', 'speed', 'luck', 'flying', 'familiars', 'tearflag', 'all'] as const;
const ITEM_TYPES = ['passive', 'active', 'familiar', 'trinket', 'tarot', 'tarot_reverse', 'suit', 'rune', 'special', 'object'] as const;

export function Quality({ q }: { q: number | null | undefined }) {
  const t = useT();
  if (q === null || q === undefined) return null;
  return (
    <span className="quality" title={t('card.quality', { q })} aria-label={t('card.quality', { q })}>
      {[1, 2, 3, 4].map((i) => (
        <StarIcon key={i} size={18} filled={i <= q} />
      ))}
      <span className="quality__num">Q{q}</span>
    </span>
  );
}

/** Synergies of `item` with what the player currently owns. */
export function useOwnedSynergies(item: ItemRecord | null) {
  const { state } = useClient();
  const [all, setAll] = useState<SynergyRecord[] | null>(null);
  useEffect(() => {
    setAll(null);
    if (!item || (item.kind !== 'collectible' && item.kind !== 'trinket') || !item.synergyCount) return;
    let alive = true;
    void fetchSynergiesFor(item.kind, item.id).then((s) => alive && setAll(s));
    return () => {
      alive = false;
    };
  }, [item?.kind, item?.id, item?.synergyCount]);
  const owned = useMemo(() => {
    const inv = new Set<string>([
      ...state.inventory.collectibles.map((c) => `collectible:${c.id}`),
      ...state.inventory.trinkets.map((x) => `trinket:${x & 0x7fff}`),
    ]);
    if (!all || !item) return [];
    return all.filter((s) => {
      const other = s.a.kind === item.kind && s.a.id === item.id ? s.b : s.a;
      return inv.has(`${other.kind}:${other.id}`);
    });
  }, [all, item, state.inventory]);
  return { all, owned };
}

export function unknownName(kind: ItemKind, t: T): string {
  return t(`unknown.${kind}`);
}

function unknownText(kind: ItemKind, reason: UnknownReason, t: T): string {
  if (reason === 'blind') return t('unknown.blindText');
  if (reason === 'not_picked') return kind === 'pill' ? t('unknown.pillText') : t('unknown.cardText');
  if (kind === 'card' || kind === 'pill') return t('unknown.floorText');
  return t('unknown.farText');
}

export function kindLabel(kind: ItemKind, t: T): string {
  return t(`kind.${kind}`);
}

export function typeLabel(type: string | null | undefined, kind: ItemKind, t: T): string {
  if (type && (ITEM_TYPES as readonly string[]).includes(type)) return t(`type.${type as (typeof ITEM_TYPES)[number]}`);
  // Game pill classes look like "pill 2+": show just "Pill" / "Pastilla".
  if (!type || kind === 'pill') return kindLabel(kind, t);
  return type;
}

interface CardProps {
  item: ItemRecord | null;
  kind: ItemKind;
  id: number | null;
  /** Why the item is not identified (id is null). */
  unknown?: UnknownReason | null;
  loading?: boolean;
  /** Name reported by the game (modded items). */
  fallbackName?: string;
  compact?: boolean;
  extra?: React.ReactNode;
}

export function ItemCardBody({ item, kind, id, unknown, loading, fallbackName, compact, extra }: CardProps) {
  const lang = useLang();
  const t = useT();
  const hidden = id === null;
  const reason: UnknownReason = unknown ?? 'far';
  const name = hidden
    ? reason === 'blind'
      ? t('unknown.blind')
      : unknownName(kind, t)
    : itemName(item, lang, fallbackName ?? (loading ? '…' : `${kindLabel(kind, t)} #${id}`));
  const quote = itemQuote(item, lang);
  const { all, owned } = useOwnedSynergies(item);
  const effects = item?.effects ?? [];
  const caches = (item?.statCaches ?? []).filter((c): c is (typeof STAT_CACHES)[number] => (STAT_CACHES as readonly string[]).includes(c));
  return (
    <div className="card__body">
      <div className="card__art">
        <ItemImage item={item} kind={kind} size={compact ? 72 : 112} hidden={hidden} label={fallbackName} />
      </div>
      <h3 className="card__name">{name}</h3>
      <div className="card__meta">
        <Quality q={item?.quality} />
        <span className="card__type">
          {item?.type ? typeLabel(item.type, kind, t) : kindLabel(kind, t)}
          {id !== null ? <span className="muted"> · #{id}</span> : null}
        </span>
      </div>
      {hidden ? <p className="card__desc">{unknownText(kind, reason, t)}</p> : null}
      {!hidden && !loading && !item ? <p className="card__desc">{t('card.notInDb', { mod: fallbackName ? t('card.notInDbMod') : '' })}</p> : null}
      {quote ? <p className="card__quote">“{quote}”</p> : null}
      {item?.description ? <p className="card__desc">{item.description}</p> : null}
      {effects.length ? (
        <div className="card__section">
          <h4>{t('card.effects')}</h4>
          <ul className="card__effects">
            {(compact ? effects.slice(0, 3) : effects).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {caches.length || item?.transformations.length ? (
        <div className="card__chips">
          {caches.map((c) => (
            <span key={c} className="chip">
              {t(`cache.${c}`)}
            </span>
          ))}
          {item?.transformations.map((x) => (
            <span key={x.id} className="chip chip--gold" title={t('card.transformation')}>
              {x.name}
            </span>
          ))}
        </div>
      ) : null}
      {item && (item.kind === 'collectible' || item.kind === 'trinket') ? (
        <div className="card__section card__syn">
          <h4>
            {t('card.synergies')}: <span className="mono">{item.synergyCount}</span>
          </h4>
          {owned.length ? (
            <ul className="syn-list">
              {owned.slice(0, compact ? 3 : 8).map((s) => {
                const other = s.a.kind === item.kind && s.a.id === item.id ? s.b : s.a;
                return (
                  <li key={s.id}>
                    <strong>{t('card.withYour', { name: refName(other, lang) })}</strong> {s.description}
                  </li>
                );
              })}
            </ul>
          ) : all && item.synergyCount ? (
            <p className="muted small">{t('card.noOwnedSyn')}</p>
          ) : null}
        </div>
      ) : null}
      {extra}
      {item?.sources.some((s) => s.name === 'wiki') && !compact ? (
        <p className="card__source">
          {t('card.text')}:{' '}
          <a href={item.sources.find((s) => s.name === 'wiki')?.url ?? '#'} target="_blank" rel="noreferrer">
            Binding of Isaac Wiki
          </a>{' '}
          {t('card.textLang')}
        </p>
      ) : null}
    </div>
  );
}
