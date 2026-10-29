# @drafter/notes

Keyed notes for [Drafter](https://github.com/cschweda/drafter): the `[[Head: body]]` convention that keeps a scene's fields, setups and payoffs, categories, and readers' notes in a Fountain script as ordinary notes, which never print. It reads a note's head, body, tags, and status, and writes notes exactly, and it holds the text helpers Drafter's structural edits share. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { readNote, writeNote } from '@drafter/notes';

readNote('Sam: I don’t believe she’d stay. #character');
// { head: { kind: 'person', name: 'Sam', on: null, re: null },
//   body: 'I don’t believe she’d stay. #character', tags: ['character'], resolved: false }

readNote('TODO: check the dates').head; // { kind: 'category', name: 'todo' }
readNote('http://example.com').head; // null: a URL is never a head

writeNote('goal', 'Margaret wants Tom to admit he lied.');
// '[[Goal: Margaret wants Tom to admit he lied.]]'
```

Reading is lenient (any case, extra spaces); writing is exact (title case, one space, the body on one line, `]]` written as `] ]`). See the [Phase 2 design](../../docs/drafter-phase2-design.md), §5.3 and §5.4.

## License

MIT
