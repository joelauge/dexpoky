import {
  useState,
  useMemo,
  useEffect,
  useRef,
  Fragment,
  type ReactNode,
} from "react";
import {
  useGetRulebook,
  useSearchRulebook,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search, BookOpen, X, AlertCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RulebookContentProps {
  variant?: "page" | "sheet";
  /**
   * If provided, the rulebook opens with this section expanded and scrolled
   * into view on mount. Used by the deck pages to land directly on
   * "Deck Building" without forcing the user to hunt for it.
   */
  defaultSectionId?: string;
  /**
   * Whether to sync the active section with `window.location.hash`. Enable on
   * the standalone /rules page so deep-links like `/rules#deck-building` work
   * end-to-end.
   */
  syncHash?: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap every match of any of `terms` in <mark> tags. Case-insensitive,
 * whole-word boundary not enforced (so "deck" matches "decks", which is what
 * you want when scanning rules text). Empty terms list returns the input
 * verbatim.
 */
function highlight(text: string, terms: string[]): ReactNode {
  const cleaned = terms.map((t) => t.trim()).filter((t) => t.length >= 2);
  if (cleaned.length === 0) return text;
  const pattern = new RegExp(`(${cleaned.map(escapeRegex).join("|")})`, "gi");
  const termSet = new Set(cleaned.map((t) => t.toLowerCase()));
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    termSet.has(part.toLowerCase()) ? (
      <mark
        key={i}
        className="rounded px-0.5 bg-yellow-200/80 text-foreground dark:bg-yellow-300/40"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function RulebookContent({
  variant = "page",
  defaultSectionId,
  syncHash = false,
}: RulebookContentProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= 2;
  const highlightTerms = useMemo(
    () => (enabled ? trimmed.split(/\s+/).filter((t) => t.length >= 2) : []),
    [enabled, trimmed],
  );

  const [openSections, setOpenSections] = useState<string[]>(() =>
    defaultSectionId ? [defaultSectionId] : [],
  );
  const [tocOpen, setTocOpen] = useState(false); // mobile collapse

  const {
    data: rulebook,
    isLoading: rbLoading,
    isError: rbError,
    refetch: refetchRulebook,
  } = useGetRulebook();
  const {
    data: searchResults,
    isFetching: searching,
    isError: searchError,
  } = useSearchRulebook(
    { q: trimmed },
    {
      query: {
        enabled,
        staleTime: 30_000,
        queryKey: ["/api/rules/search", trimmed],
      },
    },
  );

  const grouped = useMemo(() => {
    if (!rulebook?.sections) return [];
    const map = new Map<string, typeof rulebook.sections>();
    for (const s of rulebook.sections) {
      const arr = map.get(s.category) ?? [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return Array.from(map.entries());
  }, [rulebook]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Open + scroll to a section. Reused by TOC clicks, search jumps, and the
  // initial hash/defaultSectionId effect.
  const focusSection = (sectionId: string, updateHash = false) => {
    setOpenSections((prev) =>
      prev.includes(sectionId) ? prev : [...prev, sectionId],
    );
    setTocOpen(false);
    if (updateHash && syncHash && typeof window !== "undefined") {
      const newHash = `#${sectionId}`;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, "", `${window.location.pathname}${newHash}`);
      }
    }
    // Allow the accordion to mount its content before scrolling.
    setTimeout(() => {
      const el = document.getElementById(`rule-section-${sectionId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  // Initial focus from URL hash or `defaultSectionId` prop.
  const didInitialFocus = useRef(false);
  useEffect(() => {
    if (didInitialFocus.current || !rulebook) return;
    let target: string | null = null;
    if (syncHash && typeof window !== "undefined" && window.location.hash) {
      target = window.location.hash.slice(1);
    }
    if (!target && defaultSectionId) target = defaultSectionId;
    if (target && rulebook.sections.some((s) => s.id === target)) {
      didInitialFocus.current = true;
      focusSection(target, false);
    } else if (rulebook) {
      didInitialFocus.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulebook, defaultSectionId, syncHash]);

  // Listen for back/forward hash changes when syncing.
  useEffect(() => {
    if (!syncHash || typeof window === "undefined") return;
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (id && rulebook?.sections.some((s) => s.id === id)) {
        focusSection(id, false);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncHash, rulebook]);

  const isPage = variant === "page";
  const headingClass = isPage
    ? "text-2xl font-bold tracking-tight"
    : "text-lg font-semibold tracking-tight";

  const headerBlock = (
    <div className={`flex-shrink-0 ${isPage ? "" : "border-b pb-3 mb-3"}`}>
      {isPage && (
        <div className="mb-4 flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className={headingClass}>Pokémon TCG Rulebook</h1>
            {rulebook?.version && (
              <p className="text-xs text-muted-foreground">
                {rulebook.version} ·{" "}
                <a
                  href={rulebook.source}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  Source: official Pokémon TCG rulebook PDF
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search rules — e.g. "mulligan", "Confused", "60 cards"'
          className="pl-9 pr-9"
          aria-label="Search Pokémon TCG rules"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {enabled && !searchError && (
        <p className="text-xs text-muted-foreground mt-2" aria-live="polite">
          {searching
            ? "Searching…"
            : searchResults && searchResults.length > 0
              ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
              : "No matches"}
        </p>
      )}
      {enabled && searchError && (
        <p
          className="text-xs text-destructive mt-2 flex items-center gap-1"
          role="alert"
        >
          <AlertCircle className="h-3 w-3" />
          Search is unavailable right now. Please try again.
        </p>
      )}
    </div>
  );

  const tocBlock = (
    <nav aria-label="Rulebook table of contents" className="text-sm">
      {grouped.map(([category, sections]) => (
        <div key={category} className="mb-3 last:mb-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
            {category}
          </p>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => focusSection(s.id, true)}
                  className="w-full text-left rounded px-2 py-1 text-xs leading-snug hover:bg-muted hover:text-foreground text-muted-foreground transition-colors"
                  data-active={openSections.includes(s.id) || undefined}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {rulebook && rulebook.glossary.length > 0 && (
        <div className="mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
            Reference
          </p>
          <ul>
            <li>
              <button
                type="button"
                onClick={() => focusSection("glossary", true)}
                className="w-full text-left rounded px-2 py-1 text-xs leading-snug hover:bg-muted hover:text-foreground text-muted-foreground transition-colors"
              >
                Glossary ({rulebook.glossary.length})
              </button>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );

  const sectionsBlock = !enabled && rulebook && (
    <div className="space-y-5">
      {grouped.map(([category, sections]) => (
        <section key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {category}
          </h3>
          <Accordion
            type="multiple"
            className="w-full"
            value={openSections}
            onValueChange={(v) => setOpenSections(v)}
          >
            {sections.map((s) => (
              <AccordionItem
                key={s.id}
                value={s.id}
                id={`rule-section-${s.id}`}
                className="border-b last:border-b-0 scroll-mt-24"
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-3">
                  {s.title}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2 leading-relaxed pb-3">
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {highlight(p, highlightTerms)}
                    </p>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}

      {rulebook.glossary.length > 0 && (
        <section id="rule-section-glossary" className="scroll-mt-24">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Glossary
          </h3>
          <Accordion
            type="single"
            collapsible
            className="w-full"
            value={openSections.includes("glossary") ? "glossary" : ""}
            onValueChange={(v) =>
              setOpenSections((prev) =>
                v === "glossary"
                  ? Array.from(new Set([...prev, "glossary"]))
                  : prev.filter((x) => x !== "glossary"),
              )
            }
          >
            <AccordionItem value="glossary" className="border-b-0">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                All terms ({rulebook.glossary.length})
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <dl className="space-y-3 text-sm">
                  {rulebook.glossary.map((g) => (
                    <div
                      key={g.term}
                      className="border-l-2 border-primary/20 pl-3"
                    >
                      <dt className="font-semibold text-foreground">
                        {g.term}
                      </dt>
                      <dd className="text-muted-foreground leading-relaxed">
                        {g.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      )}
    </div>
  );

  const searchResultsBlock = enabled &&
    searchResults &&
    searchResults.length > 0 && (
      <ol className="space-y-3 mb-6">
        {searchResults.map((r, idx) => (
          <li
            key={`${r.sectionId}-${r.term ?? idx}`}
            className="rounded-lg border bg-card p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="font-semibold text-sm leading-tight">
                {r.matchType === "glossary"
                  ? `${r.term} — Glossary`
                  : highlight(r.sectionTitle, highlightTerms)}
              </h4>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {r.category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {highlight(r.snippet, highlightTerms)}
            </p>
            {r.matchType === "section" && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs mt-1"
                onClick={() => {
                  setQuery("");
                  focusSection(r.sectionId, true);
                }}
              >
                Open full section →
              </Button>
            )}
          </li>
        ))}
      </ol>
    );

  // Two-column layout for the standalone page; single-column for the sheet.
  if (isPage) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {headerBlock}

        {/* Mobile TOC toggle */}
        <div className="md:hidden mt-3 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTocOpen((v) => !v)}
            className="gap-2"
            aria-expanded={tocOpen}
            aria-controls="rules-toc-mobile"
          >
            <Menu className="h-4 w-4" />
            {tocOpen ? "Hide contents" : "Table of contents"}
          </Button>
          {tocOpen && (
            <div
              id="rules-toc-mobile"
              className="mt-2 rounded-lg border bg-card p-3 max-h-72 overflow-y-auto"
            >
              {tocBlock}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[14rem_1fr] lg:grid-cols-[16rem_1fr] gap-6 mt-4">
          {/* Sticky desktop TOC */}
          <aside className="hidden md:block">
            <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-card p-3 pr-2">
              {tocBlock}
            </div>
          </aside>

          {/* Section column */}
          <div
            ref={scrollContainerRef}
            className="min-h-0 overflow-y-auto pr-1 -mr-1"
          >
            {rbLoading && (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {rbError && !rbLoading && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  Couldn't load the rulebook.
                </div>
                <p className="text-xs text-destructive/80">
                  The rules service may be temporarily unavailable.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => refetchRulebook()}
                >
                  Try again
                </Button>
              </div>
            )}
            {searchResultsBlock}
            {sectionsBlock}
          </div>
        </div>
      </div>
    );
  }

  // Sheet variant: single column.
  return (
    <div className="flex flex-col h-full min-h-0">
      {headerBlock}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {rbLoading && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {rbError && !rbLoading && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Couldn't load the rulebook.
            </div>
            <p className="text-xs text-destructive/80">
              The rules service may be temporarily unavailable.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => refetchRulebook()}
            >
              Try again
            </Button>
          </div>
        )}
        {searchResultsBlock}
        {sectionsBlock}
      </div>
    </div>
  );
}
