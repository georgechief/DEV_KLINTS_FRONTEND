import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  LayoutDashboard,
  Layers,
  ListChecks,
  Loader2,
  LogOut,
  Plug,
  Settings,
  ShieldCheck,
  User,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clearAuth } from "@/lib/auth";
import { isNavRouteAllowed, type DcsAppStatus } from "@/lib/dcs";
import {
  clearOverviewSearch,
  filterOverviewHits,
  getOverviewSearchSnapshot,
  normalizeSearchQuery,
  scrollOverviewHitIntoView,
  setOverviewSearchActiveId,
  setOverviewSearchQuery,
  subscribeOverviewSearch,
  type OverviewSearchHit,
} from "@/lib/overview-search";
import { type SearchHit, type SearchHitType, searchGlobal } from "@/lib/search";

const pages = [
  { to: "/dashboard", label: "Overview", hint: "Governance overview", icon: LayoutDashboard },
  { to: "/data-consistency", label: "Data Consistency Score", hint: "DCS & integrity worklist", icon: ShieldCheck },
  { to: "/lifecycle", label: "Lifecycle cockpit", hint: "5 groups · 11 sub-stages", icon: Layers },
  { to: "/opportunities", label: "Opportunity tracker", hint: "Blocked · Opportunity · Tracked", icon: ListChecks },
  { to: "/workflow", label: "Workflow Studio", hint: "Agent blueprints", icon: Workflow },
  { to: "/qa", label: "QA validation", hint: "Phase 4 · gate runs", icon: ShieldCheck },
  { to: "/handoff", label: "Agent handoff", hint: "Phase 5 · MCP/A2A packages", icon: Workflow },
  { to: "/integrations", label: "Connected stack", hint: "Manago.ai · Shopify", icon: Plug },
  { to: "/activity", label: "Activity", hint: "Governance timeline", icon: Activity },
  { to: "/settings", label: "Settings", hint: "Account & workspace", icon: Settings },
] as const;

const TYPE_ORDER: SearchHitType[] = ["issue", "run", "connector", "audit"];

const GROUP_HEADINGS: Record<SearchHitType, string> = {
  issue: "Checks",
  run: "Runs",
  connector: "Connectors",
  audit: "Activity",
  workflow: "Workflows",
};

const HIT_ICONS: Record<SearchHitType, typeof ListChecks> = {
  issue: ListChecks,
  run: ShieldCheck,
  connector: Plug,
  audit: Activity,
  workflow: Workflow,
};

function getAllowedSearchTypes(dcsStatus?: DcsAppStatus): string[] {
  const types: string[] = [];
  if (isNavRouteAllowed(dcsStatus, "/data-consistency")) {
    types.push("issue", "run");
  }
  if (isNavRouteAllowed(dcsStatus, "/activity")) {
    types.push("audit");
  }
  if (isNavRouteAllowed(dcsStatus, "/integrations")) {
    types.push("connector");
  }
  return types;
}

function filterHitsByLock(hits: SearchHit[], dcsStatus?: DcsAppStatus): SearchHit[] {
  return hits.filter((hit) => {
    if (hit.type === "issue" || hit.type === "run") {
      return isNavRouteAllowed(dcsStatus, "/data-consistency");
    }
    if (hit.type === "audit") {
      return isNavRouteAllowed(dcsStatus, "/activity");
    }
    if (hit.type === "connector") {
      return isNavRouteAllowed(dcsStatus, "/integrations");
    }
    if (hit.type === "workflow") {
      return isNavRouteAllowed(dcsStatus, "/workflow");
    }
    return true;
  });
}

function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 text-foreground">{text.slice(idx, idx + trimmed.length)}</mark>
      {text.slice(idx + trimmed.length)}
    </>
  );
}

const SECTION_LABELS: Record<OverviewSearchHit["section"], string> = {
  nba: "Ranked by projected impact",
  run: "Run progress",
  score: "Data Consistency Score",
  stack: "Stack status",
  activity: "Recent activity",
  value: "Executive summary",
  lifecycle: "Lifecycle coverage",
};

