# Inter Tight

Four static styles of [Inter Tight](https://fonts.google.com/specimen/Inter+Tight): Regular 400, Italic 400, SemiBold 600, and SemiBold Italic 600, version 3.004, copyright 2022 The Inter Project Authors ([`rsms/inter-tight`](https://github.com/rsms/inter-tight)). Licensed under the SIL Open Font License 1.1; the license is in [`OFL.txt`](OFL.txt), and it permits embedding the fonts in documents and redistributing them with software. They are the text faces of a Markdown document's PDF; its code is Courier Prime Regular, from [`../`](../).

Downloaded on 2026-10-29 from Google Fonts: the CSS2 API (`https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400;0,600;1,400;1,600`), asked for TTF, serves the static files from `https://fonts.gstatic.com/s/intertight/v9/`, the same source as the brand's files. `OFL.txt` is Google Fonts' copy, [`google/fonts/ofl/intertight/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/intertight/OFL.txt). The files are unmodified, and `InterTight-SemiBold.ttf` is the brand's own file (see [`brand/README.md`](../../../../brand/README.md)):

| File | SHA-256 |
|---|---|
| `InterTight-Regular.ttf` | `27350bc95b961b9b4e1a80d872f49e903fe727f290f6b2a079e67ceb1685fb1f` |
| `InterTight-Italic.ttf` | `ba1cad99039a691944564d8ebb7bbf05a6d686b69e26494a8605c00a4e9c106f` |
| `InterTight-SemiBold.ttf` | `a40a1fdc93cadcbb0e3ba16d6010988118a1a3add06a097330b09cb41c2b8d45` |
| `InterTight-SemiBoldItalic.ttf` | `ba711bd22622723fedb309e2c3fa1e210d25aaa704efe9cbc47f3e34ed46b335` |
| `OFL.txt` | `50240ab035cf1b6b3307940235481d515c4b6de3ab1fa843dbe59e7892cb9d58` |

`@drafter/render-pdf` never reads these files itself. Callers pass the bytes in, as they do Courier Prime's.
