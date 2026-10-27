// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type DesktopBridge,
  type DesktopFilesBridge,
  desktop,
  isDesktopBuild,
} from '../app/desktop';

const BRIDGE: DesktopBridge = {
  version: '0.3.0',
  platform: 'linux',
  files: {} as DesktopFilesBridge,
};

describe('desktop()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.drafterDesktop;
  });

  test('is null in a browser', () => {
    expect(isDesktopBuild()).toBe(false);
    expect(desktop()).toBeNull();
  });

  test('ignores a bridge in a build not made for the desktop', () => {
    window.drafterDesktop = BRIDGE;
    expect(desktop()).toBeNull();
  });

  test('is the bridge in the desktop build', () => {
    vi.stubGlobal('__DRAFTER_DESKTOP__', true);
    expect(isDesktopBuild()).toBe(true);
    expect(desktop()).toBeNull();
    window.drafterDesktop = BRIDGE;
    expect(desktop()).toBe(BRIDGE);
  });
});
