import { useState } from "react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Star, Edit3, LogOut, Save, X, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface UserProfile {
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
  raterClerkId: string;
  score: number;
  comment: string | null;
  type: string;
  createdAt: string;
}

function StarDisplay({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${iconSize} ${s <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function Profile() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", bio: "", sellerDetails: "" });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/users/me"],
    queryFn: () => fetch("/api/users/me").then(r => r.json()),
    enabled: !!user,
  });

  const { data: ratings } = useQuery<Rating[]>({
    queryKey: ["/api/ratings/me", user?.id],
    queryFn: () => fetch(`/api/ratings/user/${user!.id}`).then(r => r.json()),
    enabled: !!user?.id,
  });

  const updateProfile = useMutation({
    mutationFn: (data: Partial<UserProfile>) =>
      fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      setEditing(false);
      toast.success("Profile updated!");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const handleEdit = () => {
    setForm({
      username: profile?.username ?? "",
      bio: profile?.bio ?? "",
      sellerDetails: profile?.sellerDetails ?? "",
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateProfile.mutate(form);
  };

  if (!isLoaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Show
      when="signed-in"
      fallback={
        <Layout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <User className="h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-xl font-bold">Sign in to view your profile</h2>
            <Button onClick={() => setLocation("/sign-in")}>Sign In</Button>
          </div>
        </Layout>
      }
    >
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
            <div className="flex gap-2">
              {!editing ? (
                <Button variant="outline" onClick={handleEdit}>
                  <Edit3 className="h-4 w-4 mr-2" /> Edit
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateProfile.isPending}>
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => signOut(() => setLocation("/"))}
              >
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </div>
          </div>

          {/* Avatar + Identity */}
          <div className="bg-card border rounded-2xl p-6 mb-6 flex items-start gap-6">
            <div className="relative shrink-0">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={user.fullName ?? ""}
                  className="h-20 w-20 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-foreground">
                  {profile?.username ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Anonymous"}
                </h2>
                {profile?.ratingCount && profile.ratingCount > 0 ? (
                  <Badge variant="outline" className="flex items-center gap-1 text-amber-600 border-amber-200 bg-amber-50">
                    <Star className="h-3 w-3 fill-amber-500" />
                    {profile.ratingAverage?.toFixed(1)} ({profile.ratingCount})
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>

          {/* Bio */}
          <div className="bg-card border rounded-2xl p-6 mb-6 space-y-4">
            <h3 className="font-semibold text-foreground">About Me</h3>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Display Name</label>
                  <Input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    placeholder="Choose a username"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Bio</label>
                  <Textarea
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    placeholder="Tell buyers about yourself..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {profile?.bio ?? "No bio yet. Click Edit to add one."}
              </p>
            )}
          </div>

          {/* Seller Details */}
          <div className="bg-card border rounded-2xl p-6 mb-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Seller Contact Details</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              These details are only shown to buyers who have placed a bid on your listings.
            </p>
            {editing ? (
              <Textarea
                value={form.sellerDetails}
                onChange={e => setForm(f => ({ ...f, sellerDetails: e.target.value }))}
                placeholder="e.g. PayPal: you@email.com, preferred shipping method..."
                className="min-h-[80px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {profile?.sellerDetails ?? "No seller details set."}
              </p>
            )}
          </div>

          {/* Ratings */}
          {ratings && ratings.length > 0 && (
            <div className="bg-card border rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Ratings & Reviews</h3>
              <div className="space-y-3">
                {ratings.map(rating => (
                  <div key={rating.id} className="bg-muted/30 rounded-xl p-4 border">
                    <div className="flex items-center justify-between mb-2">
                      <StarDisplay score={rating.score} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {rating.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {rating.comment && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{rating.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Layout>
    </Show>
  );
}
