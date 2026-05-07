import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Star, User, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const LEVEL_STYLES: Record<string, string> = {
  "New": "bg-slate-100 text-slate-600 border-slate-200",
  "Bronze": "bg-amber-50 text-amber-700 border-amber-200",
  "Silver": "bg-slate-100 text-slate-500 border-slate-300",
  "Gold": "bg-yellow-50 text-yellow-700 border-yellow-300",
  "Platinum": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Top Rated": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface PublicUser {
  clerkId: string;
  username: string | null;
  avatarUrl: string | null;
  ratingCount: number;
  ratingAverage: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number | null;
  sellerLevel: string;
}

interface RatingEntry {
  id: number;
  score: number;
  comment: string | null;
  type: string;
  listingId: number | null;
  tradeOfferId: number | null;
  createdAt: string;
  subCondition: number | null;
  subCommunication: number | null;
  subShipping: number | null;
  subValue: number | null;
  raterUsername: string | null;
  raterAvatarUrl: string | null;
}

interface RatingsResponse {
  ratings: RatingEntry[];
  total: number;
  page: number;
  pageSize: number;
  ratingCount: number;
  ratingAverage: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number | null;
  sellerLevel: string;
}

type Role = "all" | "seller" | "buyer";
type Period = "all" | "1m" | "6m" | "12m";

function StarDisplay({ score, size = "sm" }: { score: number; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`${cls} ${s <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25"}`} />
      ))}
    </div>
  );
}

function SubScoreMini({ label, score }: { label: string; score: number | null }) {
  if (!score) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground min-w-0">{label}</span>
      <StarDisplay score={score} size="xs" />
    </div>
  );
}

export default function FeedbackPage() {
  const [, params] = useRoute("/feedback/:clerkId");
  const clerkId = params?.clerkId ?? "";
  const [, setLocation] = useLocation();

  const [role, setRole] = useState<Role>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [role, period]);

  const { data: profile, isLoading: profileLoading } = useQuery<PublicUser>({
    queryKey: ["/api/users", clerkId],
    queryFn: () => fetch(`/api/users/${clerkId}`).then(r => r.json()),
    enabled: !!clerkId,
  });

  const { data: ratingsData, isLoading: ratingsLoading } = useQuery<RatingsResponse>({
    queryKey: ["/api/ratings/user", clerkId, role, period, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (role !== "all") params.set("role", role);
      if (period !== "all") params.set("period", period);
      return fetch(`/api/ratings/user/${clerkId}?${params}`).then(r => r.json());
    },
    enabled: !!clerkId,
  });

  if (profileLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-muted-foreground">Loading feedback...</div>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-4">User not found</h2>
          <Button onClick={() => setLocation("/marketplace")}>Back to Marketplace</Button>
        </div>
      </Layout>
    );
  }

  const displayName = profile.username ?? "Anonymous";
  const totalPages = ratingsData ? Math.ceil(ratingsData.total / ratingsData.pageSize) : 1;
  const levelStyle = LEVEL_STYLES[profile.sellerLevel] ?? LEVEL_STYLES["New"];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <Button
          variant="ghost"
          onClick={() => setLocation(`/seller/${clerkId}`)}
          className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Seller Profile
        </Button>

        {/* Header */}
        <div className="bg-card border rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                className="h-16 w-16 rounded-full object-cover border-2 border-border shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-7 w-7 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground mb-1">{displayName}'s Feedback</h1>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${levelStyle}`}>
                  {profile.sellerLevel}
                </span>
                {profile.positivePercent !== null && profile.ratingCount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {profile.positivePercent.toFixed(1)}% positive
                  </span>
                )}
              </div>
              {profile.ratingCount > 0 && profile.ratingAverage !== null && (
                <div className="flex items-center gap-2 mb-2">
                  <StarDisplay score={Math.round(profile.ratingAverage)} />
                  <span className="text-sm font-semibold">{profile.ratingAverage.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">
                    ({profile.ratingCount} rating{profile.ratingCount !== 1 ? "s" : ""})
                  </span>
                </div>
              )}
              {profile.ratingCount === 0 && (
                <p className="text-sm text-muted-foreground mb-2">No ratings yet.</p>
              )}
              {profile.ratingCount > 0 ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <div className="text-lg font-black text-emerald-700">{profile.positiveCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Positive</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <div className="text-lg font-black text-amber-700">{profile.neutralCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Neutral</div>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <div className="text-lg font-black text-red-700">{profile.negativeCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Negative</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No feedback yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex rounded-xl border overflow-hidden text-sm font-medium">
            {(["all", "seller", "buyer"] as Role[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 transition-colors ${role === r ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-muted/40"}`}
              >
                {r === "all" ? "All" : r === "seller" ? "As Seller" : "As Buyer"}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border overflow-hidden text-sm font-medium">
            {(["1m", "6m", "12m", "all"] as Period[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 transition-colors ${period === p ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-muted/40"}`}
              >
                {p === "1m" ? "1 mo" : p === "6m" ? "6 mo" : p === "12m" ? "12 mo" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {/* Ratings count */}
        {ratingsData && (
          <p className="text-xs text-muted-foreground mb-4">
            {ratingsData.total} feedback {ratingsData.total === 1 ? "entry" : "entries"}
            {role !== "all" ? ` (${role === "seller" ? "as seller" : "as buyer"})` : ""}
          </p>
        )}

        {/* Rating Cards */}
        {ratingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border rounded-2xl p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : ratingsData && ratingsData.ratings.length > 0 ? (
          <div className="space-y-3">
            {ratingsData.ratings.map(rating => {
              const txLabel = rating.tradeOfferId ? "Trade" : "Marketplace";
              const scoreColor = rating.score >= 4 ? "text-emerald-600" : rating.score === 3 ? "text-amber-600" : "text-red-600";
              const hasSubScores = rating.subCondition || rating.subCommunication || rating.subShipping || rating.subValue;
              return (
                <div key={rating.id} className="bg-card border rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {rating.raterAvatarUrl ? (
                        <img
                          src={rating.raterAvatarUrl}
                          alt={rating.raterUsername ?? "Rater"}
                          className="h-8 w-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{rating.raterUsername ?? "Anonymous"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(rating.createdAt))} ago
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] capitalize">{txLabel}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {rating.type === "buyer_to_seller" ? "Seller" : "Buyer"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <StarDisplay score={rating.score} />
                    <span className={`text-xs font-bold ${scoreColor}`}>
                      {rating.score >= 4 ? "Positive" : rating.score === 3 ? "Neutral" : "Negative"}
                    </span>
                  </div>

                  {rating.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">{rating.comment}</p>
                  )}

                  {hasSubScores && (
                    <div className="grid grid-cols-2 gap-1 mt-2 pt-2 border-t">
                      <SubScoreMini label="Condition" score={rating.subCondition} />
                      <SubScoreMini label="Communication" score={rating.subCommunication} />
                      <SubScoreMini label="Shipping" score={rating.subShipping} />
                      <SubScoreMini label="Value" score={rating.subValue} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-card border rounded-2xl">
            <Star className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No feedback found for this filter.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
