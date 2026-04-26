import Store from 'electron-store';

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

interface StoreSchema {
  recents: RecentFile[];
  version: number;
}

const MAX_RECENTS = 10;

const store = new Store<StoreSchema>({
  name: 'parchment',
  defaults: {
    recents: [],
    version: 1
  }
});

export function getRecents(): RecentFile[] {
  return store.get('recents', []);
}

export function addRecent(entry: RecentFile): RecentFile[] {
  const existing = getRecents().filter((r) => r.path !== entry.path);
  const next = [entry, ...existing].slice(0, MAX_RECENTS);
  store.set('recents', next);
  return next;
}

export function removeRecent(path: string): RecentFile[] {
  const next = getRecents().filter((r) => r.path !== path);
  store.set('recents', next);
  return next;
}

export function clearRecents(): RecentFile[] {
  store.set('recents', []);
  return [];
}
