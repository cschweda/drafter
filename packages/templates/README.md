# @drafter/templates

Format templates for [Drafter](https://github.com/cschweda/drafter). A template is a JSON document that says how each element of a script is formatted and how pages break; the pagination engine knows nothing about screenplays or plays beyond what a template tells it.

```ts
import { builtins, loadTemplate, resolveRole } from '@drafter/templates';
import { parse } from '@drafter/fountain';

const screenplay = builtins['us-screenplay'];
const doc = parse('INT. KITCHEN - NIGHT\n\nMargaret waits.\n');
doc.blocks.map((block) => resolveRole(screenplay, block, null)); // ['scene_heading', 'action']

// A template can extend another and override only what differs.
const sitcom = loadTemplate({
  id: 'my-sitcom',
  name: 'My Sitcom',
  extends: 'us-screenplay',
  roles: { dialogue: { lineSpacing: 2 }, action: { case: 'upper' } },
});
```

## API

| Export | What it does |
|---|---|
| `builtins` | The built-in templates by id: `us-screenplay` and `stage-play-standard`. Frozen. |
| `loadTemplate(json, registry?)` | Validates a template, resolves `extends` (against the built-ins unless you pass a registry), and converts `{ "in": n }` values to characters and lines. |
| `loadTemplates(jsons, registry?)` | Loads a set of templates that may extend one another, in dependency order, and detects `extends` cycles. Loads all of them or none. |
| `resolveRole(template, block, prevRole)` | The role a parsed block takes: the first rule in the role map that matches. |
| `TemplateError` | Thrown for any invalid template. `problems` lists every problem, each with the path to the field. |
| `PAPER_POINTS`, `CHAR_WIDTH_PT`, `LINE_HEIGHT_PT` | Paper sizes and the 12 pt Courier grid, for renderers. |

## Units

Measurements are in **characters** across and **lines** down, at 12 pt Courier: 10 characters and 6 lines to the inch. A US letter page is an 85 × 66 grid; A4 is 82 × 70. Any measurement can be written in inches as `{ "in": 1.5 }`; a value that doesn't land on a whole character or line is an error, not a silent rounding.

## Roles and the role map

Fountain has thirteen block kinds; formats have *roles*. A stage play has stage directions, a radio script has sound cues. The `roleMap` assigns roles with ordered rules, first match wins:

```jsonc
"roleMap": [
  { "kind": "section", "depth": 1, "role": "act_heading" },
  { "kind": "character", "names": ["SFX", "FX"], "role": "sfx_cue" },
  { "kind": "dialogue", "afterRole": "sfx_cue", "role": "sfx_text" },
  { "kind": "action", "role": "stage_direction" },
  { "kind": ["section", "synopsis", "note", "boneyard"], "role": "omit" },
  { "kind": "*", "role": "@kind" }
]
```

Character rules match exact names, compared without regard to case; templates contain no regular expressions. Two roles are reserved: `omit` prints nothing, and `disabled` prints the block the way the template prints action. Every other role a rule names must have a style in `roles`, and every kind must reach a rule without conditions; the loader checks both.

With `extends`, objects merge key by key with the child winning, the child's role rules go before the parent's, and every other array replaces the parent's. Validation runs on the merged result.

## License

MIT
