import { useEffect, useRef } from 'react';
import type { GameLink } from '@irtc/protocol';

/**
 * Opens the support dialog as soon as the game shows as disconnected (Isaac closed: the process is gone).
 * Pausing, switching windows, going back to the menu or a short gap in the data ("idle") never trigger it.
 */
export function useSupportPrompt(game: GameLink, open: () => void): void {
  const wasConnected = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  if (game === 'connected') wasConnected.current = true;
  useEffect(() => {
    if (game !== 'disconnected' || !wasConnected.current) return;
    wasConnected.current = false;
    openRef.current();
  }, [game]);
}
