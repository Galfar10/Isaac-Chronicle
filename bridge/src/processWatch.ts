import { execFile } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Checks whether the Isaac process is running: tasklist on Windows, pgrep on Linux / Steam Deck
 * and macOS (under Proton, CrossOver or Wine the process command line still contains isaac-ng.exe).
 * Used only to tell "game closed" apart from "game open, mod not sending".
 * Returns null where the check is unsupported.
 */
export function isIsaacRunning(os: NodeJS.Platform = platform()): Promise<boolean | null> {
  return new Promise((resolve) => {
    if (os === 'win32') {
      execFile(
        'tasklist',
        ['/FI', 'IMAGENAME eq isaac-ng.exe', '/NH', '/FO', 'CSV'],
        { timeout: 4000, windowsHide: true },
        (err, stdout) => {
          if (err) return resolve(null);
          resolve(stdout.toLowerCase().includes('isaac-ng.exe'));
        },
      );
      return;
    }
    execFile('pgrep', ['-f', 'isaac-ng\\.exe'], { timeout: 4000 }, (err, stdout) => {
      if (!err) return resolve(stdout.trim().length > 0);
      // pgrep exits with 1 when nothing matches; anything else (not installed, timeout) is "unknown".
      resolve((err as { code?: unknown }).code === 1 ? false : null);
    });
  });
}
