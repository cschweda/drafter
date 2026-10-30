# Courier Prime

The four styles of [Courier Prime](https://fonts.google.com/specimen/Courier+Prime), copyright 2015 The Courier Prime Project Authors, designed by Alan Dague-Greene. Licensed under the SIL Open Font License 1.1; the license is in [`OFL.txt`](OFL.txt), and it permits embedding the fonts in documents and redistributing them with software.

Downloaded on 2026-10-25 from Google Fonts' repository, [`google/fonts/ofl/courierprime`](https://github.com/google/fonts/tree/main/ofl/courierprime), which builds from the upstream source at [`quoteunquoteapps/CourierPrime`](https://github.com/quoteunquoteapps/CourierPrime). The files are unmodified:

| File | SHA-256 |
|---|---|
| `CourierPrime-Regular.ttf` | `72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af` |
| `CourierPrime-Bold.ttf` | `ff1f38786c849d1c41fa8e447960abdb2bd75fdfb0cfcdeb524fad65a5af3638` |
| `CourierPrime-Italic.ttf` | `f1b9a5829789f7e56432a9f3bc7665ef4531dbba1c112639e48bef39621a006b` |
| `CourierPrime-BoldItalic.ttf` | `3355273f3ea6d6362658f9564f4e83d59e156cf1a182e3c1592b5c5943627dcc` |
| `OFL.txt` | `9a755af092b494944c99f471be6fddd19b006a448fefdc4717e4ee0aa09a97b0` |

`@drafter/render-pdf` never reads these files itself. Callers pass the bytes in, so the package runs in a browser worker as well as in Node: the CLI reads them from here, and the web app will fetch them.

Inter Tight's four static styles, the text faces of a Markdown document's PDF, are in [`inter-tight/`](inter-tight/), with their own license, source, and checksums.
