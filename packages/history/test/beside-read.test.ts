import { describe, expect, test } from 'vitest';
import { type CutEntry, cutsFile, readCutsBytes, readDraftBytes } from '../src/index';

const enc = (text: string) => new TextEncoder().encode(text);
const NOW = Date.UTC(2026, 9, 30, 12);

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function cutEntry(text: string, title: string, at = NOW - 60_000): Promise<CutEntry> {
  return {
    id: await sha(text),
    title,
    text,
    kind: 'fountain',
    cuts: [{ at: new Date(at).toISOString(), draft: 1 }],
    where: { after: 'INT. HALL - DAY', before: null },
  };
}

describe('reading what is beside the work', () => {
  test('the cuts file is checked: a forged ID, a wrong kind, damage, and a huge file', async () => {
    const good = await cutEntry('A good cut that hashes to its own ID.', 'GOOD');
    const forged = { ...good, title: 'FORGED', text: 'Not the text that ID is of.' };
    const md = { ...(await cutEntry('A Markdown cut.', 'MD')), kind: 'markdown' as const };
    const file = `${cutsFile('Boca.fountain', [good, forged, md])}<!-- drafter-cut {broken -->\n`;
    const read = await readCutsBytes(enc(file), 'fountain');
    expect(read.entries.map((e) => e.title)).toEqual(['GOOD']);
    expect(read.skipped).toBe(3);
    expect((await readCutsBytes(new Uint8Array(32 * 1024 * 1024 + 1), 'fountain')).problem).toBe(
      'it is too big (over 32 MB)',
    );
  });

  test('a draft file that is not UTF-8 or is too big is a problem, not a throw', async () => {
    expect(await readDraftBytes(new Uint8Array([0xff, 0xfe, 0x41]), 'fountain')).toEqual({
      facts: null,
      problem: 'it isn’t UTF-8 text',
    });
    const big = await readDraftBytes(new Uint8Array(32 * 1024 * 1024 + 1), 'fountain');
    expect(big.facts).toBeNull();
  });
});
