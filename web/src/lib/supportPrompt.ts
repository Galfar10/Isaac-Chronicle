import { useEffect, useRef } from 'react';
import type { GameLink } from '@irtc/protocol';

/** Delay after the game disconnects before showing the dialog. */
export const SUPPORT_DELAY_MS = 4000;

/**
 * Opens the support dialog a few seconds after the game disconnects (Isaac closed: the process is gone).
 * Pausing, switching windows, going back to the menu or a short gap in the data ("idle") never trigger it.
 */
export function useSupportPrompt(game: GameLink, open: () => void): void {
  const wasConnected = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  if (game === 'connected') wasConnected.current = true;
  useEffect(() => {
    if (game !== 'disconnected' || !wasConnected.current) return;
    const timer = setTimeout(() => {
      wasConnected.current = false;
      openRef.current();
    }, SUPPORT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game]);
}
