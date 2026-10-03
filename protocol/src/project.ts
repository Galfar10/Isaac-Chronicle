/**
 * Public project identity. Change it here only (web, Companion and docs read from here).
 */
export const PROJECT = {
  name: 'Isaac Chronicle',
  tagline: 'Real-Time Companion for The Binding of Isaac: Repentance+',
  githubUser: 'Galfar10',
  repo: 'Isaac-Chronicle',
  /** GitHub Pages: hosted copy of the web UI (connects to the Companion on 127.0.0.1). */
  pagesUrl: 'https://galfar10.github.io/Isaac-Chronicle/',
  pagesOrigin: 'https://galfar10.github.io',
  repoUrl: 'https://github.com/Galfar10/Isaac-Chronicle',
  releasesUrl: 'https://github.com/Galfar10/Isaac-Chronicle/releases/latest',
  /** Filled in after the first Workshop upload (ModUploader writes the id into metadata.xml). */
  workshopUrl: null as string | null,
  companionPort: 47823,
} as const;
