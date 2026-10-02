import { Link } from "wouter";
import { CheckCircle2, Clock3 } from "lucide-react";
import type { PokemonSetSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSetActivityTime, type RecentSetActivity } from "@/lib/recent-set-activity";

export function ExpansionCard({
  set, ownedCount, activity,
}: { set: PokemonSetSummary; ownedCount: number; activity?: RecentSetActivity }) {
  const progress = set.totalCards > 0 ? Math.min(100, Math.round((ownedCount / set.totalCards) * 100)) : 0;
  const isComplete = set.totalCards > 0 && ownedCount >= set.totalCards;
  const hasStarted = ownedCount > 0;
  return (
    <Link href={`/sets/${encodeURIComponent(set.id)}`} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      data-testid={`${activity ? "recent" : "expansion"}-set-${set.id}`}>
      <Card className={`group relative overflow-hidden h-full rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border ${
        isComplete
          ? "border-amber-200 bg-gradient-to-b from-amber-50/50 to-white dark:from-amber-950/20 dark:to-card dark:border-amber-900/50"
          : hasStarted
            ? "border-primary/20 bg-gradient-to-b from-primary/5 to-card hover:border-primary/40"
            : "border-border/50 bg-card/50 hover:bg-card hover:border-border"
      }`}>
        {set.logoUrl && (
          <div className="absolute right-0 top-0 w-32 h-32 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 pointer-events-none translate-x-4 -translate-y-4">
            <img src={set.logoUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
          </div>
        )}
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex justify-between items-start gap-3 mb-4">
            <div className="h-12 w-24 shrink-0 flex items-center justify-start">
              {set.logoUrl ? (
                <img src={set.logoUrl} alt={`${set.name} logo`} loading="lazy"
                  className="max-h-full max-w-full object-contain filter drop-shadow-sm group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="text-sm font-semibold text-muted-foreground line-clamp-2">{set.name}</div>
              )}
            </div>
            {set.symbolUrl && (
              <div className="h-6 w-6 shrink-0 rounded-full bg-background/50 p-1 flex items-center justify-center shadow-sm">
                <img src={set.symbolUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain"
                  onError={(event) => {
                    const badge = event.currentTarget.parentElement;
                    if (badge) badge.style.display = "none";
                  }} />
              </div>
            )}
          </div>
          <div className="mt-auto space-y-3">
            <div>
              <Badge variant="secondary" className="mb-2 max-w-full truncate bg-secondary/50 text-[10px] font-semibold">
                {set.seriesName || "Other"}
              </Badge>
              <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">{set.name}</h3>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <span>{set.releaseDate ? new Date(set.releaseDate).getFullYear() : "Unknown"}</span>
                <span className="mx-1.5">•</span>
                <span>{set.totalCards} cards</span>
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className={isComplete ? "text-amber-600 dark:text-amber-500 flex items-center gap-1" : hasStarted ? "text-primary" : "text-muted-foreground"}>
                  {isComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {ownedCount} / {set.totalCards}
                </span>
                <span className={isComplete ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}>{progress}%</span>
              </div>
              <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${
                  isComplete ? "bg-amber-400 dark:bg-amber-500" : hasStarted ? "bg-primary" : "bg-transparent"
                }`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
          {activity && (
            <p className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
              <span>{activity.kind === "visited" ? "Opened" : activity.kind === "added" ? "Cards added" : "Cards updated"}{" "}
                <time dateTime={new Date(activity.activityAt).toISOString()} title={new Date(activity.activityAt).toLocaleString()}>
                  {formatSetActivityTime(activity.activityAt)}
                </time>
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}