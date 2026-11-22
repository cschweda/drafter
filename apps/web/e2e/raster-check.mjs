// The hang hunt's thirteenth round: says how the browser the tests launch rasters its pages, and
// fails unless that is on the GPU. Run with the same HUNT_ARGS as the tests.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: (process.env.HUNT_ARGS ?? '').split(' ').filter(Boolean),
});
const session = await browser.newBrowserCDPSession();
const { gpu } = await session.send('SystemInfo.getInfo');
const status = gpu.featureStatus ?? {};
console.log(
  `raster: ${status.rasterization}; compositing: ${status.gpu_compositing}; ${browser.version()}`,
);
await browser.close();
if (!String(status.rasterization).startsWith('enabled')) process.exit(1);
