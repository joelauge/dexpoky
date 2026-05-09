import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-payment-sse";
import { Layout } from "@/components/layout";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Plus,
  Trash2,
  Play,
  Pause,
  Zap,
  Wallet,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Info,
  ShoppingCart,
  Tag,
  ShieldCheck,
  ShieldQuestion,
  Search,
  X,
  Store,
  Database,
  Pencil,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuthFetch } from "@/lib/use-auth-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DexAgent {
  id: number;
  clerkId: string;
  agentRole: "buyer" | "seller";
  name: string;
  // buyer
  pokemonName: string;
  targetSetName: string | null;
  triggerType: "buy_now" | "bid";
  maxPricePathUsd: string;
  budgetPathUsd: string;
  spentPathUsd: string;
  requireHoloOnly: boolean;
  requireCondition: string | null;
  requireApproval: boolean;
  // seller
  cardId: number | null;
  floorPricePathUsd: string | null;
  managedListingId: number | null;
  // common
  status: "active" | "paused" | "budget_exhausted" | "completed";
  runsCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentRun {
  id: number;
  agentId: number;
  clerkId: string;
  listingId: number | null;
  cardName: string | null;
  amountPathUsd: string | null;
  tempoTxHash: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

interface InventoryCard {
  id: number;
  name: string;
  pokemonName: string;
  setName: string | null;
  rarity: string | null;
  condition: string | null;
  estimatedValue: string | null;
  imageUrl: string | null;
  certId: number | null;
  certStatus: string | null;
  certCompany: string | null;
  certGrade: string | null;
  certNumber: string | null;
}

interface ExternalFind {
  id: number;
  agentId: number;
  clerkId: string;
  cardName: string;
  site: string;
  listingTitle: string | null;
  listingUrl: string;
  priceUsd: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DexAgentsPage() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"buyer" | "seller">("buyer");

  const { data: agents = [], isLoading: agentsLoading } = useQuery<DexAgent[]>({
    queryKey: ["dex-agents"],
    queryFn: () => authFetch("/api/agents").then((r) => r.json()),
  });

  const { data: runsData } = useQuery<{ runs: AgentRun[]; hasMore: boolean }>({
    queryKey: ["agent-runs-card"],
    queryFn: () => authFetch("/api/agents/runs?limit=50").then((r) => r.json()),
    refetchInterval: 15000,
  });
  const runs = runsData?.runs ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dex-agents"] });
    qc.invalidateQueries({ queryKey: ["agent-runs"] });
  };

  const { data: externalFinds = [] } = useQuery<ExternalFind[]>({
    queryKey: ["agent-external-finds"],
    queryFn: () => authFetch("/api/agents/external-finds?status=saved").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const buyerAgents = agents.filter((a) => a.agentRole === "buyer");
  const sellerAgents = agents.filter((a) => a.agentRole === "seller");
  const visibleAgents = tab === "buyer" ? buyerAgents : sellerAgents;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Bot className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DexAgents</h1>
            <p className="text-sm text-slate-500">
              Autonomous buying and selling agents for your Pokémon card collection
            </p>
          </div>
        </div>

        <InAppWalletPanel />

        {/* Tabs + Add button */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <TabBtn
              active={tab === "buyer"}
              onClick={() => setTab("buyer")}
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              label="Buyers"
              count={buyerAgents.length}
            />
            <TabBtn
              active={tab === "seller"}
              onClick={() => setTab("seller")}
              icon={<Tag className="h-3.5 w-3.5" />}
              label="Sellers"
              count={sellerAgents.length}
            />
          </div>

          {tab === "buyer" ? (
            <CreateBuyerAgentDialog onCreated={invalidate} />
          ) : (
            <CreateSellerAgentDialog onCreated={invalidate} />
          )}
        </div>

        {/* Tab description */}
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 -mt-4">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
          {tab === "buyer" ? (
            <span>
              <strong className="text-slate-600">Buyer agents</strong> scan the marketplace every minute and automatically purchase matching cards using your DexPoky wallet balance.
            </span>
          ) : (
            <span>
              <strong className="text-slate-600">Seller agents</strong> list a card from your inventory at your floor price. Any buyer — human or agent — can purchase it. The agent marks itself complete once the card sells.
            </span>
          )}
        </div>

        {/* Agent list */}
        {agentsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : visibleAgents.length === 0 ? (
          <EmptyAgents role={tab} />
        ) : (
          <div className="space-y-3">
            {visibleAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                runs={runs.filter((r) => r.agentId === agent.id)}
                onChanged={invalidate}
              />
            ))}
          </div>
        )}

        <ExternalFindsPanel finds={externalFinds} />

        <ActivityFeed agents={agents} />
      </div>
    </Layout>
  );
}

