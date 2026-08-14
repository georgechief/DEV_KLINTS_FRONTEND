import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

export type OverviewSearchSection =
  | "nba"
  | "run"
  | "score"
  | "stack"
  | "activity"
  | "value"
  | "lifecycle";

export type OverviewSearchHit = {
  id: string;
  section: OverviewSearchSection;
  title: string;
  subtitle?: string;
  /** Lowercased searchable blob built from visible page text. */
  haystack: string;
};

type StoreSnapshot = {
  hits: OverviewSearchHit[];
  query: string;
  activeId: string | null;
};

type Listener = () => void;

let snapshot: StoreSnapshot = {
  hits: [],
  query: "",
  activeId: null,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getOverviewSearchSnapshot(): StoreSnapshot {
  return snapshot;
}

export function subscribeOverviewSearch(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hitsAreEqual(a: OverviewSearchHit[], b: OverviewSearchHit[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.section !== right.section ||
      left.title !== right.title ||
      left.subtitle !== right.subtitle ||
      left.haystack !== right.haystack
    ) {
      return false;
    }
  }
  return true;
}

/** Publish searchable overview hits. No-op when content is unchanged (avoids render loops). */
export function setOverviewSearchHits(hits: OverviewSearchHit[]) {
  if (hitsAreEqual(snapshot.hits, hits)) return;
  snapshot = { ...snapshot, hits };
  emit();
}

export function setOverviewSearchQuery(query: string) {
  const next = query;
  if (snapshot.query === next) return;
  snapshot = { ...snapshot, query: next, activeId: null };
  emit();
}

export function setOverviewSearchActiveId(activeId: string | null) {
  if (snapshot.activeId === activeId) return;
  snapshot = { ...snapshot, activeId };
  emit();
}

export function clearOverviewSearch() {
  snapshot = { hits: snapshot.hits, query: "", activeId: null };
  emit();
}

/** Collapse whitespace and lowercase for matching. */
export function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

export function textMatchesQuery(text: string, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return false;
  return text.toLowerCase().replace(/\s+/g, " ").includes(q);
}

export function joinSearchText(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part == null ? "" : String(part)))
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterOverviewHits(
  hits: OverviewSearchHit[],
  query: string,
): OverviewSearchHit[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];
  return hits.filter((hit) => hit.haystack.includes(q));
}

/** Split text and wrap case-insensitive matches in <mark>. */
export function highlightSearchText(text: string, query: string): ReactNode {
  const q = normalizeSearchQuery(query);
  if (!q || !text) return text;

  const source = String(text);
  const lower = source.toLowerCase();
  const nodes: ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(q, start);
  let key = 0;

  while (idx >= 0) {
    if (idx > start) {
      nodes.push(source.slice(start, idx));
    }
    nodes.push(
      createElement(
        "mark",
        { key: `m-${key++}`, className: "ov-search-mark" },
        source.slice(idx, idx + q.length),
      ),
    );
    start = idx + q.length;
    idx = lower.indexOf(q, start);
  }

  if (start < source.length) {
    nodes.push(source.slice(start));
  }

  return createElement(Fragment, null, ...nodes);
}

export function scrollOverviewHitIntoView(id: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(`[data-ov-search-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}
