import { useEffect, useState } from 'react';
import type { RoomItem } from '@irtc/protocol';
import { useClient, useItem, useNow } from '../lib/gameStore';
import { priceLabel, roomTypeName } from '../lib/format';
import { itemName, useLang } from '../lib/i18n';
import { useT } from '../lib/strings';
import { ItemCardBody, unknownName } from './ItemCard';
import { ItemImage } from './ItemImage';

const PICKED_HIGHLIGHT_MS = 10_000;
const PICKED_PRIORITY_MS = 5_000;

/**
 * The central card: the item next to the player BEFORE it is picked up, or what was just
 * obtained / discovered.
 */
export function FeaturedItem({ pinnedKey, onPin, onOpen }: { pinnedKey: number | null; onPin: (k: number | null) => void; onOpen: (r: { kind: RoomItem['kind']; id: number }) => void }) {
  const { state } = useClient();
  const now = useNow(1000);
  const lang = useLang();
  const t = useT();
  const items = state.roomItems;
  const pinned = pinnedKey !== null ? items.find((i) => i.key === pinnedKey) : undefined;
  const nearest = items.find((i) => i.key === state.nearestKey);
  const target = pinned ?? nearest ?? null;
  const picked = state.lastPicked;
  const recentPick = picked && now - picked.at < PICKED_HIGHLIGHT_MS;

  let mode: 'near' | 'available' | 'picked' | 'last' | 'empty';
  // A fresh pickup takes over the card for a few seconds even if other items are nearby.
  if (target && !(recentPick && picked && now - picked.at < PICKED_PRIORITY_MS)) mode = items.length > 1 ? 'near' : 'available';
  else if (picked && recentPick) mode = 'picked';
  else if (picked) mode = 'last';
  else mode = 'empty';

  const kind = mode === 'near' || mode === 'available' ? target!.kind : (picked?.kind ?? 'collectible');
  const id = mode === 'near' || mode === 'available' ? target!.id : (picked?.id ?? null);
  const { item, loading } = useItem(mode === 'empty' ? null : kind, id);

  const obtained =
    kind === 'card'
      ? t('feat.cardObtained')
      : kind === 'pill'
        ? picked?.how === 'used'
          ? t('feat.pillDiscovered')
          : t('feat.pillObtained')
        : kind === 'trinket'
          ? t('feat.trinketObtained')
          : t('feat.obtained');
  const label = {
    near: t('feat.near'),
    available: t('feat.available'),
    picked: obtained,
    last: kind === 'card' ? t('feat.lastCard') : kind === 'pill' ? t('feat.lastPill') : t('feat.last'),
    empty: t('feat.near'),
  }[mode];
  const animKey = `${mode === 'last' ? 'picked' : mode}:${kind}:${id}`;

  // First appearance rises from the bottom; later changes flip like a card.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (mode !== 'empty') setSeen(true);
  }, [mode]);

  if (mode === 'empty') {
    return (
      <section className="panel panel--featured" aria-label={label}>
        <h2 className="panel__title">{label}</h2>
        <div className="card card--empty">
          <p>{state.run ? t('feat.emptyRoom', { room: roomTypeName(state.room?.type, lang) }) : t('feat.emptyNoRun')}</p>
        </div>
      </section>
    );
  }

  const live = mode === 'near' || mode === 'available';
  const price = live ? priceLabel(target!.price, lang) : null;
  const unknown = live ? target!.unknown : null;
  const ribbon = unknown && unknown !== 'blind' ? unknownName(kind, t).toUpperCase() : label;
  return (
    <section className="panel panel--featured" aria-label={label} aria-live="polite">
      <h2 className="panel__title">
        {label}
        {live && target!.distance !== null ? <span className="dist mono"> · {t('feat.tiles', { n: target!.distance.toFixed(1) })}</span> : null}
        {pinned ? (
          <button className="btn btn--tiny" onClick={() => onPin(null)}>
            {t('feat.follow')}
          </button>
        ) : null}
      </h2>
      <article
        key={animKey}
        className={`card card--${mode} ${seen ? 'card-flip' : 'card-rise'}`}
        onClick={() => id !== null && onOpen({ kind, id })}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && id !== null && onOpen({ kind, id })}
      >
        <div className={`card__ribbon card__ribbon--${mode} ${unknown ? 'card__ribbon--unknown' : ''}`}>
          {mode === 'picked' ? '✓ ' : ''}
          {ribbon}
        </div>
        {price || (live && target!.optionsIndex > 0) ? (
          <div className="card__tags">
            {price ? <span className="chip chip--blood">{price}</span> : null}
            {live && target!.optionsIndex > 0 ? <span className="chip">{t('feat.chooseOne')}</span> : null}
          </div>
        ) : null}
        <ItemCardBody item={item} kind={kind} id={id} unknown={unknown} loading={loading} fallbackName={live ? target!.name : undefined} compact />
      </article>
    </section>
  );
}

/** Items in the room: nearest highlighted, distances live, unknown ones stay unknown. */
export function RoomItems({ pinnedKey, onPin }: { pinnedKey: number | null; onPin: (k: number) => void }) {
  const { state } = useClient();
  const t = useT();
  const items = [...state.roomItems].sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
  const other = Object.values(state.otherPickups).reduce((a, b) => a + b, 0);
  return (
    <section className="panel panel--room" aria-label={t('room.title')}>
      <h2 className="panel__title">
        {t('room.title')} <span className="muted">({items.length})</span>
      </h2>
      {items.length ? (
        <ul className="roomlist">
          {items.map((i) => (
            <RoomRow key={i.key} r={i} nearest={i.key === state.nearestKey} pinned={i.key === pinnedKey} onPin={() => onPin(i.key)} />
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('room.nothing')}</p>
      )}
      {other ? <p className="muted small">{t('room.minor', { n: other })}</p> : null}
    </section>
  );
}

function RoomRow({ r, nearest, pinned, onPin }: { r: RoomItem; nearest: boolean; pinned: boolean; onPin: () => void }) {
  const lang = useLang();
  const t = useT();
  const { item } = useItem(r.kind, r.id);
  const name = r.id === null ? (r.unknown === 'blind' ? t('unknown.blind') : unknownName(r.kind, t)) : itemName(item, lang, r.name ?? `#${r.id}`);
  return (
    <li className={`roomrow ${nearest ? 'roomrow--nearest' : ''} ${pinned ? 'roomrow--pinned' : ''}`}>
      <button onClick={onPin} title={t('room.pin')}>
        <ItemImage item={item} kind={r.kind} size={36} hidden={r.id === null} />
        <span className="roomrow__name">{name}</span>
        {r.price ? <span className="chip chip--blood chip--small">{priceLabel(r.price, lang)}</span> : null}
        <span className="roomrow__dist mono">{r.distance !== null ? r.distance.toFixed(1) : '—'}</span>
      </button>
    </li>
  );
}
