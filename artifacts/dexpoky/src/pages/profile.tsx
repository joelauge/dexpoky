import { useState, useRef } from "react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Star, Edit3, LogOut, Save, X, Shield, Camera, Loader2, Wallet, Banknote, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PayoutEntry {
  id: number;
  kind: string;
  amountCents: number;
  status: string;
  listingId: number | null;
  payoutMethod: string | null;
  payoutDestination: string | null;
  note: string | null;
  createdAt: string;
}

interface EarningsData {
  availableCents: number;
  pendingCents: number;
  lifetimeEarnedCents: number;
  lifetimePaidOutCents: number;
  payoutMethod: string | null;
  payoutDestination: string | null;
  entries: PayoutEntry[];
}

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

interface UserProfile {
  clerkId: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  sellerDetails: string | null;
  phone: string | null;
  ratingCount: number;
  ratingAverage: number | null;
  usernameChangedAt: string | null;
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
  const authFetch = useAuthFetch();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", bio: "", sellerDetails: "", phone: "" });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setAvatarUploading(true);
    try {
      await user.setProfileImage({ file });
      toast.success("Profile picture updated!");
    } catch {
      toast.error("Failed to update profile picture.");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/users/me"],
    queryFn: () => authFetch("/api/users/me").then(r => r.json()),
    enabled: !!user,
  });

  interface RatingsResponse {
    ratings: Rating[];
    ratingCount: number;
    ratingAverage: number | null;
    subConditionAvg: number | null;
    subCommunicationAvg: number | null;
    subShippingAvg: number | null;
    subValueAvg: number | null;
  }

  const { data: ratingsData } = useQuery<RatingsResponse>({
    queryKey: ["/api/ratings/me", user?.id],
    queryFn: () => fetch(`/api/ratings/user/${user!.id}`).then(r => r.json()),
    enabled: !!user?.id,
  });
  const ratings = ratingsData?.ratings;

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    queryFn: () => authFetch("/api/admin/me").then(r => r.json()),
    enabled: !!user,
  });

  const { data: earnings } = useQuery<EarningsData>({
    queryKey: ["/api/users/me/earnings"],
    queryFn: () => authFetch("/api/users/me/earnings").then(r => r.json()),
    enabled: !!user,
  });

  const [payoutForm, setPayoutForm] = useState<{ method: "paypal" | "stripe" | "bank"; destination: string }>({
    method: "paypal",
    destination: "",
  });
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");

  const savePayoutMethod = useMutation({
    mutationFn: (data: { payoutMethod: string; payoutDestination: string }) =>
      authFetch("/api/users/me/payout-method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me/earnings"] });
      setEditingPayout(false);
      toast.success("Payout method saved!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestPayout = useMutation({
    mutationFn: (amountCents: number) =>
      authFetch("/api/users/me/payouts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me/earnings"] });
      setPayoutAmount("");
      toast.success("Payout requested! We'll process it within 3 business days.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleEditPayout = () => {
    setPayoutForm({
      method: (earnings?.payoutMethod as "paypal" | "stripe" | "bank") ?? "paypal",
      destination: earnings?.payoutDestination ?? "",
    });
    setEditingPayout(true);
  };

  const handleRequestPayout = () => {
    const amt = parseFloat(payoutAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    requestPayout.mutate(Math.round(amt * 100));
  };

  const updateProfile = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      const r = await authFetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed to update profile");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      setEditing(false);
      toast.success("Profile updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleEdit = () => {
    setForm({
      username: profile?.username ?? "",
      bio: profile?.bio ?? "",
      sellerDetails: profile?.sellerDetails ?? "",
      phone: profile?.phone ?? "",
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <User className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
            </div>
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
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="group relative h-20 w-20 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Change profile picture"
              >
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName ?? ""}
                    className="h-full w-full object-cover border-2 border-primary/20 rounded-full"
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {avatarUploading
                    ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                    : <Camera className="h-5 w-5 text-white" />
                  }
                </div>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {!avatarUploading && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary border-2 border-background flex items-center justify-center pointer-events-none">
                  <Camera className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-foreground">
                  {profile?.username ?? user?.username ?? user?.firstName?.split(" ")[0] ?? user?.primaryEmailAddress?.emailAddress ?? "Anonymous"}
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
                  <label className="text-sm font-medium text-muted-foreground block mb-1">Username</label>
                  {(() => {
                    const canChange = !profile?.usernameChangedAt ||
                      Date.now() - new Date(profile.usernameChangedAt).getTime() >= 30 * 24 * 60 * 60 * 1000;
                    const nextDate = profile?.usernameChangedAt
                      ? new Date(new Date(profile.usernameChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
                      : null;
                    return (
                      <>
                        <Input
                          value={form.username}
                          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                          placeholder="your_handle"
                          disabled={!canChange}
                        />
                        {!canChange && nextDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Username can be changed again on {nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                          </p>
                        )}
                      </>
                    );
                  })()}
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
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 555 000 0000 (for DexAgent SMS alerts)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Required for DexAgent SMS approval notifications. Include country code (e.g. +1).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {profile?.bio ?? "No bio yet. Click Edit to add one."}
                </p>
                {profile?.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{profile.phone}</span>
                  </div>
                )}
              </div>
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

          {adminCheck?.isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-amber-900">Admin Tools</div>
                <p className="text-xs text-amber-800/80">Process pending seller payout requests.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin/payouts")}>
                Open payouts
              </Button>
            </div>
          )}

          {/* Earnings & Payouts */}
          <div className="bg-card border rounded-2xl p-6 mb-6 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Earnings & Payouts</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/20">
                <div className="text-xs text-muted-foreground">Available</div>
                <div className="text-lg font-bold text-primary">{fmtUsd(earnings?.availableCents ?? 0)}</div>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border">
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="text-lg font-bold">{fmtUsd(earnings?.pendingCents ?? 0)}</div>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border">
                <div className="text-xs text-muted-foreground">Lifetime earned</div>
                <div className="text-lg font-bold">{fmtUsd(earnings?.lifetimeEarnedCents ?? 0)}</div>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border">
                <div className="text-xs text-muted-foreground">Paid out</div>
                <div className="text-lg font-bold">{fmtUsd(earnings?.lifetimePaidOutCents ?? 0)}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              You earn 90% of each sale (10% platform fee). Funds become available as soon as a buyer's payment is captured.
            </p>

            {/* Payout method */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Payout method</span>
                </div>
                {!editingPayout ? (
                  <Button variant="outline" size="sm" onClick={handleEditPayout}>
                    <Edit3 className="h-3 w-3 mr-1" />
                    {earnings?.payoutMethod ? "Change" : "Add"}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingPayout(false)}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => savePayoutMethod.mutate({ payoutMethod: payoutForm.method, payoutDestination: payoutForm.destination })}
                      disabled={savePayoutMethod.isPending || payoutForm.destination.length < 3}
                    >
                      {savePayoutMethod.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                )}
              </div>
              {editingPayout ? (
                <div className="space-y-3">
                  <Select value={payoutForm.method} onValueChange={(v) => setPayoutForm(f => ({ ...f, method: v as "paypal" | "stripe" | "bank" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="stripe">Stripe (email)</SelectItem>
                      <SelectItem value="bank">Bank / Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={payoutForm.destination}
                    onChange={e => setPayoutForm(f => ({ ...f, destination: e.target.value }))}
                    placeholder={
                      payoutForm.method === "paypal"
                        ? "you@paypal.com"
                        : payoutForm.method === "stripe"
                        ? "Stripe account email"
                        : "Bank details / Venmo / Zelle / etc."
                    }
                  />
                </div>
              ) : earnings?.payoutMethod ? (
                <div className="text-sm">
                  <Badge variant="outline" className="mr-2 capitalize">{earnings.payoutMethod}</Badge>
                  <span className="text-muted-foreground">{earnings.payoutDestination}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payout method set. Add one to withdraw your earnings.</p>
              )}
            </div>

            {/* Request payout */}
            {earnings?.payoutMethod && (earnings?.availableCents ?? 0) > 0 && (
              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <div className="font-medium text-sm">Request a payout</div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={`Up to $${((earnings?.availableCents ?? 0) / 100).toFixed(2)}`}
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(e.target.value)}
                  />
                  <Button onClick={handleRequestPayout} disabled={requestPayout.isPending}>
                    {requestPayout.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Request
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Payouts are processed manually within 3 business days to your saved {earnings.payoutMethod} account.
                </p>
              </div>
            )}

            {/* History */}
            {earnings && (earnings.entries?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm">History</div>
                <div className="divide-y rounded-xl border bg-muted/10 overflow-hidden">
                  {earnings.entries!.slice(0, 10).map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{e.note ?? e.kind}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.createdAt).toLocaleDateString()} · <span className="capitalize">{e.status}</span>
                        </div>
                      </div>
                      <div className={`font-mono font-semibold ${e.kind === "sale_credit" || e.kind === "trade_credit" ? "text-emerald-600" : "text-amber-600"}`}>
                        {e.kind === "sale_credit" || e.kind === "trade_credit" ? "+" : "−"}{fmtUsd(e.amountCents)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

        {/* Footer links */}
        <div className="flex items-center justify-center gap-3 pt-2 pb-1 text-xs text-muted-foreground/70">
          <a href="/support" className="hover:text-muted-foreground transition-colors">Support</a>
          <span>·</span>
          <a href="/terms-of-service" className="hover:text-muted-foreground transition-colors">Terms</a>
          <span>·</span>
          <a href="/privacy-policy" className="hover:text-muted-foreground transition-colors">Privacy</a>
          <span>·</span>
          <a href="mailto:support@dexpoky.com" className="hover:text-muted-foreground transition-colors">support@dexpoky.com</a>
        </div>
      </Layout>
    </Show>
  );
}
