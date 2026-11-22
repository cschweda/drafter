// Says how the Chromium the browser tests launch rasters its pages, and fails unless that is on
// the GPU. checks.yml runs it on Linux before the tests, with the switches playwright.config.ts
// gives the browser there: if a new Chromium refuses them, the job fails here and says so, where
// otherwise the tests would go back to the software raster path and its stopped pages unnoticed.
import { chromium } from '@playwright/test';

const ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--enable-gpu-rasterization',
];

const browser = await chromium.launch({ args: ARGS });
const session = await browser.newBrowserCDPSession();
const { gpu } = await session.send('SystemInfo.getInfo');
const status = gpu.featureStatus ?? {};
console.log(
  `raster: ${status.rasterization}; compositing: ${status.gpu_compositing}; Chromium ${browser.version()}`,
);
await browser.close();
if (!String(status.rasterization).startsWith('enabled')) {
  console.error('The browser does not raster on the GPU with these switches.');
  process.exit(1);
}
