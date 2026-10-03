import { useEffect, useRef } from 'react';
import type { ItemKind } from '@irtc/protocol';
import { useItem } from '../lib/gameStore';
import { ItemCardBody } from './ItemCard';

export function ItemModal({ target, onClose }: { target: { kind: ItemKind; id: number } | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { item, loading } = useItem(target?.kind, target?.id);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {target ? (
        <article className="card card--modal">
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
          <ItemCardBody item={item} kind={target.kind} id={target.id} loading={loading} />
          {item?.pools.length ? (
            <p className="small muted">
              Pools: {item.pools.join(', ')}
            </p>
          ) : null}
        </article>
      ) : null}
    </dialog>
  );
}
