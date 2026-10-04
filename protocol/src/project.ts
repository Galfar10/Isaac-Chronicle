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
  /** Steam Workshop item (id written by ModUploader into isaac-mod/metadata.xml). */
  workshopUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3812867579' as string | null,
  /** Optional support links (also in .github/FUNDING.yml). */
  kofiUrl: 'https://ko-fi.com/isaacchronicle',
  sponsorsUrl: 'https://github.com/sponsors/Galfar10',
  companionPort: 47823,
} as const;
