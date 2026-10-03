import { useEffect, useMemo, useState } from 'react';
import { TRINKET_GOLDEN_FLAG, type ItemKind, type SynergyRecord } from '@irtc/protocol';
import { fetchSynergiesAmong } from '../lib/api';
import { useClient, useGameEvents, useItem } from '../lib/gameStore';
import { itemName, itemQuote, refName, useLang } from '../lib/i18n';
import { ItemImage } from './ItemImage';
import { BagIcon, SparkIcon } from './Icons';

type Open = (r: { kind: ItemKind; id: number }) => void;

function Tile({ kind, id, count, badge, fresh, onOpen, fallbackName }: { kind: ItemKind; id: number; count?: number; badge?: string; fresh?: boolean; onOpen: Open; fallbackName?: string }) {
  const lang = useLang();
  const { item } = useItem(kind, id);
  const name = itemName(item, lang, fallbackName ?? `#${id}`);
  const q = item?.quality;
  return (
    <li>
      <button
        className={`tile ${q !== null && q !== undefined ? `tile--q${q}` : ''} ${fresh ? 'tile--fresh' : ''}`}
        onClick={() => onOpen({ kind, id })}
        title={`${name}${itemQuote(item, lang) ? ` — ${itemQuote(item, lang)}` : ''}`}
      >
        <ItemImage item={item} kind={kind} size={48} label={fallbackName} />
        <span className="tile__name">{name}</span>
        {q !== null && q !== undefined ? <span className="tile__q">Q{q}</span> : null}
        {count && count > 1 ? <span className="tile__count">×{count}</span> : null}
        {badge ? <span className="tile__badge">{badge}</span> : null}
      </button>
    </li>
  );
}

function UnknownTile({ kind, label, hint }: { kind: ItemKind; label: string; hint: string }) {
  return (
    <li>
      <div className="tile tile--unknown" title={`${label}. ${hint}.`}>
        <ItemImage item={null} kind={kind} size={48} hidden />
        <span className="tile__name">{label}</span>
      </div>
    </li>
  );
}

const SLOT_NAMES: Record<number, string> = { 0: 'Activo', 1: 'Activo 2', 2: 'Bolsillo', 3: 'Bolsillo 2' };

export function InventoryPanel({ onOpen }: { onOpen: Open }) {
  const { state } = useClient();
  const inv = state.inventory;
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  useGameEvents((events) => {
    for (const e of events) {
      if (e.event === 'inventory_changed' && e.data.added.length && e.data.added.length < 10) {
        setFresh(new Set(e.data.added));
        setTimeout(() => setFresh(new Set()), 4000);
      }
    }
  });
  const activeIds = new Map(inv.actives.map((a) => [a.id, a.slot]));
  const passives = inv.collectibles.filter((c) => !activeIds.has(c.id));
  return (
    <section className="panel panel--inventory" aria-label="Inventario">
      <h2 className="panel__title">
        <BagIcon size={22} /> Inventario <span className="muted">({inv.collectibles.reduce((n, c) => n + c.count, 0)})</span>
      </h2>
      {inv.actives.length || inv.trinkets.length || inv.cards.length || inv.pills.length ? (
        <ul className="tiles tiles--special">
          {inv.actives.map((a) => (
            <Tile key={`a${a.slot}`} kind="collectible" id={a.id} badge={SLOT_NAMES[a.slot] ?? 'Activo'} onOpen={onOpen} />
          ))}
          {inv.trinkets.map((t, i) => (
            <Tile
              key={`t${i}`}
              kind="trinket"
              id={t & ~TRINKET_GOLDEN_FLAG}
              badge={t & TRINKET_GOLDEN_FLAG ? 'Dorada' : 'Baratija'}
              onOpen={onOpen}
            />
          ))}
          {inv.cards.map((c, i) =>
            c.id !== null ? (
              <Tile key={`c${i}`} kind="card" id={c.id} badge="Carta" onOpen={onOpen} />
            ) : (
              <UnknownTile key={`c${i}`} kind="card" label="Carta desconocida" hint="El juego no ha dado su identificador" />
            ),
          )}
          {inv.pills.map((p, i) =>
            p.effect !== null ? (
              <Tile key={`p${i}`} kind="pill" id={p.effect} badge="Pastilla" onOpen={onOpen} />
            ) : (
              <UnknownTile key={`p${i}`} kind="pill" label="Pastilla desconocida" hint="Se descubrirá al tomarla" />
            ),
          )}
        </ul>
      ) : null}
      {passives.length ? (
        <ul className="tiles">
          {passives.map((c) => (
            <Tile key={c.id} kind="collectible" id={c.id} count={c.count} fresh={fresh.has(c.id)} onOpen={onOpen} fallbackName={c.name} />
          ))}
        </ul>
      ) : (
        <p className="muted small">Todavía no has recogido objetos.</p>
      )}
    </section>
  );
}

/** Known synergies among the items the player owns (from the database, never invented). */
export function SynergiesPanel() {
  const { state } = useClient();
  const lang = useLang();
  const refs = useMemo(
    () => [
      ...state.inventory.collectibles.map((c) => ({ kind: 'collectible' as const, id: c.id })),
      ...state.inventory.trinkets.map((t) => ({ kind: 'trinket' as const, id: t & ~TRINKET_GOLDEN_FLAG })),
    ],
    [state.inventory],
  );
  const key = refs.map((r) => `${r.kind}:${r.id}`).sort().join(',');
  const [list, setList] = useState<SynergyRecord[]>([]);
  useEffect(() => {
    const t = setTimeout(() => void fetchSynergiesAmong(refs).then(setList), 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Merge both directions of the same pair.
  const pairs = useMemo(() => {
    const m = new Map<string, SynergyRecord[]>();
    for (const s of list) {
      const k = [`${s.a.kind}:${s.a.id}`, `${s.b.kind}:${s.b.id}`].sort().join('|');
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.values()];
  }, [list]);
  return (
    <section className="panel panel--syn" aria-label="Sinergias activas">
      <h2 className="panel__title">
        <SparkIcon size={20} /> Sinergias activas <span className="muted">({pairs.length})</span>
      </h2>
      {pairs.length ? (
        <ul className="synergies">
          {pairs.map((group) => (
            <li key={group[0].id} className="synergy">
              <div className="synergy__pair">
                {refName(group[0].a, lang)} <span className="plus">+</span> {refName(group[0].b, lang)}
              </div>
              {group.map((s) => (
                <p key={s.id}>{s.description}</p>
              ))}
              {group[0].source.url ? (
                <a className="small" href={group[0].source.url} target="_blank" rel="noreferrer">
                  fuente
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Sin sinergias conocidas entre tus objetos (fuente: wiki, CC BY-SA 4.0).</p>
      )}
    </section>
  );
}
