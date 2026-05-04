import { useState, useMemo, useDeferredValue } from "react";
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
import { Search, BookOpen, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RulebookContentProps {
  variant?: "page" | "sheet";
}

export function RulebookContent({ variant = "page" }: RulebookContentProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const trimmed = deferredQuery.trim();
  const enabled = trimmed.length >= 2;

  const { data: rulebook, isLoading: rbLoading, isError: rbError, refetch: refetchRulebook } =
    useGetRulebook();
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

  const isPage = variant === "page";
  const headingClass = isPage
    ? "text-2xl font-bold tracking-tight"
    : "text-lg font-semibold tracking-tight";

  return (
    <div className="flex flex-col h-full min-h-0">
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
                    Official PDF
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

        {enabled && searchResults && searchResults.length > 0 && (
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
                      : r.sectionTitle}
                  </h4>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {r.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                  {r.snippet}
                </p>
                {r.matchType === "section" && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs mt-1"
                    onClick={() => {
                      setQuery("");
                      setTimeout(() => {
                        const el = document.getElementById(
                          `rule-section-${r.sectionId}`,
                        );
                        el?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 50);
                    }}
                  >
                    Open full section →
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}

        {!enabled && rulebook && (
          <div className="space-y-5">
            {grouped.map(([category, sections]) => (
              <section key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {category}
                </h3>
                <Accordion type="multiple" className="w-full">
                  {sections.map((s) => (
                    <AccordionItem
                      key={s.id}
                      value={s.id}
                      id={`rule-section-${s.id}`}
                      className="border-b last:border-b-0"
                    >
                      <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-3">
                        {s.title}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground space-y-2 leading-relaxed pb-3">
                        {s.paragraphs.map((p, i) => (
                          <p key={i} className="whitespace-pre-line">
                            {p}
                          </p>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}

            {rulebook.glossary.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  Glossary
                </h3>
                <Accordion type="single" collapsible className="w-full">
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
        )}
      </div>
    </div>
  );
}
