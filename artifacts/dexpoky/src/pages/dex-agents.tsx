import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Bot,
  Plus,
  Trash2,
  Play,
  Pause,
  Zap,
  Wallet,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuthFetch } from "@/lib/use-auth-fetch";

interface TempoWalletInfo {
  address: string;
  network: string;
  token: string;
  balance: string;
  faucetUrl: string;
  explorerUrl: string;
  createdAt: string;
}

interface DexAgent {
  id: number;
  clerkId: string;
  name: string;
  pokemonName: string;
  triggerType: "buy_now" | "bid";
  maxPricePathUsd: string;
  budgetPathUsd: string;
  spentPathUsd: string;
  requireHoloOnly: boolean;
  requireCondition: string | null;
  status: "active" | "paused" | "budget_exhausted";
  runsCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateAgentForm {
  name: string;
  pokemonName: string;
  triggerType: "buy_now" | "bid";
  maxPricePathUsd: number;
  budgetPathUsd: number;
  requireHoloOnly: boolean;
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

export default function DexAgentsPage() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  const { data: wallet, isLoading: walletLoading } = useQuery<TempoWalletInfo>({
    queryKey: ["tempo-wallet"],
    queryFn: () => authFetch("/api/agents/wallet").then((r) => r.json()),
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery<DexAgent[]>({
    queryKey: ["dex-agents"],
    queryFn: () => authFetch("/api/agents").then((r) => r.json()),
  });

  const { data: runs = [] } = useQuery<AgentRun[]>({
    queryKey: ["agent-runs"],
    queryFn: () => authFetch("/api/agents/runs").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const [copiedAddr, setCopiedAddr] = useState(false);

  function copyAddress() {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
    toast.success("Address copied");
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Bot className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DexAgents</h1>
            <p className="text-sm text-slate-500">Autonomous card-buying agents powered by Tempo stablecoins</p>
          </div>
        </div>

        <WalletPanel wallet={wallet} loading={walletLoading} onCopy={copyAddress} copied={copiedAddr} />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">My Agents</h2>
          <CreateAgentDialog onCreated={() => qc.invalidateQueries({ queryKey: ["dex-agents"] })} />
        </div>

        {agentsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : agents.length === 0 ? (
          <EmptyAgents />
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                runs={runs.filter((r) => r.agentId === agent.id)}
                onChanged={() => {
                  qc.invalidateQueries({ queryKey: ["dex-agents"] });
                  qc.invalidateQueries({ queryKey: ["agent-runs"] });
                }}
              />
            ))}
          </div>
        )}

        <ActivityFeed runs={runs} agents={agents} />
      </div>
    </Layout>
  );
}

function WalletPanel({
  wallet,
  loading,
  onCopy,
  copied,
}: {
  wallet?: TempoWalletInfo;
  loading: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-700">Tempo Testnet Wallet</span>
        <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700 border-0">
          pathUSD
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
      ) : wallet ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="text-xs text-slate-600 bg-white/70 px-2 py-1 rounded-lg font-mono truncate max-w-[260px]">
              {wallet.address}
            </code>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCopy}>
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
            </Button>
          </div>

          <div className="flex items-end gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Balance</p>
              <p className="text-3xl font-bold text-slate-900">
                {parseFloat(wallet.balance).toFixed(2)}
                <span className="text-base font-medium text-slate-500 ml-1">pathUSD</span>
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <a
              href={wallet.faucetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-white/80 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Get free pathUSD from faucet
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={wallet.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white/80 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on Explorer
            </a>
          </div>

          <div className="flex items-start gap-2 text-xs text-violet-600 bg-violet-50/80 rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>This is a Tempo Testnet wallet. pathUSD is free test tokens — no real money involved. Visit the faucet to fund your agent.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyAgents() {
  return (
    <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200">
      <Bot className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">No DexAgents yet</p>
      <p className="text-sm text-slate-400 mt-1">Create an agent to automatically buy cards using pathUSD stablecoins</p>
    </div>
  );
}

const statusColorMap: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  budget_exhausted: "bg-red-100 text-red-600",
};

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

  const spent = parseFloat(agent.spentPathUsd);
  const budget = parseFloat(agent.budgetPathUsd);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  const toggleMutation = useMutation({
    mutationFn: () =>
      authFetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: agent.status === "active" ? "paused" : "active" }),
      }),
    onSuccess: () => {
      toast.success(agent.status === "active" ? "Agent paused" : "Agent activated");
      onChanged();
    },
    onError: () => toast.error("Failed to update agent"),
  });

  const triggerMutation = useMutation({
    mutationFn: (): Promise<{ matched: boolean; cardName?: string; pricePathUsd?: string; note?: string }> =>
      authFetch(`/api/agents/${agent.id}/trigger`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data?.matched) {
        toast.success(`Agent bought "${data.cardName}" for ${data.pricePathUsd} pathUSD`);
      } else {
        toast.info(data?.note ?? "No matching listings found");
      }
      onChanged();
    },
    onError: () => toast.error("Trigger failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      authFetch(`/api/agents/${agent.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Agent deleted");
      onChanged();
    },
    onError: () => toast.error("Failed to delete agent"),
  });

  const statusColor = statusColorMap[agent.status] ?? "bg-slate-100 text-slate-600";

  const statusLabel = agent.status === "budget_exhausted"
    ? "Budget Exhausted"
    : agent.status === "active"
      ? "Active"
      : "Paused";

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{agent.name}</span>
              <Badge className={cn("text-xs border-0", statusColor)}>
                {statusLabel}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {agent.triggerType === "buy_now" ? "Buy Now" : "Bid"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Watching for <span className="font-medium text-slate-700">{agent.pokemonName}</span>
              {" · "}max <span className="font-medium text-slate-700">{parseFloat(agent.maxPricePathUsd).toFixed(2)} pathUSD</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending || agent.status === "budget_exhausted"}
              title={agent.status === "active" ? "Pause" : "Activate"}
            >
              {agent.status === "active"
                ? <Pause className="h-4 w-4 text-amber-500" />
                : <Play className="h-4 w-4 text-green-600" />}
            </Button>

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

        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Budget used</span>
            <span>{spent.toFixed(2)} / {budget.toFixed(2)} pathUSD</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-violet-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {agent.runsCount > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
            <span>{agent.runsCount} run{agent.runsCount !== 1 ? "s" : ""}</span>
            {agent.lastRunAt && <span>Last ran {format(new Date(agent.lastRunAt), "MMM d, h:mm a")}</span>}
          </div>
        )}
      </div>

      {runs.length > 0 && (
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
              {runs.slice(0, 5).map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: AgentRun }) {
  const isSuccess = run.status === "success";
  const isSim = run.status === "simulated";

  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        {isSuccess
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          : isSim
            ? <Zap className="h-3.5 w-3.5 text-violet-400" />
            : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-slate-600">{run.note}</span>
        {run.tempoTxHash && (
          <a
            href={`https://explorer.testnet.tempo.xyz/tx/${run.tempoTxHash}`}
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

function ActivityFeed({ runs, agents }: { runs: AgentRun[]; agents: DexAgent[] }) {
  if (runs.length === 0) return null;

  const agentMap = new Map(agents.map((a) => [a.id, a.name]));
  const recent = runs.slice(0, 20);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {recent.map((run) => (
          <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="shrink-0">
              {run.status === "success"
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : run.status === "simulated"
                  ? <Zap className="h-4 w-4 text-violet-400" />
                  : <Clock className="h-4 w-4 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-600">{agentMap.get(run.agentId) ?? `Agent #${run.agentId}`}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 truncate">{run.note}</span>
              </div>
              {run.amountPathUsd && (
                <p className="text-xs text-violet-600 mt-0.5">{parseFloat(run.amountPathUsd).toFixed(4)} pathUSD</p>
              )}
            </div>
            <span className="text-xs text-slate-400 shrink-0">{format(new Date(run.createdAt), "MMM d, h:mm a")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateAgentDialog({ onCreated }: { onCreated: () => void }) {
  const authFetch = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateAgentForm>({
    name: "",
    pokemonName: "",
    triggerType: "buy_now",
    maxPricePathUsd: 5,
    budgetPathUsd: 50,
    requireHoloOnly: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast.success("DexAgent created!");
      setOpen(false);
      setForm({ name: "", pokemonName: "", triggerType: "buy_now", maxPricePathUsd: 5, budgetPathUsd: 50, requireHoloOnly: false });
      onCreated();
    },
    onError: () => toast.error("Failed to create agent"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-600" />
            Create DexAgent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name" className="text-sm font-medium">Agent Name</Label>
            <Input
              id="agent-name"
              placeholder="e.g. Charizard Hunter"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pokemon-name" className="text-sm font-medium">Watch for Pokémon</Label>
            <Input
              id="pokemon-name"
              placeholder="e.g. Charizard, Pikachu, Mewtwo"
              value={form.pokemonName}
              onChange={(e) => setForm((f) => ({ ...f, pokemonName: e.target.value }))}
            />
            <p className="text-xs text-slate-400">Matches any card containing this name</p>
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

          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Your agent will scan the marketplace every minute and automatically buy matching cards using your Tempo Testnet wallet.
              Make sure you have pathUSD — visit the faucet if needed.
            </span>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!form.name || !form.pokemonName || form.maxPricePathUsd <= 0 || form.budgetPathUsd <= 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