export function SpotlightSearch({
  open,
  onOpenChange,
  dcsStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dcsStatus?: DcsAppStatus | undefined;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onOverview = pathname === "/dashboard";
  const overviewSnap = useSyncExternalStore(
    subscribeOverviewSearch,
    getOverviewSearchSnapshot,
    getOverviewSearchSnapshot,
  );
  const visiblePages = pages.filter((page) => isNavRouteAllowed(dcsStatus, page.to));
  const allowedTypes = useMemo(() => getAllowedSearchTypes(dcsStatus), [dcsStatus]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setResults([]);
    setIsSearching(false);
    setSearchError(false);
    abortRef.current?.abort();
    abortRef.current = null;
    // Keep page highlights briefly after a hit is selected.
    const timer = window.setTimeout(() => {
      clearOverviewSearch();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !onOverview) return;
    setOverviewSearchQuery(query);
  }, [open, onOverview, query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      abortRef.current = null;
      setResults([]);
      setIsSearching(false);
      setSearchError(false);
      return;
    }

    if (allowedTypes.length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(false);

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await searchGlobal(trimmed, {
            types: allowedTypes,
            limit: 6,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setResults(filterHitsByLock(response.results, dcsStatus));
          setSearchError(false);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResults([]);
          setSearchError(true);
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      })();
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, allowedTypes, dcsStatus]);

  const groupedHits = useMemo(() => {
    const groups = new Map<SearchHitType, SearchHit[]>();
    for (const hit of results) {
      const list = groups.get(hit.type) ?? [];
      list.push(hit);
      groups.set(hit.type, list);
    }
    return groups;
  }, [results]);

  const hasApiResults = results.length > 0;
  const trimmedQuery = query.trim();
  const showApiGroups = trimmedQuery.length >= 2 && allowedTypes.length > 0;
  const overviewHits = useMemo(
    () => (onOverview ? filterOverviewHits(overviewSnap.hits, query) : []),
    [onOverview, overviewSnap.hits, query],
  );
  const hasOverviewHits = overviewHits.length > 0;
  const overviewQueryActive = onOverview && Boolean(normalizeSearchQuery(query));

  const go = (
    to: string,
    params?: Record<string, string>,
    search?: Record<string, string | undefined>,
  ) => {
    onOpenChange(false);
    if (params) {
      void navigate({ to, params, search } as never);
    } else if (search) {
      void navigate({ to, search } as never);
    } else {
      void navigate({ to } as never);
    }
  };

  const navigateFromHref = (href: string) => {
    const url = new URL(href, window.location.origin);
    const path = url.pathname;
    const search: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      search[key] = value;
    });
    if (Object.keys(search).length > 0) {
      go(path, undefined, search);
    } else {
      go(path);
    }
  };

  const openOverviewHit = (hit: OverviewSearchHit) => {
    setOverviewSearchActiveId(hit.id);
    onOpenChange(false);
    window.setTimeout(() => {
      scrollOverviewHitIntoView(hit.id);
      if (hit.section === "nba") {
        const card = document.querySelector<HTMLElement>(
          `[data-ov-search-id="${CSS.escape(hit.id)}"]`,
        );
        card?.click();
      }
    }, 40);
  };

  const emptyMessage = (() => {
    if (searchError) {
      return "Search unavailable. Navigate and account actions still work.";
    }
    if (overviewQueryActive && !hasOverviewHits && !hasApiResults && !isSearching) {
      return "No matching results found.";
    }
    if (showApiGroups && !isSearching && !hasApiResults && !hasOverviewHits) {
      return "No matching results found.";
    }
    if (trimmedQuery.length >= 2 && isSearching) {
      return "Searching…";
    }
    if (onOverview) {
      return "Type to search this Executive Overview, or checks and connectors.";
    }
    return "Type at least two characters to search checks, activity, and connectors.";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[18%] max-w-[640px] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/80 bg-elevated p-0 shadow-[0_24px_80px_-20px_rgba(22,22,26,0.45)] [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Search Klints</DialogTitle>
        <Command shouldFilter={false} className="rounded-2xl bg-transparent">
          <CommandInput
            placeholder={
              onOverview
                ? "Search overview, checks, activity, connectors…"
                : "Search checks, activity, connectors, pages…"
            }
            className="h-14 text-base"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[min(420px,55vh)]">
            <CommandEmpty>{emptyMessage}</CommandEmpty>

            {overviewQueryActive && !hasOverviewHits ? (
              <div className="px-3 py-2.5 text-sm text-muted-foreground">
                No matching results found.
              </div>
            ) : null}

            {hasOverviewHits ? (
              <CommandGroup heading="On this page">
                {overviewHits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={`overview-${hit.id}-${hit.title}`}
                    onSelect={() => openOverviewHit(hit)}
                  >
                    <LayoutDashboard />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{highlightMatch(hit.title, query)}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {highlightMatch(
                          hit.subtitle
                            ? `${SECTION_LABELS[hit.section]} · ${hit.subtitle}`
                            : SECTION_LABELS[hit.section],
                          query,
                        )}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            <CommandGroup heading="Navigate">
              {visiblePages.map((p) => {
                const Icon = p.icon;
                return (
                  <CommandItem
                    key={p.to}
                    value={`nav-${p.to}`}
                    onSelect={() => go(p.to)}
                  >
                    <Icon />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span>{highlightMatch(p.label, query)}</span>
                      <span className="text-[11px] text-muted-foreground">{p.hint}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {showApiGroups && isSearching && !hasApiResults ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            ) : null}

            {showApiGroups &&
              TYPE_ORDER.map((type) => {
                const hits = groupedHits.get(type);
                if (!hits?.length) return null;
                const Icon = HIT_ICONS[type];
                return (
                  <div key={type}>
                    <CommandSeparator />
                    <CommandGroup heading={GROUP_HEADINGS[type]}>
                      {hits.map((hit) => (
                        <CommandItem
                          key={`${hit.type}-${hit.id}`}
                          value={`${hit.type}-${hit.id}-${hit.title}`}
                          onSelect={() => navigateFromHref(hit.href)}
                        >
                          <Icon />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{highlightMatch(hit.title, query)}</span>
                            {hit.subtitle ? (
                              <span className="truncate text-[11px] text-muted-foreground">
                                {highlightMatch(hit.subtitle, query)}
                              </span>
                            ) : null}
                          </div>
                          {hit.type === "issue" && hit.meta?.status ? (
                            <CommandShortcut>{String(hit.meta.status)}</CommandShortcut>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </div>
                );
              })}

            <CommandSeparator />

            <CommandGroup heading="Account">
              {isNavRouteAllowed(dcsStatus, "/settings") && (
                <CommandItem
                  value="account-settings"
                  onSelect={() => go("/settings", undefined, { tab: "account" })}
                >
                  <User />
                  <span>User settings</span>
                </CommandItem>
              )}
              <CommandItem
                value="account-logout"
                onSelect={() => {
                  clearAuth();
                  go("/signin");
                }}
              >
                <LogOut />
                <span>Log out</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>

          <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-sand px-1 font-mono text-[10px]">↵</kbd>{" "}
              open
            </span>
            <span>
              <kbd className="rounded border border-border bg-sand px-1 font-mono text-[10px]">↑↓</kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-sand px-1 font-mono text-[10px]">esc</kbd>{" "}
              close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
