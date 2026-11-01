# The story map's fonts

Three families, four faces, each cut down to the letters a story map needs and embedded in the page as a `data:` URL, so the page loads nothing from anywhere:

| File | Face | Use on the page | Copyright |
|---|---|---|---|
| `Anton-Regular.woff2` | Anton Regular | The title, headings, big numbers | Copyright 2020 The Anton Project Authors |
| `Archivo-Regular.woff2` | Archivo 400 | Body text | Copyright 2020 The Archivo Project Authors |
| `Archivo-SemiBold.woff2` | Archivo 600 | The logline, names in lists | Copyright 2020 The Archivo Project Authors |
| `CourierPrime-Regular.woff2` | Courier Prime Regular | Labels, lines of dialogue | Copyright 2015 The Courier Prime Project Authors |

All three are under the **SIL Open Font License 1.1**, which allows embedding, subsetting, and sharing them with software. Each licence is kept here as it came: [`OFL-Anton.txt`](OFL-Anton.txt), [`OFL-Archivo.txt`](OFL-Archivo.txt), and [`OFL-CourierPrime.txt`](OFL-CourierPrime.txt). None of them names a Reserved Font Name (each copyright line stands alone, with no "with Reserved Font Name" after it), so a subset may keep its name. Each subset also keeps the copyright and the licence in its own `name` table (IDs 0 and 13–14), and the page puts each face's copyright in a comment beside its `@font-face`.

## Sources

- **Anton:** `ofl/anton/Anton-Regular.ttf` and `ofl/anton/OFL.txt` from [google/fonts](https://github.com/google/fonts) at commit `6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec` (the files last changed in `e0a8124cf36bb7c32ca68e5d46d6acdbc3df866a`). Upstream: [googlefonts/AntonFont](https://github.com/googlefonts/AntonFont).
- **Archivo:** `ofl/archivo/Archivo[wdth,wght].ttf` (the variable font, 658 KB) and `ofl/archivo/OFL.txt` from google/fonts at the same commit (the files last changed in `6c70c829f09ea345d3590406693220ea35c6553f`). Upstream: [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo).
- **Courier Prime:** the repository's own `packages/render-pdf/fonts/CourierPrime-Regular.ttf` and its `OFL.txt` (see that folder's README).

| Source | SHA-256 |
|---|---|
| `Anton-Regular.ttf` | `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab` |
| `Archivo[wdth,wght].ttf` | `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053` |
| `CourierPrime-Regular.ttf` | `72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af` |

## How they were made

A one-off, on 2026-11-01, with fontTools 4.68.0 and brotli 1.2.1 in a scratch virtual environment (`python3 -m venv venv && venv/bin/pip install fonttools brotli`). Neither is a dependency of Drafter.

Archivo's two weights are first cut from the variable font as static instances:

```sh
fonttools varLib.instancer "Archivo[wdth,wght].ttf" wght=400 wdth=100 -o Archivo-400.ttf
fonttools varLib.instancer "Archivo[wdth,wght].ttf" wght=600 wdth=100 -o Archivo-600.ttf
```

Then each face is subset to Latin, Latin-1, and common punctuation (dashes, quotes, the ellipsis, arrows, the euro and trade marks, the minus sign), keeping kerning and ligatures, the copyright, and the licence, and written as WOFF2:

```sh
pyftsubset <in>.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+20AC,U+2122,U+2190-2193,U+2212" \
  --layout-features="kern,liga" --name-IDs="0,1,2,3,4,5,6,13,14" \
  --flavor=woff2 --output-file=<out>.woff2
```

The same inputs give the same bytes. A letter outside the subset (a name in Greek, a line in Japanese) is drawn in the reader's own fonts, through each family's fallback list.

The Archivo instancer keeps the variable font's naming of the default instance, so both Archivo files call themselves "Archivo SemiBold" inside. The page never reads that name: each `@font-face` sets its own family and weight.

## The files

| File | Bytes | SHA-256 |
|---|---|---|
| `Anton-Regular.woff2` | 15040 | `078fd606075a2d4778236b930d002d6ff78481ae09119b1bb063eb13f996267e` |
| `Archivo-Regular.woff2` | 11012 | `1f329a8800368424d15ffefe144bc067dd86817a514db8c8f9947fecce85658f` |
| `Archivo-SemiBold.woff2` | 10572 | `de8360058fae2935e36b0aa5870a1f83d847ae2ce2e0c52b9c3d683028cbfafe` |
| `CourierPrime-Regular.woff2` | 18048 | `8d4a2cc182bb09d72809161285b5c635d9c70b95304e9a5e7691d1335c2fe4f5` |
| `OFL-Anton.txt` | 4484 | `ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4` |
| `OFL-Archivo.txt` | 4388 | `108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b` |
| `OFL-CourierPrime.txt` | 4403 | `9a755af092b494944c99f471be6fddd19b006a448fefdc4717e4ee0aa09a97b0` |

The four faces are 54,672 bytes in all (53.4 KB), about 73 KB as base64.

`@drafter/story-map` never reads these files itself. Callers pass the bytes in (`STORY_MAP_FONT_FILES` names them), so the package runs in a browser worker as well as in Node.
