# Raw HTML

<script>window.__trapped = 'script'</script>

<iframe src="https://example.invalid/" onload="window.__trapped = 'iframe'"></iframe>

<img src="x" onerror="window.__trapped = 'img'">

<object data="https://example.invalid/x.swf"></object>

<meta http-equiv="refresh" content="0; url=https://example.invalid/">

<style>body { display: none }</style>

Inline <b onmouseover="window.__trapped = 'b'">bold</b> and <svg onload="window.__trapped = 'svg'"></svg>.
