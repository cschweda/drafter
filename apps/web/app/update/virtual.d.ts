// The module `virtual:pwa-register` comes from vite-plugin-pwa (a dependency of @vite-pwa/nuxt),
// which the app does not depend on itself; only the part of it that the plugin uses is declared.
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    /** Called when a new version has taken over, instead of reloading the page. */
    onNeedReload?: () => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
