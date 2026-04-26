import type { ParchmentApi } from './index';

declare global {
  interface Window {
    api: ParchmentApi;
  }
}

export {};
