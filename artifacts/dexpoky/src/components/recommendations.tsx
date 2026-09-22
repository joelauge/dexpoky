import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetRecommendationsOpportunities,
  useGetCardsIdRecommendations,
  usePostRecommendationsKeyFeedback,
  GetRecommendationsOpportunitiesProfile,
  RecommendationAction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card as CardUI, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatLabel } from "@/lib/constants";
import { Link } from "wouter";
import {
  Archive, Swords, Tag, ArrowRightLeft, Award, Eye,
  ThumbsUp, ThumbsDown, X, ShieldCheck, Zap, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function useRecommendationProfile() {
  const [profile, setProfile] = useState<GetRecommendationsOpportunitiesProfile>("collector");
  
  useEffect(() => {
    const saved = localStorage.getItem("dexpoky:recommendation_profile");
    if (saved && Object.values(GetRecommendationsOpportunitiesProfile).includes(saved as any)) {
      setProfile(saved as GetRecommendationsOpportunitiesProfile);
    }
  }, []);
  
  const changeProfile = useCallback((newProfile: GetRecommendationsOpportunitiesProfile) => {
    setProfile(newProfile);
    localStorage.setItem("dexpoky:recommendation_profile", newProfile);
  }, []);
  
  return { profile, changeProfile };
}

export function ProfileSelector({ 
  profile, 
  onChange 
}: { 
  profile: GetRecommendationsOpportunitiesProfile; 
  onChange: (p: GetRecommendationsOpportunitiesProfile) => void 
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</span>
      <Select value={profile} onValueChange={(val) => onChange(val as GetRecommendationsOpportunitiesProfile)}>
        <SelectTrigger className="h-8 w-28 text-xs bg-muted/50 border-0 rounded-md font-medium focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="collector">Collector</SelectItem>
          <SelectItem value="player">Player</SelectItem>
          <SelectItem value="seller">Seller</SelectItem>
          <SelectItem value="trader">Trader</SelectItem>
          <SelectItem value="investor">Investor</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType, color: string, bg: string, label: string, help: string }> = {
  keep: { icon: Archive, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-900", label: "Keep", help: "Hold on to this card." },
  play: { icon: Swords, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Play", help: "Use this card in a deck." },
  sell: { icon: Tag, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Sell", help: "Offer this card for money." },
  trade: { icon: ArrowRightLeft, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/30", label: "Trade", help: "Swap it with another collector." },
  grade: { icon: Award, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", label: "Grade", help: "Ask an expert to check its condition." },
  watch: { icon: Eye, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", label: "Watch", help: "Keep an eye on its value." },
};

export interface ExtendedRecommendation {
  key: string;
  action: RecommendationAction | string;
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  reasons: string[];
  informational: boolean;
  unavailable?: boolean;
  evidenceHash?: string;
  card: {
    id: number;
    name: string;
    imageUrl?: string | null;
    estimatedValue?: number | null;
    condition?: string;
  };
}

export function RecommendationCard({
  recommendation,
  onFeedback
}: {
  recommendation: ExtendedRecommendation;
  onFeedback: (key: string, type: "dismissed" | "helpful" | "not_helpful") => Promise<void>;
}) {
  const { action, score, confidence, reasons, informational, card, unavailable, key } = recommendation;
  
  // low-confidence results must read as informational
  const isLowConfidence = confidence < 0.6;
  const isInformational = informational || isLowConfidence || unavailable;
  
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.keep;
  const Icon = config.icon;

  const [loadingType, setLoadingType] = useState<string | null>(null);

  const handleFeedback = async (type: "dismissed" | "helpful" | "not_helpful") => {
    setLoadingType(type);
    try {
      await onFeedback(key, type);
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <CardUI className="shadow-sm border-border/50 relative overflow-hidden group">
      {isInformational && (
        <div className="absolute top-0 right-0 bg-muted/80 text-muted-foreground text-[9px] font-bold px-2 py-0.5 rounded-bl-lg z-10 flex items-center gap-1">
          <ShieldCheck className="h-2.5 w-2.5" /> DexPoky suggestion
        </div>
      )}
      <CardContent className="p-4 pt-5">
        <div className="flex items-start gap-4">
          <Link href={`/collection/${card.id}`}>
            <div className="relative shrink-0 cursor-pointer">
              {card.imageUrl ? (
                <img src={card.imageUrl} alt={card.name} className="w-16 h-24 object-cover rounded-md shadow-sm border" />
              ) : (
                <div className="w-16 h-24 bg-muted rounded-md flex items-center justify-center border">
                  <span className="text-[10px] text-muted-foreground text-center px-1">No Image</span>
                </div>
              )}
            </div>
          </Link>
          
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex justify-between items-start gap-2 mb-1.5">
              <div>
                <Link href={`/collection/${card.id}`}>
                  <h4 className="font-bold text-base leading-tight truncate hover:text-primary transition-colors cursor-pointer">{card.name}</h4>
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
                    {card.condition ? formatLabel(card.condition) : "Unknown"}
                  </Badge>
                  {card.estimatedValue != null && (
                    <span className="text-xs font-semibold text-primary">{formatCurrency(card.estimatedValue)}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round(score * 100)}% match · {Math.round(confidence * 100)}% sure
                  </span>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 ${config.bg} ${config.color}`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase tracking-wider">{config.label}</span>
              </div>
            </div>

            <p className="text-xs font-medium text-foreground/80 mt-2">{config.help}</p>

            <ul className="mt-2.5 space-y-1">
              {reasons.slice(0, 2).map((reason, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
                  <span className="leading-snug">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
              onClick={() => handleFeedback("helpful")}
              disabled={loadingType !== null}
            >
              {loadingType === "helpful" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsUp className="h-3 w-3 mr-1" />} Helpful
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={() => handleFeedback("not_helpful")}
              disabled={loadingType !== null}
            >
              {loadingType === "not_helpful" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsDown className="h-3 w-3 mr-1" />} Not helpful
            </Button>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => handleFeedback("dismissed")}
            disabled={loadingType !== null}
          >
            {loadingType === "dismissed" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />} Dismiss
          </Button>
        </div>
      </CardContent>
    </CardUI>
  );
}

export function OpportunitiesFeed({ limit }: { limit?: number }) {
  const { profile, changeProfile } = useRecommendationProfile();
  const queryClient = useQueryClient();
  const feedbackMutation = usePostRecommendationsKeyFeedback();
  
  const { data, isLoading, isError } = useGetRecommendationsOpportunities({ profile }, {
    query: {
      queryKey: ["recommendations", "opportunities", profile],
    }
  });

  const opportunities = data?.opportunities as ExtendedRecommendation[] | undefined;
  
  const handleFeedback = async (key: string, type: "dismissed" | "helpful" | "not_helpful") => {
    try {
      await feedbackMutation.mutateAsync({ key, data: { value: type } });
      await queryClient.invalidateQueries({ queryKey: ["recommendations", "opportunities"] });
      if (type === "helpful") toast.success("Glad that helped!");
      if (type === "dismissed") toast.success("Opportunity dismissed");
    } catch {
      toast.error("Failed to record feedback");
    }
  };

  const displayList = limit && opportunities ? opportunities.slice(0, limit) : opportunities;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          DexPoky Opportunities
        </h3>
        <ProfileSelector profile={profile} onChange={changeProfile} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        DexPoky checks your cards, decks, copies, condition, and value to find a helpful next step.
        These are suggestions. You choose what to do.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].slice(0, limit || 3).map(i => (
            <Skeleton key={i} className="h-[160px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-4 border rounded-xl bg-muted/20">
          <p className="text-sm font-medium">DexPoky judgments are unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">Your collection is still available. Try again later.</p>
        </div>
      ) : displayList && displayList.length > 0 ? (
        <div className="space-y-3">
          {displayList.map(opp => (
            <RecommendationCard 
              key={opp.key} 
              recommendation={opp} 
              onFeedback={handleFeedback} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center p-6 border-2 border-dashed rounded-xl bg-muted/20">
          <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No opportunities right now</p>
          <p className="text-xs text-muted-foreground mt-1">DexPoky will surface strong {profile} moves when the evidence supports them.</p>
        </div>
      )}
    </div>
  );
}

export function CardRecommendations({ cardId }: { cardId: number }) {
  const { profile, changeProfile } = useRecommendationProfile();
  const queryClient = useQueryClient();
  const feedbackMutation = usePostRecommendationsKeyFeedback();
  
  const { data, isLoading, isError } = useGetCardsIdRecommendations(cardId, { profile }, {
    query: {
      queryKey: ["cards", cardId, "recommendations", profile],
    }
  });

  const rawData = data as unknown as {
    recommendations?: Omit<ExtendedRecommendation, "card">[];
    card?: ExtendedRecommendation["card"];
  } | undefined;
  const rawRecommendations = rawData?.recommendations;
  
  const recommendations: ExtendedRecommendation[] | undefined = useMemo(() => {
    if (!rawRecommendations || !rawData?.card) return undefined;
    const card = rawData.card;
    return rawRecommendations.map(r => ({
      ...r,
      card,
    }));
  }, [rawRecommendations, rawData?.card]);

  const handleFeedback = async (key: string, type: "dismissed" | "helpful" | "not_helpful") => {
    try {
      await feedbackMutation.mutateAsync({ key, data: { value: type } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recommendations", "opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["cards", cardId, "recommendations"] }),
      ]);
      if (type === "helpful") toast.success("Glad that helped!");
      if (type === "dismissed") toast.success("Action dismissed");
    } catch {
      toast.error("Failed to record feedback");
    }
  };

  if (!isLoading && !isError && (!recommendations || recommendations.length === 0)) {
    return null; // hide entirely if no recommendations
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          DexPoky Card Judgment
        </h3>
        <ProfileSelector profile={profile} onChange={changeProfile} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        DexPoky scores six choices for this card. A higher match means the choice may fit your collection better.
        “Sure” shows how clear the card facts are. You always make the final choice.
      </p>

      {isLoading ? (
        <Skeleton className="h-[160px] w-full rounded-xl" />
      ) : isError ? (
        <div className="p-4 border rounded-xl bg-muted/20">
          <p className="text-sm font-medium">DexPoky judgments are unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">Card details are unaffected. Try again later.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations?.map(rec => (
            <RecommendationCard 
              key={rec.key} 
              recommendation={rec} 
              onFeedback={handleFeedback} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
