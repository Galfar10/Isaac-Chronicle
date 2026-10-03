import { useState } from 'react';
import type { HistoryEntry } from '@irtc/protocol';
import { useClient, useItem } from '../lib/gameStore';
import { clock, roomTypeName, signed } from '../lib/format';
import { itemName, useLang } from '../lib/i18n';
import { useT } from '../lib/strings';
import { ScrollIcon } from './Icons';

const STAT_KEYS = {
  damage: 'stats.damage',
  tears: 'stats.tears',
  range: 'stats.range',
  shotSpeed: 'stats.shotSpeed',
  speed: 'stats.speed',
  luck: 'stats.luck',
} as const;

function ItemLabel({ e }: { e: HistoryEntry }) {
  const lang = useLang();
  const { item } = useItem(e.itemKind, e.itemId);
  if (e.itemId === undefined) return null;
  return <span className="hist__item">{itemName(item, lang, `#${e.itemId}`)}</span>;
}

function Detail({ e }: { e: HistoryEntry }) {
  const lang = useLang();
  const t = useT();
  if (e.itemId !== undefined) return <ItemLabel e={e} />;
  if (e.type === 'room_changed') return <span>{roomTypeName(e.roomType, lang)}</span>;
  if (e.type === 'floor_changed') return <span>{e.text && !e.text.startsWith('#') ? e.text : e.floor}</span>;
  if (e.type === 'stats_changed' && e.deltas)
    return (
      <span>
        {Object.entries(e.deltas)
          .map(([k, v]) => `${k in STAT_KEYS ? t(STAT_KEYS[k as keyof typeof STAT_KEYS]) : k} ${signed(v as number)}`)
          .join(' · ')}
      </span>
    );
  return e.text ? <span>{e.text}</span> : null;
}

type Filter = 'items' | 'all';

export function HistoryPanel() {
  const { state } = useClient();
  const t = useT();
  const [filter, setFilter] = useState<Filter>('items');
  const entries = state.history
    .filter((e) => filter === 'all' || e.type !== 'room_changed')
    .slice(-200)
    .reverse();
  return (
    <section className="panel panel--history" aria-label={t('hist.title')}>
      <h2 className="panel__title">
        <ScrollIcon size={22} /> {t('hist.title')}
        <span className="seg">
          <button className={filter === 'items' ? 'on' : ''} onClick={() => setFilter('items')}>
            {t('hist.events')}
          </button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            {t('hist.all')}
          </button>
        </span>
      </h2>
      {entries.length ? (
        <ol className="hist">
          {entries.map((e) => (
            <li key={e.seq} className={`hist__entry hist--${e.type}`}>
              <span className="hist__time mono">{clock(e.time)}</span>
              <span className="hist__type">{t(`hist.${e.type}`)}</span>
              <Detail e={e} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">{t('hist.empty')}</p>
      )}
    </section>
  );
}
