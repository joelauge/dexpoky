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
  PackageOpen,
  ArrowLeftRight,
  Star,
  Library,
  Heart,
  AlertCircle,
  Layers,
  Mail,
  Link2,
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
  const id = code.slice(0, 20);
  return (
    <div className="relative rounded-xl border bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <span className="text-[11px] font-mono text-slate-400">{lang}</span>
        <button
          onClick={() => copy(code, id)}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors"
        >
          {copied === id ? (
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

function Callout({ variant = "info", children }: {
  variant?: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300",
    tip: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300",
  };
  const icons = {
    info: AlertCircle,
    warning: AlertCircle,
    tip: CheckCircle2,
  };
  const Icon = icons[variant];
  return (
    <div className={cn("rounded-lg border p-3.5 flex gap-2.5", styles[variant])}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
}

function Section({ title, icon: Icon, subtitle, children, defaultOpen = false }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1.5" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1.5" />}
      </button>
      {open && <div className="p-5 space-y-5 border-t bg-background">{children}</div>}
    </div>
  );
}

function Narrative({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>;
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
      <div className="w-full px-6 py-8 space-y-10">

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DexPoky API</h1>
              <p className="text-sm text-muted-foreground">Build scripts, bots, and integrations on top of your collection</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            The DexPoky SDK gives you programmatic access to everything in your account — your cards, listings, trades, decks, wallet, and more.
            Use it to automate pricing updates, back up your collection, build a Discord bot, or pipe your data into a spreadsheet.
            It works in Node.js, the browser, and React Native, with full TypeScript types throughout.
          </p>
        </div>

        {/* API Keys */}
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> Your API Keys
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Each key authenticates you with the API. Give keys descriptive names so you remember where they're used —
              for example <em>"Price checker script"</em> or <em>"Discord bot"</em>.
              You can have up to 5 active keys and revoke any of them instantly if they're ever compromised.
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder='Key name — e.g. "My price bot"'
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

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No API keys yet. Create one above to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeKeys.map(k => (
                <div key={k.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{k.name}</span>
                        <Badge variant="secondary" className="text-[10px] font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Active</Badge>
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
                            This immediately invalidates the key. Any script or integration using it will stop working.
                            This action cannot be undone — you'd need to create a new key and update your code.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep key</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeKey.mutate(k.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Yes, revoke it
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

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
                        title={revealedKeys[k.id] ? "Hide key" : "Reveal key"}
                      >
                        {revealedKeys[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {k.key && revealedKeys[k.id] && (
                      <button
                        onClick={() => copy(k.key!, `key-${k.id}`)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Copy to clipboard"
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
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Shield className="h-3 w-3 shrink-0" />
                      Copy this key now — for security it won't be shown again after you navigate away.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

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

        {/* SDK Docs */}
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> SDK Guide
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click any section to expand it. Start with <strong>Quick Start</strong> if you're new.
            </p>
          </div>

          {/* Quick Start */}
          <Section
            title="Quick Start"
            icon={Zap}
            subtitle="Get from zero to your first API call in under two minutes"
            defaultOpen
          >
            <Narrative>
              The SDK is a single import. Point it at your DexPoky instance, hand it your API key,
              and every resource in your account is immediately available as a typed method call.
              There are no webhooks to configure and no OAuth dance to complete — your key is all you need.
            </Narrative>
            <CodeBlock code={`import { DexPokyClient } from "@workspace/api-sdk";

const client = new DexPokyClient({
  baseUrl: "https://your-app.replit.app", // omit this when running in the browser
  getToken: () => process.env.DEXPOKY_API_KEY,
});

// That's it. Start exploring your data.
const listings = await client.marketplace.list({ search: "charizard" });
console.log(\`Found \${listings.length} Charizard listings\`);

const card = await client.cards.get(42);
console.log(\`\${card.name} is worth ~$\${card.estimatedValue}\`);`} />
            <Callout variant="tip">
              Running inside the DexPoky web app itself? You can omit <code>baseUrl</code> and <code>getToken</code> entirely —
              the browser's existing session cookie handles authentication automatically.
            </Callout>
          </Section>

          {/* Authentication */}
          <Section
            title="Authentication"
            icon={Shield}
            subtitle="How your API key is sent and how to keep it safe"
          >
            <Narrative>
              Every request your code makes to DexPoky carries your API key as a standard bearer token in the
              HTTP <code>Authorization</code> header. The SDK handles this automatically once you pass your key to
              the constructor — you never need to think about headers yourself.
            </Narrative>
            <Narrative>
              The most important rule: your API key is a secret. Anyone who has it can read and modify your
              account data just like you can. Never paste it directly into your code or commit it to a git
              repository. Instead, put it in an environment variable and load it at runtime.
            </Narrative>
            <CodeBlock lang="env" code={`# .env  (add this file to .gitignore!)
DEXPOKY_API_KEY=dpx_your_key_here
DEXPOKY_BASE_URL=https://your-app.replit.app`} />
            <CodeBlock code={`const client = new DexPokyClient({
  baseUrl: process.env.DEXPOKY_BASE_URL,
  getToken: () => process.env.DEXPOKY_API_KEY ?? null,
});`} />
            <Callout variant="warning">
              If a key is ever exposed — accidentally logged, committed to git, or shared — revoke it immediately
              from this page and create a fresh one. Revocation takes effect instantly.
            </Callout>
          </Section>

          {/* Cards */}
          <Section
            title="Cards — Your Collection"
            icon={Layers}
            subtitle="Read, add, edit, and remove cards from your collection programmatically"
          >
            <Narrative>
              Cards are the heart of DexPoky. The <code>client.cards</code> namespace gives you complete control
              over your collection: list everything you own, apply filters to find specific cards,
              add new cards as you pull them from packs, update details like condition or estimated value,
              and remove cards you've sold or traded away.
            </Narrative>
            <Narrative>
              The list endpoint accepts several filters you can combine freely. For example, you could
              pull every holo rare you currently have for sale, or search for any card with "Pikachu"
              in its name across your entire collection.
            </Narrative>
            <CodeBlock code={`// Browse your whole collection
const all = await client.cards.list();

// Filter to just holos currently listed for sale
const holosForSale = await client.cards.list({
  rarity: "holo_rare",
  forSale: true,
});

// Full-text search
const pikachus = await client.cards.list({ search: "pikachu" });

// Add a card you just pulled
const newCard = await client.cards.create({
  name: "Charizard VMAX",
  pokemonName: "Charizard",
  setName: "Champion's Path",
  cardNumber: "074/073",
  rarity: "ultra_rare",
  condition: "near_mint",
  forSale: false,
  estimatedValue: 250,
});

// Update it when condition changes or you decide to sell
await client.cards.update(newCard.id, {
  forSale: true,
  listingPrice: 220,
  notes: "Light crease on back-bottom corner",
});

// Remove a card from your collection
await client.cards.delete(newCard.id);`} />
            <Callout variant="tip">
              Pair the list endpoint with the catalog search (below) to automatically fill in
              <code>estimatedValue</code> from live market prices when you add a new card.
            </Callout>
          </Section>

          {/* Marketplace */}
          <Section
            title="Marketplace — Listings"
            icon={PackageOpen}
            subtitle="Browse all listings, create your own, and manage their status"
          >
            <Narrative>
              The marketplace is where DexPoky users buy and sell cards. Through the SDK you can browse
              every active listing — great for building a price alert, a Discord feed of new listings,
              or a bulk pricing tool. You can also create and manage your own listings without touching
              the web UI.
            </Narrative>
            <Narrative>
              Listings have a lifecycle: they start as <strong>active</strong>, move to <strong>sold</strong>
              when a buyer pays, or <strong>cancelled</strong> if you pull them. You can update any of these fields
              after creation.
            </Narrative>
            <CodeBlock code={`// Browse what's available — great for price monitoring
const listings = await client.marketplace.list();
const cheapCards = await client.marketplace.list({ maxPrice: 25 });
const charizards = await client.marketplace.list({ search: "charizard" });

// Get every detail about one listing
const listing = await client.marketplace.get(10);
console.log(\`\${listing.card.name} — \$\${listing.price} — \${listing.viewCount} views\`);

// Create a listing for a card in your collection
const myListing = await client.marketplace.create({
  cardId: 42,
  price: 220,
  description: "Pulled from Champion's Path, stored in a sleeve since day one.",
});

// Drop the price
await client.marketplace.update(myListing.id, { price: 199 });

// Cancel if you change your mind
await client.marketplace.update(myListing.id, { status: "cancelled" });`} />
          </Section>

          {/* Decks */}
          <Section
            title="Decks — Building & AI Suggestions"
            icon={Library}
            subtitle="Manage your TCG decks and let AI suggest builds from cards you own"
          >
            <Narrative>
              The decks namespace covers everything from creating a new deck shell to adding individual
              cards and tweaking counts. Each card in a deck carries a <code>role</code> (attacker, supporter,
              energy…) and a <code>count</code>, so you have the full structure of a proper TCG deck.
            </Narrative>
            <Narrative>
              The most powerful endpoint here is <code>client.decks.suggest()</code>. Give it a game style
              and optional notes, and the AI will design a complete 60-card deck using cards you actually own,
              pulling from your wishlist when your collection has gaps. Each suggested card comes back with
              a <code>reason</code> explaining why it was chosen — perfect for learning or just settling on
              a build quickly.
            </Narrative>
            <CodeBlock code={`// See all your decks at a glance
const decks = await client.decks.list();
decks.forEach(d => console.log(\`\${d.name} — \${d.totalCount} cards\`));

// Create a new deck shell
const deck = await client.decks.create({
  name: "Charizard Aggro",
  gameStyle: "aggro",
  strategy: "Fast energy ramp, swing hard with Charizard V by turn 3",
});

// Retrieve a deck with its full card list
const full = await client.decks.get(deck.id);
full.cards.forEach(c => console.log(\`\${c.snapshotName} x\${c.count} (\${c.role})\`));

// Add a card to the deck
await client.decks.addCard(deck.id, {
  cardId: 42,
  count: 3,
  role: "attacker",
  notes: "Primary win condition",
});

// Remove a card
await client.decks.removeCard(deck.id, cardId);

// Ask the AI to build a deck from your collection
const suggestion = await client.decks.suggest({
  gameStyle: "control",
  notes: "Prefer water types, focus on chip damage and disruption",
});

suggestion.cards.forEach(card => {
  console.log(\`\${card.name} x\${card.count} [\${card.source}] — \${card.reason}\`);
  // source is "owned", "wishlist", "catalog", or "shopping"
});`} />
            <Callout variant="info">
              The <code>source</code> field on each suggested card tells you whether you already own it,
              it's on your wishlist, or you'd need to go acquire it. Use this to quickly spot the gaps
              before committing to a build.
            </Callout>
          </Section>

          {/* Trades & Wallet */}
          <Section
            title="Trades & Wallet"
            icon={ArrowLeftRight}
            subtitle="Check balances, monitor trade negotiations, and process payments"
          >
            <Narrative>
              DexPoky's P2P trading system lives inside message threads. When two users agree to trade,
              they negotiate an offer inside a thread — countering, accepting, and eventually settling on
              a price and exchange method. The SDK surfaces all of this so you can monitor or automate
              parts of your trading workflow.
            </Narrative>
            <Narrative>
              Your wallet balance is tracked in cents to avoid floating-point issues. Use
              <code>client.wallet.getBalance()</code> to check your current balance before initiating
              a payment, and <code>client.wallet.topUp()</code> to create a Stripe checkout session
              when you need to add funds.
            </Narrative>
            <CodeBlock code={`// Check wallet balance
const { balanceCents } = await client.wallet.getBalance();
console.log(\`You have $\${(balanceCents / 100).toFixed(2)} available\`);

// Start a top-up via Stripe (returns a URL to redirect the user to)
const { url } = await client.wallet.topUp({
  amountCents: 5000, // $50.00
  successUrl: "https://your-app.replit.app/wallet?topup=ok",
});

// List all trade threads you're part of
const threads = await client.messages.listThreads();
threads.forEach(t => {
  console.log(\`[\${t.role}] \${t.wantedCardName} with \${t.otherUserDisplayName}\`);
  if (t.unreadCount > 0) console.log(\`  → \${t.unreadCount} unread messages\`);
});

// Inspect the offer in a specific thread
const offer = await client.trades.getOffer(threadId);
console.log(\`Status: \${offer.status}, offer: $\${(offer.offerAmount ?? 0) / 100}\`);

// Counter an offer as the seller
await client.trades.updateOffer(threadId, {
  action: "counter",
  amount: 18000, // $180.00 in cents
  note: "Final price — includes shipping in a hard case",
});

// Accept an offer
await client.trades.updateOffer(threadId, { action: "accept" });`} />
          </Section>

          {/* Ratings */}
          <Section
            title="Ratings & Feedback"
            icon={Star}
            subtitle="Read seller reputation scores and reply to feedback left on your account"
          >
            <Narrative>
              Every completed transaction on DexPoky can be rated. Buyers rate sellers — and sellers rate buyers —
              on a 1–3 scale (positive, neutral, negative), with optional sub-scores for condition accuracy,
              communication, shipping speed, and value for money.
            </Narrative>
            <Narrative>
              As a seller you can read all your own feedback and post a single public reply to each rating.
              Replies are visible on your public profile alongside the original comment, giving you a
              chance to address concerns or thank a buyer directly. You can also look up the ratings
              of any user before deciding whether to trade with them.
            </Narrative>
            <CodeBlock code={`// Read ratings for any user — useful before accepting a trade
const { ratings, ratingAverage, positivePercent, sellerLevel } =
  await client.ratings.listForUser("user_clerk_id", {
    role: "seller",
    period: "12m", // last 12 months
  });

console.log(\`\${sellerLevel} seller — \${positivePercent}% positive\`);

ratings.forEach(r => {
  console.log(\`Score: \${r.score} — "\${r.comment ?? "no comment"}"\`);
  if (r.replyText) console.log(\`  Seller replied: "\${r.replyText}"\`);
});

// Reply to a rating someone left for you
await client.ratings.reply(
  ratingId,
  "Thanks so much! Card was shipped same-day in a penny sleeve and toploader."
);

// Look up the rating tied to a specific trade offer
const rating = await client.ratings.getForOffer(offerId);`} />
            <Callout variant="tip">
              You can only reply once per rating, and only to ratings left <em>for you</em>. Replies show up
              publicly on your profile — keep them professional and constructive.
            </Callout>
          </Section>

          {/* Catalog & Wishlist */}
          <Section
            title="Catalog & Wishlist"
            icon={Heart}
            subtitle="Search the global Pokémon TCG catalog and manage your want list"
          >
            <Narrative>
              The catalog is DexPoky's reference database of every Pokémon TCG card ever printed,
              with live market pricing pulled from TCGplayer and Cardmarket. You can use it to
              look up any card by name, get its market price, and link your own collection cards to
              the canonical catalog entry for accurate valuations.
            </Narrative>
            <Narrative>
              The wishlist is your personal "looking for" list — cards you want to own but don't yet.
              Wishlist items feed directly into the AI deck builder, which treats them as available
              to you when suggesting builds. They also appear on your public "Wanted" listings if you
              choose to make them public.
            </Narrative>
            <CodeBlock code={`// Search the full Pokémon TCG catalog
const { results, source } = await client.catalog.search({
  q: "Charizard VMAX",
  limit: 10,
});
console.log(\`Found \${results.length} results via \${source}\`);

// Get full pricing detail for a specific catalog card
const { card, pricing } = await client.catalog.getCard("swsh35-74");
console.log(\`Market price: $\${pricing.marketPrice ?? "unknown"}\`);
console.log(\`Trend: $\${pricing.trendPrice ?? "no data"}\`);

// Add a card to your wishlist
const item = await client.wishlist.add({
  catalogCardId: "swsh35-74",
  priority: "high",
  notes: "Need NM or better for my main deck",
  categoryId: 3, // optional — link to one of your custom categories
});

// List your wishlist
const wishlist = await client.wishlist.list();

// Update priority as your needs change
await client.wishlist.update(item.id, { priority: "normal" });

// Remove when you've acquired the card
await client.wishlist.remove(item.id);`} />
          </Section>

          {/* Wanted Listings & Messaging */}
          <Section
            title="Wanted Listings & Messaging"
            icon={Globe}
            subtitle="Post public 'Looking For' requests and communicate with other collectors"
          >
            <Narrative>
              Wanted listings are public posts that say "I'm looking for this card at this price."
              Any other DexPoky user who owns that card can click through and start a DM thread with you.
              You can browse all active wanted listings posted by the community, post your own, and
              close them once you've found what you were looking for.
            </Narrative>
            <Narrative>
              Once a thread is started, you can exchange messages, negotiate a trade offer, and settle
              the deal — all through the same API. The messaging namespace gives you full access to
              thread lists, message history, and the ability to send new messages programmatically.
            </Narrative>
            <CodeBlock code={`// Browse what the community is looking for
const wanted = await client.wanted.list({ search: "Charizard" });

// Post your own wanted listing
const post = await client.wanted.create({
  catalogCardId: "swsh35-74",
  name: "Charizard VMAX",
  pokemonName: "Charizard",
  maxPrice: 22000, // $220.00 in cents
  notes: "Needs to be NM or better. Will pay shipping.",
  isPublic: true,
});

// Your own wanted listings (any status)
const mine = await client.wanted.listMine();

// Close a listing when you've found the card
await client.wanted.update(post.id, { status: "closed" });

// --- Messaging ---

// List all your active DM threads
const threads = await client.messages.listThreads();

// Read a conversation
const msgs = await client.messages.listMessages(threadId);
msgs.forEach(m => console.log(\`[\${m.senderClerkId}] \${m.content}\`));

// Send a message
await client.messages.send(threadId, {
  content: "Still interested! Can you do $200 shipped?",
});

// Mark a thread as read
await client.messages.markRead(threadId);`} />
          </Section>

          {/* Outreach & Invitations */}
          <Section
            title="Outreach & Invitations"
            icon={Mail}
            subtitle="Send personalized card-format emails and SMS to people who aren't on DexPoky yet"
          >
            <Narrative>
              This is where the SDK gets agentic. <code>client.outreach.invite()</code> lets your script
              send a beautifully styled invitation — formatted like a real Pokémon card — to any email address
              or phone number you supply. The recipient doesn't need to have a DexPoky account yet; this is
              designed specifically for reaching out to game store owners, collectors in other communities,
              or anyone you want to introduce to the platform.
            </Narrative>
            <Narrative>
              The email renders as a Pokémon card: a header with the DexPoky logo, a card-art image slot
              (populated by any listing you feature), a stats block showing live platform numbers, your
              personal message as the "flavor text," and a gold CTA button. SMS delivers a compact version
              of the same message — your text plus the link — to their phone.
              A rate limit of <strong>30 invites per API key per 24 hours</strong> keeps things respectful
              and prevents accidental spam.
            </Narrative>
            <CodeBlock code={`import { DexPokyClient, ApiError } from "@workspace/api-sdk";

const client = new DexPokyClient({
  baseUrl: process.env.DEXPOKY_BASE_URL,
  getToken: () => process.env.DEXPOKY_API_KEY,
});

// --- Email invite ---
const result = await client.outreach.invite({
  to: {
    email: "owner@pokemoncards.shop",
    name: "Sarah",
  },
  subject: "Your cards could be on DexPoky today",
  message:
    "Hi Sarah! I noticed your store on Instagram. DexPoky is a " +
    "Pokémon card marketplace with built-in auctions, P2P trading, " +
    "and an AI deck builder. Listing is free — join 200+ collectors.",
  ctaUrl: "https://your-app.replit.app/marketplace",
});
console.log(\`Sent via \${result.channels.join(", ")} at \${result.sentAt}\`);

// --- SMS invite ---
await client.outreach.invite({
  to: { phone: "+14155550123", name: "Ash" },
  message:
    "Hey! DexPoky is a free Pokémon card marketplace with auctions " +
    "and an AI deck builder. Come check it out!",
  ctaUrl: "https://your-app.replit.app",
});

// --- Combined: email + SMS at the same time ---
await client.outreach.invite({
  to: {
    email: "info@tcgstore.com",
    phone: "+14155550456",
    name: "TCG Store",
  },
  message: "We'd love to feature your inventory on DexPoky.",
  featuredListingId: 42, // card image appears in the email art slot
});

// Check your outreach history
const history = await client.outreach.listInvites();
history.forEach(inv => {
  console.log(\`[\${inv.channel}] → \${inv.to.email ?? inv.to.phone} (\${inv.status})\`);
});`} />
            <Callout variant="info">
              When you supply a <code>featuredListingId</code>, the first image from that listing fills
              the card art slot in the email — great for showcasing a specific card you think the
              recipient would love.
            </Callout>
            <Callout variant="warning">
              Email delivery requires the <strong>Resend integration</strong> to be connected (resend.com — 3,000 free emails/month).
              Connect it from the Integrations panel in your Replit project before sending emails.
              SMS delivery additionally requires <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, and
              <code>TWILIO_PHONE_NUMBER</code> environment secrets from your Twilio Console.
              If only one channel is configured, the other is skipped and a <code>warnings</code> array is returned in the response explaining why.
            </Callout>
          </Section>

          {/* Link Builder */}
          <Section
            title="Link Builder"
            icon={Link2}
            subtitle="Generate clean short URLs for any shareable page — listings, cards, collections, and more"
          >
            <Narrative>
              Every shareable page in DexPoky has a canonical URL, but constructing them manually from an
              agent script is error-prone and means your code breaks if paths ever change.
              <code>client.links</code> takes care of this for you: pass an ID or code, get back both
              the full canonical URL and a compact short URL (<code>/s/xxxxxxx</code>) that you can drop
              directly into a message, SMS, or email.
            </Narrative>
            <Narrative>
              Short URLs are permanent and tracked — any view through a short link increments the listing's
              view counter, giving you a natural signal for how much engagement your outreach generated.
              Use them as the <code>ctaUrl</code> in an outreach invite to point recipients directly at
              the card you're promoting.
            </Narrative>
            <CodeBlock code={`// Marketplace listing page
const listingLink = await client.links.listing(42);
console.log(listingLink.url);      // https://your-app.replit.app/view/listing/42
console.log(listingLink.shortUrl); // https://your-app.replit.app/s/aB3dEf7

// Single card in a collection
const cardLink = await client.links.card(99);

// Group share (bundle of multiple cards)
const bundleLink = await client.links.groupShare("abc123");

// "Looking For" / Wanted listing
const wantedLink = await client.links.wanted("ff00aa11");

// A user's full public collection
const myCollection = await client.links.collection();                         // your own
const theirCollection = await client.links.collection("user_clerk_id_here"); // someone else's

// Combine with outreach — send a link to your best listing
const { shortUrl } = await client.links.listing(42);
await client.outreach.invite({
  to: { email: "buyer@example.com", name: "Alex" },
  message:
    "Hey Alex! I have a near-mint Charizard VMAX you might love — " +
    "just relisted it at a new price.",
  ctaUrl: shortUrl,
  featuredListingId: 42,
});`} />
          </Section>

          {/* Error Handling */}
          <Section
            title="Error Handling"
            icon={Terminal}
            subtitle="How the SDK signals problems and what to do about them"
          >
            <Narrative>
              Every SDK method returns a Promise. When the server responds with a non-2xx status — a 404 for
              a missing resource, a 403 if you're not allowed to do something, a 400 for bad input,
              or a 500 for a server error — the Promise rejects with an <code>ApiError</code> instance.
            </Narrative>
            <Narrative>
              <code>ApiError</code> carries everything you need to handle the failure gracefully:
              the HTTP status code, a human-readable message, and the parsed response body from the server.
              Wrapping calls in a try/catch and checking for <code>ApiError</code> is the idiomatic pattern.
            </Narrative>
            <CodeBlock code={`import { DexPokyClient, ApiError } from "@workspace/api-sdk";

const client = new DexPokyClient({ /* … */ });

async function safeGetCard(id: number) {
  try {
    return await client.cards.get(id);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        console.log("Card not found — it may have been deleted.");
        return null;
      }
      if (err.status === 401) {
        console.log("Check your API key — it may have been revoked.");
        return null;
      }
      // Log everything else for debugging
      console.error(\`API error \${err.status}: \${err.message}\`);
      console.error("Server said:", err.data);
    }
    // Re-throw anything unexpected (network error, etc.)
    throw err;
  }
}`} />
            <Callout variant="info">
              The <code>err.data</code> field contains the parsed JSON body from the server — usually an
              object like <code>{`{ error: "Card not found" }`}</code>. This is useful for surfacing
              server-side validation messages directly to your users.
            </Callout>
          </Section>

          {/* TypeScript */}
          <Section
            title="TypeScript Types"
            icon={Code2}
            subtitle="Every request and response has a full type — use them for autocomplete and safety"
          >
            <Narrative>
              The SDK is written in TypeScript and ships with complete type definitions. Every method is
              typed end-to-end: the parameters you pass in are validated at compile time, and the return
              type tells your editor exactly what shape of data to expect — including nullable fields and
              union types for things like enums.
            </Narrative>
            <Narrative>
              All types are re-exported from the top-level <code>@workspace/api-sdk</code> import so you
              don't need to hunt for them. Import any type you need alongside the client.
            </Narrative>
            <CodeBlock code={`import type {
  // Collection
  Card, CreateCardBody, UpdateCardBody, CardRarity, CardCondition,

  // Marketplace
  Listing, CreateListingBody, ListingStatus,

  // Decks
  DeckSummary, DeckWithCards, DeckCardEntry, SuggestDeckResponse,

  // Catalog & Wishlist
  CatalogCard, CatalogCardDetail, WishlistItem,

  // Wanted & Messaging
  WantedListing, DmThread, DmThreadSummary, DmMessage,

  // Trades & Wallet
  TradeOffer, ExchangeMethod, WalletBalance,

  // Users & Ratings
  UserProfile, RatingEntry, EarningsResponse,

  // Errors
  ApiError, ErrorEnvelope,
} from "@workspace/api-sdk";

// Use them for typed helper functions, state, or component props
function formatCard(card: Card): string {
  return \`\${card.name} (\${card.rarity}, \${card.condition})\`;
}

// Or typed local state in React
const [offer, setOffer] = useState<TradeOffer | null>(null);`} />
            <Callout variant="tip">
              The SDK is fully tree-shakeable. If you only import <code>client.cards</code> in your code,
              your bundler will strip out all the other namespaces. You pay only for what you use.
            </Callout>
          </Section>

        </div>

        {/* Footer: Base URL reference */}
        <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Connecting to your instance
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All API routes live under the <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/api</code> path on your DexPoky domain.
            When calling from outside the browser — Node.js scripts, CI pipelines, mobile apps —
            you need to tell the SDK where to find your instance using <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">baseUrl</code>.
            The easiest way is to keep both values in environment variables so you can switch between
            development and production without changing any code.
          </p>
          <CodeBlock lang="env" code={`DEXPOKY_BASE_URL=https://your-app.replit.app
DEXPOKY_API_KEY=dpx_your_key_here`} />
          <CodeBlock code={`const client = new DexPokyClient({
  baseUrl: process.env.DEXPOKY_BASE_URL,
  getToken: () => process.env.DEXPOKY_API_KEY ?? null,
});`} />
        </div>

      </div>
    </Layout>
  );
}
