// What the Download page offers (`pages/docs/download.vue`): each platform, and the files a release
// carries for it. The links are made when the page is prerendered, from the build's version, so the
// page asks nothing of GitHub or anyone else when it loads (the Privacy page promises that).
// A Mac download, when it comes, is the Mac entry with `available: true` and its files.
// Pure: no imports from the app, so a test outside it can read this.

/** Where the release files are. */
export const RELEASES_URL = 'https://github.com/cschweda/drafter/releases';
/** The newest release's page: the site deploys before the desktop builds finish, so it is offered too. */
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
export const CHANGELOG_URL = 'https://github.com/cschweda/drafter/blob/main/CHANGELOG.md';

export interface DownloadFile {
  /** What the button says, such as `Download the installer`. */
  label: string;
  /** The release file's name, with `{version}` where the version goes (`0.22.1`). */
  asset: string;
  /** What it is, in a few words: `64-bit Intel and AMD`. */
  detail: string;
  /** How to install or start it, as a command, when one line says it. */
  command?: string;
}

export interface Platform {
  id: 'windows' | 'linux' | 'mac';
  name: string;
  /** Whether a release carries a download for it yet. */
  available: boolean;
  files: readonly DownloadFile[];
}

export const PLATFORMS: readonly Platform[] = [
  {
    id: 'windows',
    name: 'Windows',
    available: true,
    files: [
      {
        label: 'Download the Windows installer',
        asset: 'Drafter-{version}-windows-x64-setup.exe',
        detail: 'Windows 10 and 11, 64-bit Intel and AMD (x64)',
      },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    available: true,
    files: [
      {
        label: 'Download the .deb',
        asset: 'Drafter-{version}-linux-amd64.deb',
        detail: 'Ubuntu, Debian, Linux Mint, Pop!_OS, and other Debian-based systems (amd64)',
        command: 'sudo apt install ./Drafter-{version}-linux-amd64.deb',
      },
      {
        label: 'Download the AppImage',
        asset: 'Drafter-x86_64.AppImage',
        detail: 'Any other distribution, with nothing to install (x86_64)',
        command: 'chmod +x Drafter-x86_64.AppImage && ./Drafter-x86_64.AppImage',
      },
    ],
  },
  { id: 'mac', name: 'Mac', available: false, files: [] },
];

/** `text` with the version in place of `{version}`. */
export const withVersion = (text: string, version: string): string =>
  text.replaceAll('{version}', version);

/** The address of a release file: `…/releases/download/v0.22.1/Drafter-0.22.1-linux-amd64.deb`. */
export const downloadUrl = (file: Pick<DownloadFile, 'asset'>, version: string): string =>
  `${RELEASES_URL}/download/v${version}/${withVersion(file.asset, version)}`;

/** The platform a user agent is on, if it is one Drafter has a section for (phones have none). */
export function platformFor(input: {
  /** `navigator.userAgentData.platform`, where the browser has it: `Windows`, `macOS`, `Linux`. */
  hint?: string;
  userAgent: string;
}): Platform['id'] | null {
  const { hint, userAgent } = input;
  if (/Android|iPhone|iPad|iPod|CrOS/.test(userAgent)) return null;
  const from = hint || userAgent;
  if (/Windows/i.test(from)) return 'windows';
  if (/mac/i.test(from)) return 'mac';
  if (/Linux|X11/i.test(from)) return 'linux';
  return null;
}
