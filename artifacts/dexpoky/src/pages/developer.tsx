import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Code2,
  Copy,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  KeyRound,
  BookOpen,
  Terminal,
  Zap,
  Shield,
  Globe,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ApiKeyEntry {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  key?: string;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(c => (c === id ? null : c)), 2000);
    });
  };
  return { copy, copied };
}

function CodeBlock({ code, lang = "ts" }: { code: string; lang?: string }) {
  const { copy, copied } = useCopy();
  return (
    <div className="relative group rounded-xl border bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <span className="text-[11px] font-mono text-slate-400">{lang}</span>
        <button
          onClick={() => copy(code, code.slice(0, 10))}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors"
        >
          {copied === code.slice(0, 10) ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /><span className="text-green-400">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" />Copy</>
          )}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-100 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-5 space-y-4 border-t">{children}</div>}
    </div>
  );
}

export default function DeveloperPage() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const { copy, copied } = useCopy();

  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Record<number, boolean>>({});

  const { data: keys = [], isLoading } = useQuery<ApiKeyEntry[]>({
    queryKey: ["/api/developer/keys"],
    queryFn: () => authFetch("/api/developer/keys").then(r => r.json()),
  });

  const createKey = useMutation({
    mutationFn: (name: string) =>
      authFetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Default" }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
        return r.json() as Promise<ApiKeyEntry>;
      }),
    onSuccess: (created) => {
      qc.setQueryData<ApiKeyEntry[]>(["/api/developer/keys"], prev =>
        [...(prev ?? []).filter(k => k.id !== created.id), created]
      );
      setRevealedKeys(prev => ({ ...prev, [created.id]: true }));
      setNewKeyName("");
      toast.success("API key created — copy it now, it won't be shown again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/developer/keys/${id}`, { method: "DELETE" }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
        return r.json() as Promise<ApiKeyEntry>;
      }),
    onSuccess: (updated) => {
      qc.setQueryData<ApiKeyEntry[]>(["/api/developer/keys"], prev =>
        (prev ?? []).map(k => k.id === updated.id ? updated : k)
      );
      toast.success("API key revoked.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeKeys = keys.filter(k => !k.revokedAt);
  const revokedKeys = keys.filter(k => k.revokedAt);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DexPoky API</h1>
              <p className="text-sm text-muted-foreground">Manage API keys and explore the SDK</p>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> API Keys
            </h2>
            <span className="text-xs text-muted-foreground">{activeKeys.length}/5 active</span>
          </div>

          {/* Create */}
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g. My Script)"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && activeKeys.length < 5) createKey.mutate(newKeyName); }}
              className="max-w-xs"
              maxLength={64}
            />
            <Button
              onClick={() => createKey.mutate(newKeyName)}
              disabled={createKey.isPending || activeKeys.length >= 5}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {createKey.isPending ? "Creating…" : "Create Key"}
            </Button>
          </div>

          {/* Active keys */}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeKeys.map(k => (
                <div key={k.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{k.name}</span>
                        <Badge variant="secondary" className="text-[10px] font-mono">Active</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {format(new Date(k.createdAt), "MMM d, yyyy")}
                        {k.lastUsedAt && ` · Last used ${format(new Date(k.lastUsedAt), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke "{k.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This immediately invalidates the key. Any scripts using it will stop working. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeKey.mutate(k.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Revoke key
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {/* Key display */}
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-3 py-2">
                    <code className="flex-1 text-xs font-mono truncate text-foreground">
                      {k.key
                        ? (revealedKeys[k.id] ? k.key : `${k.keyPrefix}${"•".repeat(52)}`)
                        : `${k.keyPrefix}${"•".repeat(52)}`
                      }
                    </code>
                    {k.key && (
                      <button
                        onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {revealedKeys[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {k.key && revealedKeys[k.id] && (
                      <button
                        onClick={() => copy(k.key!, `key-${k.id}`)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {copied === `key-${k.id}` ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {k.key && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Shield className="h-3 w-3 shrink-0" />
                      Copy this key now — it will not be shown again after you leave this page.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Revoked keys (collapsed) */}
          {revokedKeys.length > 0 && (
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
                <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? "s" : ""}
              </summary>
              <div className="mt-2 space-y-2">
                {revokedKeys.map(k => (
                  <div key={k.id} className="rounded-xl border bg-muted/20 p-4 opacity-60">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm line-through">{k.name}</span>
                      <Badge variant="outline" className="text-[10px]">Revoked</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <code className="font-mono">{k.keyPrefix}…</code>
                      {" · "}Revoked {k.revokedAt ? format(new Date(k.revokedAt), "MMM d, yyyy") : ""}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* SDK Documentation */}
        <div className="space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> SDK Documentation
          </h2>

          <Section title="Quick Start" icon={Zap} defaultOpen>
            <p className="text-sm text-muted-foreground">Install the SDK and make your first call in under a minute.</p>
            <CodeBlock lang="bash" code={`# The SDK ships as part of the DexPoky monorepo\n# Available at @workspace/api-sdk`} />
            <CodeBlock code={`import { DexPokyClient } from "@workspace/api-sdk";

const client = new DexPokyClient({
  baseUrl: "https://your-app.replit.app",  // omit in browser
  getToken: () => "YOUR_API_KEY",          // dpx_… key from above
});

// Fetch marketplace listings
const listings = await client.marketplace.list({ search: "charizard" });

// Get a card
const card = await client.cards.get(42);

// List your decks
const decks = await client.decks.list();`} />
          </Section>

          <Section title="Authentication" icon={Shield}>
            <p className="text-sm text-muted-foreground">Pass your API key as a bearer token. All authenticated endpoints require it.</p>
            <CodeBlock lang="http" code={`Authorization: Bearer dpx_your_key_here`} />
            <CodeBlock code={`const client = new DexPokyClient({
  baseUrl: "https://your-app.replit.app",
  getToken: () => process.env.DEXPOKY_API_KEY ?? null,
});`} />
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Keep your key secret.</strong> Never commit it to version control or expose it in client-side code.
                Use environment variables instead.
              </p>
            </div>
          </Section>

          <Section title="Cards" icon={Terminal}>
            <p className="text-sm text-muted-foreground">Manage your Pokémon card collection.</p>
            <CodeBlock code={`// List your collection (with optional filters)
const all = await client.cards.list();
const holoRares = await client.cards.list({ rarity: "holo_rare" });
const forSale = await client.cards.list({ forSale: true, search: "pikachu" });

// Get a single card
const card = await client.cards.get(42);

// Add a card
const newCard = await client.cards.create({
  name: "Charizard VMAX",
  pokemonName: "Charizard",
  setName: "Champion's Path",
  rarity: "ultra_rare",
  condition: "near_mint",
  forSale: false,
  estimatedValue: 250,
});

// Update a card
await client.cards.update(42, { forSale: true, listingPrice: 220 });

// Delete a card
await client.cards.delete(42);`} />
          </Section>

          <Section title="Marketplace" icon={Globe}>
            <p className="text-sm text-muted-foreground">Browse and manage marketplace listings.</p>
            <CodeBlock code={`// Browse active listings
const listings = await client.marketplace.list({ search: "charizard" });
const cheap = await client.marketplace.list({ maxPrice: 50 });

// Get a single listing
const listing = await client.marketplace.get(10);

// Create a listing
const newListing = await client.marketplace.create({
  cardId: 42,
  price: 220,
  description: "Near mint, pulled from Champion's Path booster",
});

// Update a listing
await client.marketplace.update(10, { price: 200 });

// Cancel a listing
await client.marketplace.update(10, { status: "cancelled" });`} />
          </Section>

          <Section title="Decks" icon={BookOpen}>
            <p className="text-sm text-muted-foreground">Build and manage TCG decks. Use the AI suggest endpoint to build a deck from your collection.</p>
            <CodeBlock code={`// List your decks
const decks = await client.decks.list();

// Create a deck
const deck = await client.decks.create({
  name: "Charizard Aggro",
  gameStyle: "aggro",
  strategy: "Fast energy ramp into Charizard V",
});

// Get a deck with all its cards
const full = await client.decks.get(deck.id);

// Add a card to the deck
await client.decks.addCard(deck.id, { cardId: 42, count: 2, role: "attacker" });

// AI deck suggestion from your collection
const suggestion = await client.decks.suggest({
  gameStyle: "control",
  notes: "Focus on water types",
});
console.log(suggestion.cards); // SuggestedDeckCard[]`} />
          </Section>

          <Section title="Trades & Wallet" icon={Zap}>
            <p className="text-sm text-muted-foreground">Check wallet balance and manage trade offers.</p>
            <CodeBlock code={`// Wallet balance
const { balanceCents } = await client.wallet.getBalance();
console.log(\`Balance: $\${(balanceCents / 100).toFixed(2)}\`);

// List your trade offer threads
const threads = await client.messages.listThreads();

// Get a trade offer in a thread
const offer = await client.trades.getOffer(threadId);

// Counter or accept
await client.trades.updateOffer(threadId, {
  action: "counter",
  amount: 18000, // $180.00 in cents
});`} />
          </Section>

          <Section title="Ratings" icon={Shield}>
            <p className="text-sm text-muted-foreground">Read seller feedback and reply to ratings.</p>
            <CodeBlock code={`// Get ratings for a seller
const { ratings, ratingAverage } = await client.ratings.listForUser(
  "user_clerk_id_here",
  { role: "seller", period: "12m" }
);

// Reply to a rating you received
await client.ratings.reply(ratingId, "Thanks for the smooth trade!");`} />
          </Section>

          <Section title="Catalog & Wishlist" icon={BookOpen}>
            <p className="text-sm text-muted-foreground">Search the Pokémon TCG catalog and manage your wishlist.</p>
            <CodeBlock code={`// Search the card catalog
const results = await client.catalog.search({ q: "Charizard", limit: 10 });

// Get full pricing for a catalog card
const detail = await client.catalog.getCard("swsh35-74");
console.log(detail.pricing.marketPrice);

// Add to wishlist
await client.wishlist.add({
  catalogCardId: "swsh35-74",
  priority: "high",
  notes: "Looking for NM copy",
});

// List your wishlist
const wishlist = await client.wishlist.list();`} />
          </Section>

          <Section title="Error Handling" icon={Terminal}>
            <p className="text-sm text-muted-foreground">All methods throw an <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">ApiError</code> on non-2xx responses.</p>
            <CodeBlock code={`import { DexPokyClient, ApiError } from "@workspace/api-sdk";

const client = new DexPokyClient({ /* … */ });

try {
  const card = await client.cards.get(99999);
} catch (err) {
  if (err instanceof ApiError) {
    console.error(err.status);     // e.g. 404
    console.error(err.message);    // "HTTP 404 Not Found"
    console.error(err.data);       // parsed response body
  }
}`} />
          </Section>

          <Section title="TypeScript Types" icon={Code2}>
            <p className="text-sm text-muted-foreground">
              All types are exported from <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@workspace/api-sdk</code>.
            </p>
            <CodeBlock code={`import type {
  Card,
  CreateCardBody,
  Listing,
  DeckSummary,
  DeckWithCards,
  SuggestDeckResponse,
  WantedListing,
  WishlistItem,
  CatalogCardDetail,
  TradeOffer,
  WalletBalance,
  UserProfile,
  RatingEntry,
  ApiError,
} from "@workspace/api-sdk";`} />
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                The SDK is fully tree-shakeable. Import only what you need and your bundler will strip the rest.
              </p>
            </div>
          </Section>
        </div>

        {/* Base URL reference */}
        <div className="rounded-xl border bg-muted/20 p-5 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Base URL
          </h3>
          <p className="text-sm text-muted-foreground">
            All API routes are served under <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/api</code>.
            When calling from outside the browser (Node.js, scripts, CI), set <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">baseUrl</code> to your deployed app domain.
          </p>
          <CodeBlock lang="env" code={`DEXPOKY_BASE_URL=https://your-app.replit.app\nDEXPOKY_API_KEY=dpx_your_key_here`} />
        </div>
      </div>
    </Layout>
  );
}
