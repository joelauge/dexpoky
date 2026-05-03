import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Star } from "lucide-react";

interface PublicUser {
  clerkId: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  sellerDetails: string | null;
  ratingCount: number;
  ratingAverage: number | null;
}

interface Rating {
  id: number;
  score: number;
  comment: string | null;
  type: string;
  createdAt: string;
}

function StarDisplay({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${s <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function SellerProfile() {
  const [, params] = useRoute("/seller/:clerkId");
  const clerkId = params?.clerkId ?? "";
  const [, setLocation] = useLocation();

  const { data: profile, isLoading } = useQuery<PublicUser>({
    queryKey: ["/api/users", clerkId],
    queryFn: () => fetch(`/api/users/${clerkId}`).then(r => r.json()),
    enabled: !!clerkId,
  });

  const { data: ratings } = useQuery<Rating[]>({
    queryKey: ["/api/ratings/user", clerkId],
    queryFn: () => fetch(`/api/ratings/user/${clerkId}`).then(r => r.json()),
    enabled: !!clerkId,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-muted-foreground">Loading seller profile...</div>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-4">Seller not found</h2>
          <Button onClick={() => setLocation("/marketplace")}>Back to Marketplace</Button>
        </div>
      </Layout>
    );
  }

  const displayName = profile.username ?? "Anonymous Seller";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <Button
          variant="ghost"
          onClick={() => setLocation("/marketplace")}
          className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace
        </Button>

        {/* Profile Card */}
        <div className="bg-card border rounded-2xl p-6 mb-6 flex items-start gap-5">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={displayName}
              className="h-20 w-20 rounded-full object-cover border-2 border-border shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-8 w-8 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground mb-1">{displayName}</h1>
            {profile.ratingCount > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <StarDisplay score={Math.round(profile.ratingAverage ?? 0)} />
                <span className="text-sm text-muted-foreground">
                  {profile.ratingAverage?.toFixed(1)} out of 5 ({profile.ratingCount} review{profile.ratingCount !== 1 ? "s" : ""})
                </span>
              </div>
            )}
            {profile.ratingCount === 0 && (
              <p className="text-sm text-muted-foreground mb-2">No reviews yet</p>
            )}
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="bg-card border rounded-2xl p-6 mb-6">
            <h3 className="font-semibold mb-2">About this Seller</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* Seller Contact (only shown if buyer has bid) */}
        {profile.sellerDetails && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold mb-2 text-primary">Seller Contact Details</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{profile.sellerDetails}</p>
          </div>
        )}

        {/* Reviews */}
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-semibold mb-4">Reviews ({ratings?.length ?? 0})</h3>
          {ratings && ratings.length > 0 ? (
            <div className="space-y-3">
              {ratings.map(rating => (
                <div key={rating.id} className="bg-muted/30 rounded-xl p-4 border">
                  <div className="flex items-center justify-between mb-2">
                    <StarDisplay score={rating.score} />
                    <Badge variant="outline" className="text-xs capitalize">
                      {rating.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {rating.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{rating.comment}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No reviews yet.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
