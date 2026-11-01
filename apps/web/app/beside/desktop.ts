// Drafts and cuts beside the work in the desktop app: the main process writes them
// (`DesktopFilesBridge.writeBeside`, apps/desktop/src/beside.ts), only beside a script the writer
// granted, only by the names it works out from that script, and never through a link.
import type { DesktopFilesBridge } from '../desktop';
import type { BesideFolder } from './beside';

/** The folder beside the script at `script` (its path as the grant has it). */
export function desktopFolder(bridge: DesktopFilesBridge, script: string): BesideFolder {
  return {
    read: (rel) => bridge.readBeside(script, rel),
    list: (folder) => bridge.listBeside(script, folder),
    create: (rel, bytes) => bridge.writeBeside(script, rel, bytes, 'create'),
    async replace(rel, bytes) {
      await bridge.writeBeside(script, rel, bytes, 'replace');
    },
  };
}
