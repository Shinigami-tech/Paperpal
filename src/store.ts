/** "My papers": everything stays in this browser (localStorage). */
import type { Analysis, ChatTurn, Reply, Verification } from '../api/_types';

export interface Source {
  title: string;
  url: string;
}

export interface SavedDoc {
  id: string;
  created: number;
  thumb: string;
  analysis: Analysis;
  verification?: Verification;
  reply?: Reply;
  chat: (ChatTurn & { sources?: Source[] })[];
  done: boolean[];
  /** last day a browser reminder was shown for this doc */
  notified?: string;
}

const KEY = 'paperpal-docs-v1';
const PREF = 'paperpal-prefs-v1';

export function loadDocs(): SavedDoc[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as SavedDoc[];
  } catch {
    return [];
  }
}

export function saveDocs(docs: SavedDoc[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs.slice(0, 40)));
  } catch {
    // storage full: drop thumbnails of the oldest docs and retry
    try {
      localStorage.setItem(KEY, JSON.stringify(docs.slice(0, 40).map((d, i) => (i > 5 ? { ...d, thumb: '' } : d))));
    } catch {
      /* give up silently */
    }
  }
}

export interface Prefs {
  lang: string;
  country: string;
  name: string;
}

export function loadPrefs(): Prefs {
  const def = { lang: 'English', country: '', name: '' };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(PREF) || '{}') as Partial<Prefs>) };
  } catch {
    return def;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** days from today to an ISO date (negative = overdue) */
export function daysLeft(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso.slice(0, 10) + 'T23:59:59');
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86400000) - 0;
}
