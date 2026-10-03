import { useState } from 'react';
import type { HistoryEntry } from '@irtc/protocol';
import { useClient, useItem } from '../lib/gameStore';
import { clock, roomTypeName, signed } from '../lib/format';
import { itemName, useLang } from '../lib/i18n';
import { ScrollIcon } from './Icons';

const LABELS: Record<HistoryEntry['type'], string> = {
  run_started: 'RUN INICIADA',
  run_continued: 'RUN CONTINUADA',
  floor_changed: 'NUEVO PISO',
  room_changed: 'CAMBIO DE SALA',
  item_found: 'OBJETO ENCONTRADO',
  item_picked: 'OBJETO RECOGIDO',
  stats_changed: 'STATS',
  transformation: 'TRANSFORMACIÓN',
  discovered: '¡NUEVO DESCUBRIMIENTO!',
  consumable_used: 'USADO',
  run_won: 'VICTORIA',
  run_lost: 'MUERTE',
  run_exited: 'SALIDA',
};

const STAT_ES: Record<string, string> = { damage: 'Daño', tears: 'Lágrimas', range: 'Alcance', shotSpeed: 'Vel. disparo', speed: 'Velocidad', luck: 'Suerte' };

function ItemLabel({ e }: { e: HistoryEntry }) {
  const lang = useLang();
  const { item } = useItem(e.itemKind, e.itemId);
  if (e.itemId === undefined) return null;
  return <span className="hist__item">{itemName(item, lang, `#${e.itemId}`)}</span>;
}

function Detail({ e }: { e: HistoryEntry }) {
  if (e.itemId !== undefined) return <ItemLabel e={e} />;
  if (e.type === 'room_changed') return <span>{roomTypeName(e.roomType)}</span>;
  if (e.type === 'floor_changed') return <span>{e.text && !e.text.startsWith('#') ? e.text : e.floor}</span>;
  if (e.type === 'stats_changed' && e.deltas)
    return (
      <span>
        {Object.entries(e.deltas)
          .map(([k, v]) => `${STAT_ES[k] ?? k} ${signed(v as number)}`)
          .join(' · ')}
      </span>
    );
  return e.text ? <span>{e.text}</span> : null;
}

type Filter = 'items' | 'all';

export function HistoryPanel() {
  const { state } = useClient();
  const [filter, setFilter] = useState<Filter>('items');
  const entries = state.history
    .filter((e) => filter === 'all' || e.type !== 'room_changed')
    .slice(-200)
    .reverse();
  return (
    <section className="panel panel--history" aria-label="Historial de la run">
      <h2 className="panel__title">
        <ScrollIcon size={22} /> Historial de la run
        <span className="seg">
          <button className={filter === 'items' ? 'on' : ''} onClick={() => setFilter('items')}>
            Eventos
          </button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            Todo
          </button>
        </span>
      </h2>
      {entries.length ? (
        <ol className="hist">
          {entries.map((e) => (
            <li key={e.seq} className={`hist__entry hist--${e.type}`}>
              <span className="hist__time mono">{clock(e.time)}</span>
              <span className="hist__type">{LABELS[e.type]}</span>
              <Detail e={e} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">La línea temporal empieza con la partida.</p>
      )}
    </section>
  );
}
