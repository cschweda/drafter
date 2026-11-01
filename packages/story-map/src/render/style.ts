// The story map's fixed stylesheet: phone first (390 px, 16 px gutters), dark only on screen, a
// light sheet for print. What varies per script is a generated rule appended after it, in the
// same `<style>`: the CSP allows no style attribute. Later sections add their own fixed rules
// beside their markup (`Section.rules`).

/** The palette (Global Constraints): `--dim` only for large display numbers and decoration. */
const ROOT =
  ':root{color-scheme:dark;' +
  '--bg:#0c1315;--panel:#131d20;--panel2:#18252a;--line:#24353a;--fg:#e7efed;--mute:#8ba19d;--dim:#5d7672;' +
  '--coral:#ff7b6b;--aqua:#62d6c5;--sand:#ecc986;--ember:#ff9a3d;--ink:#0c1315;' +
  '--display:"Anton",Impact,"Arial Narrow",sans-serif;' +
  '--body:"Archivo","Helvetica Neue",Arial,sans-serif;' +
  '--mono:"Courier Prime","Courier New",Courier,monospace}';

const BASE = `*{box-sizing:border-box}
html{background:var(--bg);scroll-behavior:smooth;scroll-padding-top:52px}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);font-size:16px;line-height:1.5;padding-inline:16px;overflow-wrap:break-word;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.wrap{max-width:1160px;margin:0 auto}
h1,h2,h3,h4{font-family:var(--display);font-weight:400;text-transform:uppercase;letter-spacing:.01em;margin:0;line-height:.95;text-wrap:balance}
a{color:inherit}
:focus-visible{outline:2px solid var(--sand);outline-offset:3px;border-radius:2px}
dl,dd{margin:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.lbl{font-family:var(--mono);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin:0 0 12px}
.cap{color:var(--mute);font-size:15px;margin:0 0 16px}
section{padding-top:56px}
.sec-h{font-size:clamp(52px,9vw,96px);line-height:.88;margin-bottom:22px}
.panel{background:var(--panel);border:1px solid var(--line);padding:18px 14px 14px;margin-top:16px}`;

const HERO = `.hero{padding-block:28px 32px}
.from{display:flex;gap:12px;align-items:center;margin:0;font-size:15px;line-height:1.3;color:var(--mute)}
.from b{display:block;color:var(--fg);font-weight:600;font-size:16px}
.av{width:42px;height:42px;border-radius:50%;background:var(--coral);color:var(--ink);display:grid;place-items:center;font-family:var(--display);font-size:17px;letter-spacing:.04em;flex:none}
.hero h1{line-height:.8;letter-spacing:.012em;margin:30px 0 22px;overflow-wrap:anywhere;text-wrap:wrap}
.hero h1 span{display:block}
.status{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:0;font-family:var(--mono);font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.pill{padding:5px 10px 4px;border-radius:999px;border:1px solid currentColor}
.pill.wip{color:var(--coral)}.pill.done{color:var(--aqua)}
.log{font-size:clamp(22px,3vw,30px);line-height:1.25;font-weight:600;margin:22px 0 0;max-width:24em;text-wrap:pretty}
.explain{color:var(--mute);font-size:15px;margin:12px 0 0;max-width:36em}
.meter{margin-top:26px;background:var(--panel);border:1px solid var(--line);padding:16px 16px 14px}
.mrow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 10px}
.mrow b{font-family:var(--display);font-weight:400;text-transform:uppercase;font-size:26px;letter-spacing:.02em;color:var(--coral)}
.mrow span{font-family:var(--mono);font-size:12.5px;color:var(--mute)}
.meter svg{display:block;overflow:visible}
.mbg{fill:none;stroke:var(--dim);stroke-width:1.5;stroke-dasharray:4 4}
.mfg{fill:var(--coral)}
.mnote{margin:10px 0 0;font-size:14px;color:var(--mute)}
.meter .mnote:first-child{margin:0}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:24px}
.facts>div{background:var(--bg);padding:14px 12px 12px;display:flex;flex-direction:column;gap:6px}
.facts dd{order:-1;font-family:var(--display);font-size:34px;line-height:.95;text-transform:uppercase;white-space:nowrap}
.facts dd small{font-size:.5em;color:var(--mute);margin-right:2px}
.facts dt{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);line-height:1.25}
.facts>div:nth-child(2){grid-column:span 2}`;

const NAV = `nav{position:sticky;top:0;z-index:5;background:rgb(12 19 21 / .95);border-block:1px solid var(--line);margin-inline:-16px;padding-inline:16px}
nav ul{list-style:none;margin:0 auto;padding:12px 0;max-width:1160px;display:flex;gap:20px;overflow-x:auto;scrollbar-width:none;font-family:var(--mono);font-size:13px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
nav a{text-decoration:none;color:var(--mute)}
nav a:hover{color:var(--coral);text-decoration:underline}`;

const CLOSE = `.soon{margin-top:80px;border-top:6px solid var(--coral);padding:28px 0 48px;display:grid;gap:24px}
.soon h2{font-size:clamp(96px,16vw,180px);line-height:.8}
.soon h2 span{display:block;color:var(--coral)}
.soon dl{display:grid;gap:14px}
.soon dt{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.soon dd{font-size:18px;margin-top:2px}
.soon dd a{color:var(--aqua);text-decoration:none;border-bottom:1px solid rgb(98 214 197 / .4)}
.made{margin:0;color:var(--mute);font-family:var(--mono);font-size:12px;border-top:1px solid var(--line);padding-top:16px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 20px}`;

const WIDE = `@media (min-width:700px){
body{padding-inline:28px;font-size:17px}
nav{margin-inline:-28px;padding-inline:28px}
.facts{grid-template-columns:1fr 1.6fr 1fr 1fr 1fr}
.facts>div:nth-child(2){grid-column:auto}
.facts dd{font-size:46px}
.facts>div{padding:18px 18px 16px}
.panel{padding:24px 24px 20px}
.soon{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:end}
.made{grid-column:1/-1}
}
@media (min-width:1100px){.hero h1{margin-top:36px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

/** Ink on white, the nav hidden, and nothing broken across sheets (design §10.6). */
const PRINT = `@media print{
:root{--bg:#fff;--panel:#fff;--panel2:#f1f3f2;--line:#c9d1cf;--fg:#111;--mute:#444;--dim:#666;--coral:#c2412f;--aqua:#13786b;--sand:#8a6414;--ember:#b65a00;color-scheme:light}
body{font-size:12pt}
nav{display:none}
.hero{padding-top:0}
.meter,.panel{border-color:var(--line)}
.card,.pq,.sc,.panel,.meter,.facts,.soon,figure,table{break-inside:avoid}
h2,h3,h4{break-after:avoid}
section{padding-top:24pt}
a{text-decoration:none}
}`;

export const STORY_MAP_STYLESHEET = [ROOT, BASE, HERO, NAV, CLOSE, WIDE, PRINT].join('\n');
