import { execFile } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Checks whether the Isaac process is running (Windows only, via tasklist).
 * Used only to tell "game closed" apart from "game open, mod not sending".
 * Returns null where the check is unsupported.
 */
export function isIsaacRunning(): Promise<boolean | null> {
  if (platform() !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq isaac-ng.exe', '/NH', '/FO', 'CSV'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        resolve(stdout.toLowerCase().includes('isaac-ng.exe'));
      },
    );
  });
}