// ── External Finds Panel ──────────────────────────────────────────────────────

function ExternalFindsPanel({ finds }: { finds: ExternalFind[] }) {
  const [open, setOpen] = useState(true);

  if (finds.length === 0) return null;

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-orange-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ShoppingBag className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-900">eBay Finds</span>
          <span className="text-xs bg-orange-200 text-orange-800 font-bold px-2 py-0.5 rounded-full">
            {finds.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-orange-600">Cards your agents spotted on eBay</span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-orange-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-orange-500" />
          )}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-orange-100 border-t border-orange-100">
          {finds.map((find) => (
            <div key={find.id} className="px-4 py-3 flex items-start gap-3 bg-white hover:bg-orange-50/40 transition-colors">
              <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                <ShoppingBag className="h-4 w-4 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">{find.cardName}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">
                    {find.site}
                  </span>
                  <span className="text-sm font-bold text-emerald-700">${parseFloat(find.priceUsd).toFixed(2)}</span>
                </div>
                {find.listingTitle && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{find.listingTitle}</p>
                )}
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Saved {format(new Date(find.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
              <a
                href={find.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-200 px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
              >
                View on {find.site}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700",
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={cn("text-xs px-1.5 py-0.5 rounded-full", active ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-500")}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── In-App Wallet Panel ────────────────────────────────────────────────────────

function InAppWalletPanel() {
  const authFetch = useAuthFetch();
  const [toppingUp, setToppingUp] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ balanceCents: number; topupAmounts: number[] } | null>({
    queryKey: WALLET_BALANCE_QUERY_KEY,
    queryFn: () => authFetch("/api/wallet/balance").then((r) => r.ok ? r.json() : null),
  });

  async function handleTopup(amountCents: number) {
    setToppingUp(amountCents);
    try {
      const res = await authFetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast.error("Could not initiate top-up");
        setToppingUp(null);
      }
    } catch {
      toast.error("Something went wrong");
      setToppingUp(null);
    }
  }

  const balanceDollars = data ? `$${(data.balanceCents / 100).toFixed(2)}` : "$0.00";
  const topupAmounts = data?.topupAmounts ?? [1000, 2500, 5000, 10000];

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-700">DexPoky Wallet</span>
        <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700 border-0">USD</Badge>
        <Link href="/wallet" className="ml-auto text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1 transition-colors">
          Full history <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Available balance</p>
            <p className="text-3xl font-bold text-slate-900">
              {balanceDollars}
              <span className="text-base font-medium text-slate-500 ml-1">USD</span>
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">Add funds</p>
            <div className="flex gap-2 flex-wrap">
              {topupAmounts.map((cents) => (
                <button
                  key={cents}
                  onClick={() => handleTopup(cents)}
                  disabled={!!toppingUp}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-violet-200 text-violet-700 rounded-lg px-3 py-1.5 hover:bg-violet-50 transition-colors disabled:opacity-50"
                >
                  {toppingUp === cents ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  ${(cents / 100).toFixed(0)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-violet-600 bg-violet-50/80 rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Your DexPoky wallet balance is used by agents to purchase cards automatically.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyAgents({ role }: { role: "buyer" | "seller" }) {
  return (
    <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200">
      {role === "buyer" ? (
        <ShoppingCart className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      ) : (
        <Tag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      )}
      <p className="text-slate-500 font-medium">
        {role === "buyer" ? "No buyer agents yet" : "No seller agents yet"}
      </p>
      <p className="text-sm text-slate-400 mt-1">
        {role === "buyer"
          ? "Create an agent to automatically buy cards using pathUSD stablecoins"
          : "Create an agent to list a card and auto-sell when someone meets your floor price"}
      </p>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

const statusColorMap: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  budget_exhausted: "bg-red-100 text-red-600",
  completed: "bg-blue-100 text-blue-700",
};

const statusLabelMap: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  budget_exhausted: "Budget Exhausted",
  completed: "Sold",
};

// ── Agent Card ────────────────────────────────────────────────────────────────

interface AgentEditForm {
  name: string;
  pokemonName: string;
  targetSetName: string;
  maxPricePathUsd: number;
  budgetPathUsd: number;
  requireHoloOnly: boolean;
  requireApproval: boolean;
  floorPricePathUsd: number;
}

function AgentCard({
  agent,
  runs,
  onChanged,
}: {
  agent: DexAgent;
  runs: AgentRun[];
  onChanged: () => void;
}) {
  const authFetch = useAuthFetch();
  const [showRuns, setShowRuns] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<AgentEditForm>({
    name: agent.name,
    pokemonName: agent.pokemonName,
    targetSetName: agent.targetSetName ?? "",
    maxPricePathUsd: parseFloat(agent.maxPricePathUsd),
    budgetPathUsd: parseFloat(agent.budgetPathUsd),
    requireHoloOnly: agent.requireHoloOnly,
    requireApproval: agent.requireApproval,
    floorPricePathUsd: parseFloat(agent.floorPricePathUsd ?? "0"),
  });

  const patch = (body: Record<string, unknown>) =>
    authFetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const toggleMutation = useMutation({
    mutationFn: () => patch({ status: agent.status === "active" ? "paused" : "active" }),
    onSuccess: () => {
      toast.success(agent.status === "active" ? "Agent paused" : "Agent activated");
      onChanged();
    },
    onError: () => toast.error("Failed to update agent"),
  });

  const pauseMutation = useMutation({
    mutationFn: () => patch({ status: "paused" }),
    onSuccess: () => onChanged(),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      patch(
        agent.agentRole === "buyer"
          ? {
              name: editForm.name,
              pokemonName: editForm.pokemonName,
              targetSetName: editForm.targetSetName || "",
              maxPricePathUsd: editForm.maxPricePathUsd,
              budgetPathUsd: editForm.budgetPathUsd,
              requireHoloOnly: editForm.requireHoloOnly,
              requireApproval: editForm.requireApproval,
            }
          : {
              name: editForm.name,
              floorPricePathUsd: editForm.floorPricePathUsd,
            },
      ),
    onSuccess: () => {
      toast.success("Settings saved — resume the agent when you're ready.");
      setEditMode(false);
      onChanged();
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const triggerMutation = useMutation({
    mutationFn: (): Promise<{ matched: boolean; pendingApproval?: boolean; cardName?: string; pricePathUsd?: string; note?: string }> =>
      authFetch(`/api/agents/${agent.id}/trigger`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data?.pendingApproval) {
        toast.success(`SMS sent! Reply YES to confirm buying "${data.cardName}" for ${data.pricePathUsd} pathUSD.`);
      } else if (data?.matched) {
        toast.success(
          agent.agentRole === "buyer"
            ? `Bought "${data.cardName}" for ${data.pricePathUsd} pathUSD`
            : `Card sold for ${data.pricePathUsd} pathUSD`,
        );
      } else {
        toast.info(data?.note ?? "No action taken");
      }
      onChanged();
    },
    onError: () => toast.error("Trigger failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => authFetch(`/api/agents/${agent.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Agent deleted");
      onChanged();
    },
    onError: () => toast.error("Failed to delete agent"),
  });

  function openEdit() {
    setEditForm({
      name: agent.name,
      pokemonName: agent.pokemonName,
      targetSetName: agent.targetSetName ?? "",
      maxPricePathUsd: parseFloat(agent.maxPricePathUsd),
      budgetPathUsd: parseFloat(agent.budgetPathUsd),
      requireHoloOnly: agent.requireHoloOnly,
      requireApproval: agent.requireApproval,
      floorPricePathUsd: parseFloat(agent.floorPricePathUsd ?? "0"),
    });
    if (agent.status === "active") pauseMutation.mutate();
    setEditMode(true);
  }

  const statusColor = statusColorMap[agent.status] ?? "bg-slate-100 text-slate-600";
  const statusLabel = statusLabelMap[agent.status] ?? agent.status;
  const canToggle = !editMode && agent.status !== "budget_exhausted" && agent.status !== "completed";
  const canEdit = agent.status !== "completed";

  const buyerValid = editForm.name.trim().length > 0 && editForm.pokemonName.trim().length > 0
    && editForm.maxPricePathUsd > 0 && editForm.budgetPathUsd > 0;
  const sellerValid = editForm.name.trim().length > 0 && editForm.floorPricePathUsd > 0;
  const saveValid = agent.agentRole === "buyer" ? buyerValid : sellerValid;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0",
                agent.agentRole === "buyer" ? "bg-violet-100" : "bg-emerald-100")}>
                {agent.agentRole === "buyer"
                  ? <ShoppingCart className="h-3.5 w-3.5 text-violet-600" />
                  : <Tag className="h-3.5 w-3.5 text-emerald-600" />}
              </div>
              <span className="font-semibold text-slate-800">{agent.name}</span>
              <Badge className={cn("text-xs border-0", statusColor)}>
                {editMode ? "Editing" : statusLabel}
              </Badge>
            </div>

            {!editMode && (agent.agentRole === "buyer" ? (
              <p className="text-sm text-slate-500 mt-0.5">
                Watching for <span className="font-medium text-slate-700">{agent.pokemonName}</span>
                {agent.targetSetName && (
                  <span className="ml-1 text-[10px] bg-violet-100 text-violet-600 border border-violet-200 font-bold px-1.5 py-0.5 rounded">
                    SET · {agent.targetSetName.toUpperCase()}
                  </span>
                )}
                {" · "}max{" "}
                <span className="font-medium text-slate-700">
                  {parseFloat(agent.maxPricePathUsd).toFixed(2)} pathUSD
                </span>
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">
                Floor price{" "}
                <span className="font-medium text-slate-700">
                  {parseFloat(agent.floorPricePathUsd ?? "0").toFixed(2)} pathUSD
                </span>
                {agent.managedListingId && (
                  <span className="text-slate-400"> · listing #{agent.managedListingId}</span>
                )}
              </p>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!editMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending || agent.status !== "active"}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1", triggerMutation.isPending && "animate-spin")} />
                Run
              </Button>
            )}

            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-8 w-8 p-0", editMode ? "text-violet-600 bg-violet-50 hover:bg-violet-100" : "text-slate-400 hover:text-slate-700")}
                onClick={() => editMode ? setEditMode(false) : openEdit()}
                title={editMode ? "Close editor" : "Edit settings"}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}

            {!editMode && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => toggleMutation.mutate()}
                disabled={toggleMutation.isPending || !canToggle}
                title={agent.status === "active" ? "Pause" : "Activate"}
              >
                {agent.status === "active"
                  ? <Pause className="h-4 w-4 text-amber-500" />
                  : <Play className="h-4 w-4 text-green-600" />}
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete agent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{agent.name}" and all its run history.
                    {agent.agentRole === "seller" && agent.managedListingId && (
                      <span className="block mt-1 text-amber-700">
                        The active marketplace listing will also be cancelled.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => deleteMutation.mutate()}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Buyer: budget bar */}
        {agent.agentRole === "buyer" && (() => {
          const spent = parseFloat(agent.spentPathUsd);
          const budget = parseFloat(agent.budgetPathUsd);
          const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
          return (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Budget used</span>
                <span>{spent.toFixed(2)} / {budget.toFixed(2)} pathUSD</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all",
                    pct >= 90 ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-violet-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Seller: completed callout */}
        {agent.agentRole === "seller" && agent.status === "completed" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Card sold successfully for {parseFloat(agent.floorPricePathUsd ?? "0").toFixed(2)} pathUSD
          </div>
        )}

        {!editMode && agent.runsCount > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
            <span>{agent.runsCount} run{agent.runsCount !== 1 ? "s" : ""}</span>
            {agent.lastRunAt && (
              <span>Last ran {format(new Date(agent.lastRunAt), "MMM d, h:mm a")}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Inline edit panel ────────────────────────────────────────────────── */}
      {editMode && (
        <div className="border-t border-violet-100 bg-violet-50/40 px-4 py-4 space-y-4">
          {/* paused banner */}
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Pause className="h-3.5 w-3.5 shrink-0" />
            Agent paused while editing — resume with the play button once you save.
          </div>

          {/* name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Agent Name</Label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>

          {agent.agentRole === "buyer" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Watch for Pokémon</Label>
                <CardSearchCombobox
                  value={editForm.pokemonName}
                  setName={editForm.targetSetName}
                  onChange={(name, setName) => setEditForm((f) => ({ ...f, pokemonName: name, targetSetName: setName }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Max Price (pathUSD)</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.maxPricePathUsd}
                    onChange={(e) => setEditForm((f) => ({ ...f, maxPricePathUsd: parseFloat(e.target.value) || 0 }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Total Budget (pathUSD)</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.budgetPathUsd}
                    onChange={(e) => setEditForm((f) => ({ ...f, budgetPathUsd: parseFloat(e.target.value) || 0 }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-slate-700">Holo/Foil only</p>
                  <p className="text-[11px] text-slate-400">Only buy holographic cards</p>
                </div>
                <Switch
                  checked={editForm.requireHoloOnly}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, requireHoloOnly: v }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white border border-violet-200 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-slate-700">Require SMS approval</p>
                  <p className="text-[11px] text-slate-400">Text me first — I reply YES/NO before any purchase</p>
                </div>
                <Switch
                  checked={editForm.requireApproval}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, requireApproval: v }))}
                />
              </div>
              {!editForm.requireApproval && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span><strong>Auto-purchase mode:</strong> when a match is found, this agent will buy immediately without asking. Enable SMS approval above to confirm first.</span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Floor Price (pathUSD)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editForm.floorPricePathUsd}
                onChange={(e) => setEditForm((f) => ({ ...f, floorPricePathUsd: parseFloat(e.target.value) || 0 }))}
                className="h-8 text-sm"
              />
              {agent.managedListingId && (
                <p className="text-[11px] text-slate-400">Active listing price will update immediately.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setEditMode(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!saveValid || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {!editMode && runs.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            onClick={() => setShowRuns((v) => !v)}
          >
            {showRuns ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {runs.length} run{runs.length !== 1 ? "s" : ""}
          </button>
          {showRuns && (
            <div className="px-4 pb-3 space-y-1.5">
              {runs.slice(0, 5).map((run) => <RunRow key={run.id} run={run} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: AgentRun }) {
  const isSuccess = run.status === "success";
  const isSim = run.status === "simulated";
  const isListed = run.status === "listed";

  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        {isSuccess
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          : isSim
            ? <Zap className="h-3.5 w-3.5 text-violet-400" />
            : isListed
              ? <Tag className="h-3.5 w-3.5 text-emerald-500" />
              : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-slate-600">{run.note}</span>
        {run.tempoTxHash && (
          <a
            href={`https://explore.testnet.tempo.xyz/tx/${run.tempoTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 text-violet-600 hover:underline inline-flex items-center gap-0.5"
          >
            tx <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <span className="text-slate-400 shrink-0">{format(new Date(run.createdAt), "h:mm a")}</span>
    </div>
  );
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function ActivityFeed({ agents }: { agents: DexAgent[] }) {
  const authFetch = useAuthFetch();
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));
  const sentinelRef = useRef<HTMLDivElement>(null);

  type RunsPage = { runs: AgentRun[]; hasMore: boolean };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<RunsPage, Error, RunsPage, string[], number>({
    queryKey: ["agent-runs-feed"],
    queryFn: ({ pageParam }) =>
      authFetch(`/api/agents/runs?limit=${PAGE_SIZE}&offset=${pageParam}`).then((r) => r.json()) as Promise<RunsPage>,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined,
    refetchInterval: 20000,
  });

  const allRuns: AgentRun[] = (data as unknown as { pages: RunsPage[] } | undefined)
    ?.pages.flatMap((p) => p.runs ?? []) ?? [];

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);

  if (isLoading) return null;
  if (allRuns.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {allRuns.map((run) => (
          <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="shrink-0">
              {run.status === "success"
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : run.status === "simulated"
                  ? <Zap className="h-4 w-4 text-violet-400" />
                  : run.status === "listed"
                    ? <Tag className="h-4 w-4 text-emerald-500" />
                    : <Clock className="h-4 w-4 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-600">
                  {agentMap.get(run.agentId) ?? `Agent #${run.agentId}`}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 truncate">{run.note}</span>
              </div>
              {run.amountPathUsd && (
                <p className="text-xs text-violet-600 mt-0.5">
                  {parseFloat(run.amountPathUsd).toFixed(4)} pathUSD
                </p>
              )}
            </div>
            <span className="text-xs text-slate-400 shrink-0">
              {format(new Date(run.createdAt), "MMM d, h:mm a")}
            </span>
          </div>
        ))}

        {/* Sentinel — triggers next page fetch when scrolled into view */}
        <div ref={sentinelRef} className="px-4 py-3 flex justify-center">
          {isFetchingNextPage ? (
            <span className="text-xs text-slate-400">Loading more…</span>
          ) : hasNextPage ? (
            <span className="text-xs text-slate-300">Scroll for more</span>
          ) : allRuns.length > PAGE_SIZE ? (
            <span className="text-xs text-slate-300">All caught up</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Create Buyer Agent Dialog ─────────────────────────────────────────────────

// ── Card Search Combobox ──────────────────────────────────────────────────────

interface MktListing {
  id: number;
  price: string;
  card?: {
    name: string | null;
    imageUrl: string | null;
    setName: string | null;
    estimatedValue?: number | null;
  };
}
interface CatalogCard {
  id: string;
  name: string;
  imageUrl?: string | null;
  setName?: string | null;
  setCode?: string | null;
  marketPrice?: number | null;
  rarity?: string | null;
}

interface CardResult {
  source: "marketplace" | "catalog";
  key: string;
  name: string;
  setName?: string;
  imageUrl?: string;
  price?: string;
  marketPrice?: number;
  listingId?: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function CardSearchCombobox({
  value,
  setName: selectedSetName,
  onChange,
}: {
  value: string;
  setName: string;
  onChange: (name: string, setName: string, imageUrl?: string, marketPrice?: number) => void;
}) {
  const authFetch = useAuthFetch();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CardResult[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | undefined>();
  const [selectedMarketPrice, setSelectedMarketPrice] = useState<number | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 350);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search both sources in parallel via backend (avoids browser cross-origin blocks)
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);

    // Marketplace: nested card object — l.card.name / l.card.imageUrl
    const mktFetch = authFetch(`/api/marketplace?search=${encodeURIComponent(q)}&limit=6`)
      .then((r) => r.json() as Promise<MktListing[]>)
      .catch(() => [] as MktListing[]);

    // Catalog: backend proxies PokeWallet + TCGdex with wildcard search
    const catalogFetch = fetch(`/api/catalog/search?q=${encodeURIComponent(q)}&limit=25`)
      .then((r) => r.json() as Promise<{ results: CatalogCard[] }>)
      .catch(() => ({ results: [] as CatalogCard[] }));

    Promise.all([mktFetch, catalogFetch]).then(([mkt, catalog]) => {
      const mktResults: CardResult[] = (Array.isArray(mkt) ? mkt : [])
        .filter((l) => l.card?.name)
        .map((l) => ({
          source: "marketplace" as const,
          key: `mkt-${l.id}`,
          name: l.card!.name!,
          setName: l.card!.setName ?? undefined,
          imageUrl: l.card!.imageUrl ?? undefined,
          price: l.price,
          listingId: l.id,
        }));

      // Deduplicate catalog results by name (keep first unique name per card)
      const seen = new Set<string>();
      const catalogResults: CardResult[] = (catalog.results ?? [])
        .filter((c) => {
          if (!c.name) return false;
          const key = `${c.name}||${c.setCode ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 20)
        .map((c) => ({
          source: "catalog" as const,
          key: `cat-${c.id}`,
          name: c.name,
          imageUrl: c.imageUrl ?? undefined,
          setName: c.setName ?? c.setCode ?? undefined,
          marketPrice: c.marketPrice ?? undefined,
        }));

      setResults([...mktResults, ...catalogResults]);
      setLoading(false);
    });
  }, [debouncedQuery]);

  const isSelected = value.length > 0;

  if (isSelected) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-violet-50 border border-violet-200">
        {selectedImageUrl ? (
          <img
            src={selectedImageUrl}
            alt={value}
            className="h-10 w-7 object-contain rounded shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-10 w-7 rounded bg-violet-100 flex items-center justify-center shrink-0">
            <Database className="h-3 w-3 text-violet-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-violet-800">{value}</p>
          <div className="flex items-center gap-2">
            {selectedSetName && (
              <p className="text-xs text-violet-500">{selectedSetName}</p>
            )}
            {selectedMarketPrice != null && (
              <p className="text-xs font-semibold text-emerald-600">~${selectedMarketPrice.toFixed(2)}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => { onChange("", "", undefined, undefined); setSelectedImageUrl(undefined); setSelectedMarketPrice(undefined); setQuery(""); }}
          className="p-1 rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors shrink-0"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          placeholder="Search by card name… e.g. Charizard EX, Pikachu VMAX"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.length >= 2) setOpen(true); }}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <RefreshCw className="h-3.5 w-3.5 text-violet-400 animate-spin" />
          </div>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          {results.length === 0 && !loading && (
            <p className="text-xs text-slate-400 text-center py-6">No results — try a different name</p>
          )}

          {/* Marketplace section */}
          {results.filter((r) => r.source === "marketplace").length > 0 && (
            <>
              <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-100">
                <Store className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">On DexPoky now</span>
              </div>
              {results.filter((r) => r.source === "marketplace").map((card) => (
                <button
                  key={card.key}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors group"
                  onClick={() => {
                    setSelectedImageUrl(card.imageUrl);
                    setSelectedMarketPrice(card.price ? parseFloat(card.price) : undefined);
                    onChange(card.name, card.setName ?? "", card.imageUrl, card.price ? parseFloat(card.price) : undefined);
                    setOpen(false); setQuery("");
                  }}
                >
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt={card.name} className="h-10 w-7 object-contain rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="h-10 w-7 rounded bg-slate-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{card.name}</p>
                    {card.setName && <p className="text-xs text-slate-400 truncate">{card.setName}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-semibold text-emerald-600">${card.price}</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-200">BUY NOW</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Catalog section (PokeWallet + TCGdex via backend) */}
          {results.filter((r) => r.source === "catalog").length > 0 && (
            <>
              <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-100">
                <Database className="h-3 w-3 text-violet-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">All Pokémon TCG cards</span>
              </div>
              {results.filter((r) => r.source === "catalog").map((card) => (
                <button
                  key={card.key}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                  onClick={() => {
                    setSelectedImageUrl(card.imageUrl);
                    setSelectedMarketPrice(card.marketPrice);
                    onChange(card.name, card.setName ?? "", card.imageUrl, card.marketPrice);
                    setOpen(false); setQuery("");
                  }}
                >
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt={card.name} className="h-10 w-7 object-contain rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="h-10 w-7 rounded bg-slate-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{card.name}</p>
                    {card.setName && <p className="text-xs text-slate-400 truncate">{card.setName}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {card.marketPrice != null && (
                      <span className="text-xs font-semibold text-violet-700">~${card.marketPrice.toFixed(2)}</span>
                    )}
                    <span className="text-[9px] bg-violet-50 text-violet-600 font-bold px-1.5 py-0.5 rounded border border-violet-200">WATCH</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface BuyerForm {
  name: string;
  pokemonName: string;
  targetSetName: string;
  triggerType: "buy_now" | "bid";
  maxPricePathUsd: number;
  budgetPathUsd: number;
  requireHoloOnly: boolean;
  requireApproval: boolean;
}

function CreateBuyerAgentDialog({ onCreated }: { onCreated: () => void }) {
  const authFetch = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BuyerForm>({
    name: "",
    pokemonName: "",
    targetSetName: "",
    triggerType: "buy_now",
    maxPricePathUsd: 5,
    budgetPathUsd: 50,
    requireHoloOnly: false,
    requireApproval: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentRole: "buyer",
          name: form.name,
          pokemonName: form.pokemonName,
          targetSetName: form.targetSetName || undefined,
          triggerType: form.triggerType,
          maxPricePathUsd: form.maxPricePathUsd,
          budgetPathUsd: form.budgetPathUsd,
          requireHoloOnly: form.requireHoloOnly,
          requireApproval: form.requireApproval,
        }),
      }),
    onSuccess: () => {
      toast.success("Buyer agent created!");
      setOpen(false);
      setForm({ name: "", pokemonName: "", targetSetName: "", triggerType: "buy_now", maxPricePathUsd: 5, budgetPathUsd: 50, requireHoloOnly: false, requireApproval: false });
      onCreated();
    },
    onError: () => toast.error("Failed to create agent"),
  });

  const valid = form.name && form.pokemonName && form.maxPricePathUsd > 0 && form.budgetPathUsd > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus className="h-4 w-4" />
          New Buyer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-violet-600" />
            Create Buyer Agent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Agent Name</Label>
            <Input
              placeholder="e.g. Charizard Hunter"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Watch for Pokémon</Label>
            <CardSearchCombobox
              value={form.pokemonName}
              setName={form.targetSetName}
              onChange={(name, setName) => setForm((f) => ({ ...f, pokemonName: name, targetSetName: setName }))}
            />
            {!form.pokemonName && (
              <p className="text-xs text-slate-400">
                Search across the DexPoky marketplace and the full Pokémon TCG database — select a specific card to be precise.
              </p>
            )}
            {form.pokemonName && form.targetSetName && (
              <p className="text-xs text-slate-500">
                Agent will only buy <strong>{form.pokemonName}</strong> from set <strong>{form.targetSetName.toUpperCase()}</strong>.
              </p>
            )}
            {form.pokemonName && !form.targetSetName && (
              <p className="text-xs text-slate-500">
                Agent will buy any <strong>{form.pokemonName}</strong> card regardless of set.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Max Price (pathUSD)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.maxPricePathUsd}
                onChange={(e) => setForm((f) => ({ ...f, maxPricePathUsd: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-xs text-slate-400">Won't buy above this</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Total Budget (pathUSD)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.budgetPathUsd}
                onChange={(e) => setForm((f) => ({ ...f, budgetPathUsd: parseFloat(e.target.value) || 0 }))}
              />
              <p className="text-xs text-slate-400">Agent pauses when spent</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Holo/Foil only</p>
              <p className="text-xs text-slate-400">Only buy holographic cards</p>
            </div>
            <Switch
              checked={form.requireHoloOnly}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requireHoloOnly: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-violet-50 border border-violet-200 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Require SMS approval</p>
              <p className="text-xs text-slate-400">Text me first — I reply YES/NO before buying</p>
            </div>
            <Switch
              checked={form.requireApproval}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requireApproval: v }))}
            />
          </div>

          {!form.requireApproval ? (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Auto-purchase mode:</strong> this agent will buy cards automatically without asking first. Enable SMS approval above if you'd like to confirm each purchase. Add your phone number in your profile to use SMS.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs text-violet-700 bg-violet-50 rounded-xl px-3 py-2.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                When a match is found, you'll get a text message asking you to confirm. Reply <strong>YES</strong> to buy or <strong>NO</strong> to skip. Make sure your phone number is saved in your profile.
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Seller Agent Dialog ────────────────────────────────────────────────

const CERT_COMPANY_LABELS: Record<string, string> = { psa: "PSA", bgs: "BGS", cgc: "CGC" };
const CERT_COMPANY_COLORS: Record<string, string> = {
  psa: "bg-blue-100 text-blue-700 border-blue-200",
  bgs: "bg-red-100 text-red-700 border-red-200",
  cgc: "bg-purple-100 text-purple-700 border-purple-200",
};

function CreateSellerAgentDialog({ onCreated }: { onCreated: () => void }) {
  const authFetch = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [floorPrice, setFloorPrice] = useState(10);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<InventoryCard[]>({
    queryKey: ["agents-inventory"],
    queryFn: () => authFetch("/api/agents/inventory").then((r) => r.json()),
    enabled: open,
  });

  const verifiedCards = inventory.filter((c) => c.certStatus === "verified");
  const visibleCards = verifiedOnly ? verifiedCards : inventory;
  const selectedCard = inventory.find((c) => c.id === selectedCardId);
  const selectedIsVerified = selectedCard?.certStatus === "verified";

  const mutation = useMutation({
    mutationFn: () =>
      authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentRole: "seller",
          name,
          cardId: selectedCardId,
          floorPricePathUsd: floorPrice,
        }),
      }),
    onSuccess: () => {
      toast.success("Seller agent created — listing will go live shortly!");
      setOpen(false);
      setName("");
      setSelectedCardId(null);
      setFloorPrice(10);
      onCreated();
    },
    onError: () => toast.error("Failed to create agent"),
  });

  const valid = name && selectedCardId && floorPrice > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
          <Plus className="h-4 w-4" />
          New Seller
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-600" />
            Create Seller Agent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Agent Name</Label>
            <Input
              placeholder="e.g. Sell my Charizard"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Card to Sell</Label>
              {verifiedCards.length > 0 && (
                <button
                  onClick={() => { setVerifiedOnly((v) => !v); setSelectedCardId(null); }}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors",
                    verifiedOnly
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300",
                  )}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Verified only
                </button>
              )}
            </div>

            {inventoryLoading ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : visibleCards.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">
                {verifiedOnly ? "No verified cards yet. Submit a PSA/BGS/CGC cert on a card first." : "No cards in your inventory yet."}
              </p>
            ) : (
              <Select
                value={selectedCardId?.toString() ?? ""}
                onValueChange={(v) => setSelectedCardId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a card from your inventory…" />
                </SelectTrigger>
                <SelectContent>
                  {visibleCards.map((card) => (
                    <SelectItem key={card.id} value={card.id.toString()}>
                      <div className="flex items-center gap-2">
                        {card.certStatus === "verified" && card.certCompany ? (
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            CERT_COMPANY_COLORS[card.certCompany] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                            {CERT_COMPANY_LABELS[card.certCompany] ?? card.certCompany.toUpperCase()} {card.certGrade}
                          </span>
                        ) : (
                          <ShieldQuestion className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        )}
                        <span className="font-medium">{card.name}</span>
                        {card.setName && <span className="text-slate-400">· {card.setName}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedCard && (
              <div className={cn(
                "flex items-center gap-2 p-2.5 rounded-xl border",
                selectedIsVerified ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200",
              )}>
                {selectedCard.imageUrl && (
                  <img src={selectedCard.imageUrl} alt={selectedCard.name} className="h-12 w-9 object-contain rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{selectedCard.name}</p>
                  <p className="text-xs text-slate-500">
                    {[selectedCard.rarity, selectedCard.condition].filter(Boolean).join(" · ")}
                    {selectedCard.estimatedValue && ` · ~$${parseFloat(selectedCard.estimatedValue).toFixed(2)}`}
                  </p>
                  {selectedIsVerified && selectedCard.certCompany && (
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded border",
                      CERT_COMPANY_COLORS[selectedCard.certCompany] ?? "")}>
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {CERT_COMPANY_LABELS[selectedCard.certCompany]} {selectedCard.certGrade} · Verified
                    </span>
                  )}
                  {!selectedIsVerified && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-1">
                      <ShieldQuestion className="h-2.5 w-2.5" />
                      Not graded — open card detail to submit a cert
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Floor Price (pathUSD)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={floorPrice}
              onChange={(e) => setFloorPrice(parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-slate-400">
              The agent lists your card at this price. Any buyer meeting it completes the sale.
            </p>
          </div>

          {selectedCard && !selectedIsVerified && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
              <ShieldQuestion className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Unverified card.</strong> In production, only PSA/BGS/CGC-verified cards are eligible for agent transactions.
                You can still create this agent now, but submit a grading cert on the card detail page to enable production-ready selling.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Your card will be listed on the marketplace at your floor price. Real buyers and buyer agents can both purchase it. Once sold, the agent marks itself complete.
            </span>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
