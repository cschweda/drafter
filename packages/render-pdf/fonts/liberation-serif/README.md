# Liberation Serif

The four styles of [Liberation Serif](https://github.com/liberationfonts/liberation-fonts): Regular, Italic, Bold, and Bold Italic, version 2.1.5, digitized data copyright (c) 2010 Google Corporation, with Reserved Font Arimo, Tinos and Cousine; copyright (c) 2012 Red Hat, Inc., with Reserved Font Name Liberation. Licensed under the SIL Open Font License 1.1; the license is in [`OFL.txt`](OFL.txt) (the release's `LICENSE` file, renamed), and it permits embedding the fonts in documents and redistributing them with software. Liberation Serif is metrically compatible with Times New Roman: it is the Times-style face of a novel's manuscript PDF. A manuscript in Courier uses Courier Prime, from [`../`](../).

Downloaded on 2026-11-05 from the project's GitHub release [2.1.5](https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5), the asset `liberation-fonts-ttf-2.1.5.tar.gz` (SHA-256 `7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0`). Only the four Serif files and the license are kept. The files are unmodified:

| File | SHA-256 |
|---|---|
| `LiberationSerif-Regular.ttf` | `058ea80864aef09a23f45cbec2bb5400bc3dfbdea01c3f10538a21fcb497fb74` |
| `LiberationSerif-Italic.ttf` | `0e3dea9f8d613e006ccfa62201f33e265d19167bd0907725c3e145368b04fc2e` |
| `LiberationSerif-Bold.ttf` | `d754ba427cfe0bca54ae052384baa8f842da5bd6550ad4da024ac441e7a7d5ce` |
| `LiberationSerif-BoldItalic.ttf` | `f17db8af71e24d2066b587546021d4f0b296be389512b658dec3c09affeb11a7` |
| `OFL.txt` | `93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b` |

`@drafter/render-pdf` never reads these files itself. Callers pass the bytes in, as they do Courier Prime's.
