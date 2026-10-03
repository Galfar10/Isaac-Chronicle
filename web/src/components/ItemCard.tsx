import { useEffect, useMemo, useState } from 'react';
import type { ItemKind, ItemRecord, SynergyRecord, UnknownReason } from '@irtc/protocol';
import { fetchSynergiesFor } from '../lib/api';
import { useClient } from '../lib/gameStore';
import { ITEM_TYPE_LABEL, KIND_LABEL, itemName, itemQuote, refName, useLang } from '../lib/i18n';
import { ItemImage } from './ItemImage';
import { StarIcon } from './Icons';

const STAT_CACHE_LABEL: Record<string, string> = {
  damage: 'Daño',
  firedelay: 'Lágrimas',
  range: 'Alcance',
  shotspeed: 'Vel. disparo',
  speed: 'Velocidad',
  luck: 'Suerte',
  flying: 'Vuelo',
  familiars: 'Familiares',
  tearflag: 'Efecto de lágrima',
  all: 'Varias stats',
};

export function Quality({ q }: { q: number | null | undefined }) {
  if (q === null || q === undefined) return null;
  return (
    <span className="quality" title={`Calidad ${q} de 4`} aria-label={`Calidad ${q} de 4`}>
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
      ...state.inventory.trinkets.map((t) => `trinket:${t & 0x7fff}`),
    ]);
    if (!all || !item) return [];
    return all.filter((s) => {
      const other = s.a.kind === item.kind && s.a.id === item.id ? s.b : s.a;
      return inv.has(`${other.kind}:${other.id}`);
    });
  }, [all, item, state.inventory]);
  return { all, owned };
}

export const UNKNOWN_NAME: Record<ItemKind, string> = {
  collectible: 'Objeto desconocido',
  trinket: 'Baratija desconocida',
  card: 'Carta desconocida',
  pill: 'Pastilla desconocida',
};

function unknownText(kind: ItemKind, reason: UnknownReason): string {
  if (reason === 'blind') return 'El juego oculta este objeto (Curse of the Blind o pedestal con “?”). No se revela para respetar la partida.';
  if (reason === 'not_picked')
    return kind === 'pill' ? 'No sabrás qué hace hasta que la tomes.' : 'Recógela para saber qué es.';
  if (kind === 'card' || kind === 'pill') return 'Está en el suelo: recógela para saber qué es.';
  return 'Acércate para identificarlo.';
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
  const hidden = id === null;
  const reason: UnknownReason = unknown ?? 'far';
  const name = hidden
    ? reason === 'blind'
      ? 'Objeto oculto'
      : UNKNOWN_NAME[kind]
    : itemName(item, lang, fallbackName ?? (loading ? '…' : `${KIND_LABEL[kind]?.es ?? 'Objeto'} #${id}`));
  const quote = itemQuote(item, lang);
  const { all, owned } = useOwnedSynergies(item);
  const effects = item?.effects ?? [];
  const caches = (item?.statCaches ?? []).filter((c) => STAT_CACHE_LABEL[c]);
  return (
    <div className="card__body">
      <div className="card__art">
        <ItemImage item={item} kind={kind} size={compact ? 72 : 112} hidden={hidden} label={fallbackName} />
      </div>
      <h3 className="card__name">{name}</h3>
      <div className="card__meta">
        <Quality q={item?.quality} />
        <span className="card__type">
          {item?.type ? (ITEM_TYPE_LABEL[item.type] ?? item.type) : KIND_LABEL[kind]?.es}
          {id !== null ? <span className="muted"> · #{id}</span> : null}
        </span>
      </div>
      {hidden ? <p className="card__desc">{unknownText(kind, reason)}</p> : null}
      {!hidden && !loading && !item ? (
        <p className="card__desc">
          Objeto no encontrado en la base de datos{fallbackName ? ' (probablemente de otro mod)' : ''}. Se puede añadir sin actualizar el mod.
        </p>
      ) : null}
      {quote ? <p className="card__quote">“{quote}”</p> : null}
      {item?.description ? <p className="card__desc">{item.description}</p> : null}
      {effects.length ? (
        <div className="card__section">
          <h4>Efectos</h4>
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
              {STAT_CACHE_LABEL[c]}
            </span>
          ))}
          {item?.transformations.map((t) => (
            <span key={t.id} className="chip chip--gold" title="Cuenta para esta transformación">
              {t.name}
            </span>
          ))}
        </div>
      ) : null}
      {item && (item.kind === 'collectible' || item.kind === 'trinket') ? (
        <div className="card__section card__syn">
          <h4>
            Sinergias conocidas: <span className="mono">{item.synergyCount}</span>
          </h4>
          {owned.length ? (
            <ul className="syn-list">
              {owned.slice(0, compact ? 3 : 8).map((s) => {
                const other = s.a.kind === item.kind && s.a.id === item.id ? s.b : s.a;
                return (
                  <li key={s.id}>
                    <strong>Con tu {refName(other, lang)}:</strong> {s.description}
                  </li>
                );
              })}
            </ul>
          ) : all && item.synergyCount ? (
            <p className="muted small">Ninguna con tu inventario actual.</p>
          ) : null}
        </div>
      ) : null}
      {extra}
      {item?.sources.some((s) => s.name === 'wiki') && !compact ? (
        <p className="card__source">
          Texto:{' '}
          <a href={item.sources.find((s) => s.name === 'wiki')?.url ?? '#'} target="_blank" rel="noreferrer">
            Binding of Isaac Wiki
          </a>{' '}
          (CC BY-SA 4.0)
        </p>
      ) : null}
    </div>
  );
}
