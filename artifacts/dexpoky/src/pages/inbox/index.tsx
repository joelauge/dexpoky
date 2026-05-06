import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearch } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListThreads,
  useListThreadMessages,
  useSendMessage,
  useMarkThreadRead,
  useListCards,
} from "@workspace/api-client-react";
import type { DmThreadSummary, DmMessage } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Send, ArrowLeft, User, Heart,
  Video, DollarSign, CheckCircle2, XCircle, RefreshCw,
  Store, Shield, Gem, Calendar, MapPin, X, Lock, CreditCard, Banknote,
  Package, Navigation, Loader2, Search, Wallet, Clock,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthFetch } from "@/lib/use-auth-fetch";

// ── Types ──────────────────────────────────────────────────────────────────

type OfferStatus = "pending" | "countered" | "accepted" | "declined" | "cancelled" | "paid";
type EscrowMethod = "store" | "psa_vault" | "courtyard_nft" | "paypal_gs" | "escrow_com" | "cash_in_person" | "dexpoky_pay";

interface OfferedCard {
  cardId: number;
  cardName: string;
  imageUrl: string | null;
  estimatedValue: number | null;
  rarity: string | null;
  condition: string | null;
}

interface OfferHistoryEntry {
  amount: number;
  cards?: OfferedCard[];
  from: "buyer" | "seller";
  sentAt: string;
  note?: string;
}

interface TradeOffer {
  id: number;
  threadId: number;
  sellerClerkId: string;
  sellerImages: string[] | null;
  sellerVideo: string | null;
  askingPrice: number | null;
  offerAmount: number | null;
  offerHistory: OfferHistoryEntry[];
  status: OfferStatus;
  exchangeMethod: EscrowMethod | null;
  videoCallScheduledAt: string | null;
  videoCallNotes: string | null;
  videoCallConfirmedByBuyer: boolean;
  videoCallConfirmedBySeller: boolean;
  meetupLocation: string | null;
  meetupProposedAt: string | null;
  meetupNotes: string | null;
  createdAt: string;
  updatedAt: string;
  role: "buyer" | "seller";
}

type ActiveAction = null | "offer" | "video" | "meetup";

type ThreadItem =
  | { kind: "msg";    msg: DmMessage;                                           ts: number }
  | { kind: "offer";  entry: OfferHistoryEntry; isInitial: boolean;             ts: number }
  | { kind: "video";  scheduledAt: Date; notes: string | null; confirmedByBuyer: boolean; confirmedBySeller: boolean; ts: number }
  | { kind: "meetup"; location: string; proposedAt: Date; notes: string | null; ts: number }
  | { kind: "status"; status: OfferStatus; finalAmount: number | null;          ts: number };

// ── Escrow options ─────────────────────────────────────────────────────────

const ESCROW_OPTIONS: {
  id: EscrowMethod;
  label: string;
  desc: string;
  Icon: React.ElementType;
  color: string;
}[] = [
  {
    id: "dexpoky_pay",
    label: "Pay with DexPoky",
    desc: "Credit card or wallet balance — fast, secure, in-app payment with 3% platform fee",
    Icon: Wallet,
    color: "bg-emerald-50 border-emerald-300 text-emerald-700",
  },
  {
    id: "store",
    label: "Meet at Card Shop",
    desc: "In-person exchange — staff validates authenticity on the spot",
    Icon: Store,
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    id: "escrow_com",
    label: "Escrow.com",
    desc: "Buyer deposits funds into escrow, card ships, funds release on receipt",
    Icon: Lock,
    color: "bg-violet-50 border-violet-200 text-violet-700",
  },
  {
    id: "paypal_gs",
    label: "PayPal Goods & Services",
    desc: "Full PayPal purchase protection for the buyer",
    Icon: CreditCard,
    color: "bg-sky-50 border-sky-200 text-sky-700",
  },
  {
    id: "cash_in_person",
    label: "Cash in Person",
    desc: "Meet up and exchange the card + cash face to face",
    Icon: Banknote,
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    id: "psa_vault",
    label: "PSA Vault Transfer",
    desc: "Secure transfer through PSA's vault service (graded slabs)",
    Icon: Shield,
    color: "bg-purple-50 border-purple-200 text-purple-700",
  },
  {
    id: "courtyard_nft",
    label: "Courtyard NFT",
    desc: "Tokenized physical card transfer through Courtyard",
    Icon: Gem,
    color: "bg-rose-50 border-rose-200 text-rose-700",
  },
];

// ── ThreadListItem ─────────────────────────────────────────────────────────

function ThreadListItem({
  thread,
  isActive,
  onClick,
}: {
  thread: DmThreadSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  const hasUnread = thread.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 flex items-start gap-3",
        isActive && "bg-primary/5 border-l-2 border-l-primary",
      )}
    >
      <div className="shrink-0 mt-0.5">
        {thread.otherUserImageUrl ? (
          <img
            src={thread.otherUserImageUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>
            {thread.otherUserDisplayName ?? "Unknown user"}
          </span>
          {thread.lastMessage && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(thread.lastMessage.createdAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mb-1">
          <Heart className="h-3 w-3 text-rose-400 fill-rose-200 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {thread.wantedCardName ?? "Trade"}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1 py-0 h-4 border-0 ml-auto shrink-0",
              thread.role === "buyer"
                ? "bg-blue-50 text-blue-600"
                : "bg-emerald-50 text-emerald-600",
            )}
          >
            {thread.role === "buyer" ? "Buyer" : "Seller"}
          </Badge>
        </div>
        {thread.lastMessage ? (
          <p className={cn("text-xs truncate", hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
            {thread.lastMessage.content}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No messages yet</p>
        )}
      </div>
      {hasUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />}
    </button>
  );
}

// ── TradeThread ─────────────────────────────────────────────────────────────

function TradeThread({
  thread,
  currentUserId,
}: {
  thread: DmThreadSummary;
  currentUserId: string;
}) {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [inputText, setInputText] = useState("");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [videoDate, setVideoDate] = useState("");
  const [videoNotes, setVideoNotes] = useState("");
  const [meetupLocation, setMeetupLocation] = useState("");
  const [meetupNotes, setMeetupNotes] = useState("");
  const [shopResults, setShopResults] = useState<{ name: string; address: string; label: string }[]>([]);
  const [shopSearching, setShopSearching] = useState(false);
  const [offer, setOffer] = useState<TradeOffer | null | undefined>(undefined);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedCards, setSelectedCards] = useState<OfferedCard[]>([]);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [cardSearch, setCardSearch] = useState("");

  const { data: myCards } = useListCards(undefined, {
    query: {
      enabled: activeAction === "offer",
      queryKey: ["/api/cards"],
    },
  });

  // ── Fetch offer ──────────────────────────────────────────────────────────

  const fetchOffer = useCallback(async () => {
    try {
      const res = await authFetch(`/api/threads/${thread.id}/offer`);
      if (!res.ok) { setOffer(null); return; }
      const data = await res.json();
      setOffer(data);
    } catch {
      setOffer(null);
    }
  }, [thread.id, authFetch]);

  useEffect(() => {
    setOffer(undefined);
    fetchOffer();
    const interval = setInterval(fetchOffer, 6000);
    return () => clearInterval(interval);
  }, [fetchOffer]);

  // ── Wallet balance (fetch when dexpoky_pay is selected or deal is accepted) ──
  useEffect(() => {
    if (offer?.status === "accepted" && offer.exchangeMethod === "dexpoky_pay" && offer.role === "buyer") {
      authFetch("/api/wallet/balance")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d != null) setWalletBalance(d.balanceCents ?? 0); })
        .catch(() => {});
    }
  }, [offer?.status, offer?.exchangeMethod, offer?.role, authFetch]);

  // ── Payment ───────────────────────────────────────────────────────────────
  const handleCardPayment = async () => {
    setPaying(true);
    try {
      const res = await authFetch(`/api/threads/${thread.id}/payment/checkout`, { method: "POST" });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast.error(json.error ?? "Could not initiate payment");
        setPaying(false);
      }
    } catch {
      toast.error("Something went wrong");
      setPaying(false);
    }
  };

  const handleWalletPayment = async () => {
    setPaying(true);
    try {
      const res = await authFetch(`/api/threads/${thread.id}/payment/wallet`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        toast.success("Payment sent from your wallet!");
        await fetchOffer();
      } else {
        toast.error(json.error ?? "Payment failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPaying(false);
    }
  };

  // ── Messages ─────────────────────────────────────────────────────────────

  const { data: messages, isLoading: msgsLoading } = useListThreadMessages(thread.id, {
    query: {
      queryKey: ["/api/threads", thread.id, "messages"],
      refetchInterval: 5000,
    },
  });

  const markRead = useMarkThreadRead();
  const sendMsg = useSendMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/threads", thread.id, "messages"] });
        qc.invalidateQueries({ queryKey: ["/api/threads"] });
        setInputText("");
      },
      onError: () => toast.error("Failed to send message"),
    },
  });

  useEffect(() => {
    if (messages && messages.length > 0 && thread.unreadCount > 0) {
      markRead.mutate({ threadId: thread.id });
    }
  }, [messages, thread.id, thread.unreadCount]);

  // ── Build unified event list ─────────────────────────────────────────────

  const eventList = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [];

    for (const msg of (messages as DmMessage[] | undefined) ?? []) {
      items.push({ kind: "msg", msg, ts: new Date(msg.createdAt).getTime() });
    }

    if (offer) {
      const history = offer.offerHistory ?? [];

      if (history.length === 0 && offer.askingPrice != null) {
        // Legacy offer with no stored history — synthesize from askingPrice
        items.push({
          kind: "offer",
          entry: { amount: offer.askingPrice, from: "seller", sentAt: offer.createdAt },
          ts: new Date(offer.createdAt).getTime(),
          isInitial: true,
        });
      } else {
        for (let i = 0; i < history.length; i++) {
          items.push({
            kind: "offer",
            entry: history[i],
            ts: new Date(history[i].sentAt).getTime(),
            isInitial: i === 0,
          });
        }
      }

      if (offer.videoCallScheduledAt) {
        items.push({
          kind: "video",
          scheduledAt: new Date(offer.videoCallScheduledAt),
          notes: offer.videoCallNotes,
          confirmedByBuyer: offer.videoCallConfirmedByBuyer ?? false,
          confirmedBySeller: offer.videoCallConfirmedBySeller ?? false,
          ts: new Date(offer.videoCallScheduledAt).getTime() - 500,
        });
      }

      if (offer.meetupLocation && offer.meetupProposedAt) {
        items.push({
          kind: "meetup",
          location: offer.meetupLocation,
          proposedAt: new Date(offer.meetupProposedAt),
          notes: offer.meetupNotes,
          ts: new Date(offer.meetupProposedAt).getTime() - 500,
        });
      }

      if (
        offer.status === "accepted" ||
        offer.status === "declined" ||
        offer.status === "cancelled" ||
        offer.status === "paid"
      ) {
        const last = (offer.offerHistory ?? [])[offer.offerHistory.length - 1];
        items.push({
          kind: "status",
          status: offer.status,
          finalAmount: last?.amount ?? offer.askingPrice ?? null,
          ts: new Date(offer.updatedAt).getTime(),
        });
      }
    }

    return items.sort((a, b) => a.ts - b.ts);
  }, [messages, offer]);

  // Scroll to bottom when events change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventList.length]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const myRole = offer?.role ?? null;
  const history = offer?.offerHistory ?? [];
  const lastHistoryEntry = history[history.length - 1] ?? null;

  const myTurn: boolean =
    !offer ? false
    : offer.status === "pending"   ? myRole === "buyer"
    : offer.status === "countered" ? lastHistoryEntry?.from !== myRole
    : false;

  const isActive = offer?.status === "pending" || offer?.status === "countered";
  const activeOfferAmount = lastHistoryEntry?.amount ?? offer?.askingPrice ?? null;

  // ── Actions ──────────────────────────────────────────────────────────────

  const doAction = async (body: Record<string, unknown>) => {
    setUpdating(true);
    try {
      const res = await authFetch(`/api/threads/${thread.id}/offer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "Action failed");
      }
      const updated = await res.json();
      setOffer(updated);
      setActiveAction(null);
      setCounterAmount(""); setCounterNote("");
      setVideoDate(""); setVideoNotes("");
      setMeetupLocation(""); setMeetupNotes("");
      setSelectedCards([]); setShowCardPicker(false); setCardSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setUpdating(false);
    }
  };

  const sendCounter = () => {
    const amt = parseFloat(counterAmount) || 0;
    if (amt === 0 && selectedCards.length === 0) {
      toast.error("Add a cash amount or select at least one card to offer");
      return;
    }
    doAction({
      action: "counter",
      amount: amt,
      cards: selectedCards.length > 0 ? selectedCards.map(c => ({ cardId: c.cardId })) : undefined,
      notes: counterNote || undefined,
    });
  };

  const sendVideoCall = () => {
    if (videoDate) {
      doAction({
        action: "schedule_video",
        scheduledAt: new Date(videoDate).toISOString(),
        notes: videoNotes || undefined,
      });
    }
  };

  const sendMeetup = () => {
    if (meetupLocation.trim()) {
      doAction({
        action: "schedule_meetup",
        location: meetupLocation.trim(),
        notes: meetupNotes || undefined,
      });
    }
  };

  const searchNearbyShops = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setShopSearching(true);
    setShopResults([]);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const query = `[out:json][timeout:15];
(
  node["shop"~"games|hobby|toys|collectibles"](around:25000,${lat},${lng});
  way["shop"~"games|hobby|toys|collectibles"](around:25000,${lat},${lng});
  node["name"~"card|tcg|pokemon|magic|trading|yugioh|yu-gi-oh|collectible",i](around:25000,${lat},${lng});
  way["name"~"card|tcg|pokemon|magic|trading|yugioh|yu-gi-oh|collectible",i](around:25000,${lat},${lng});
);
out center 25;`;
          const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query,
          });
          if (!res.ok) throw new Error("Overpass API error");
          const data = await res.json() as { elements: Record<string, unknown>[] };

          type OsmEl = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } };
          const seen = new Set<string>();
          const shops = (data.elements as OsmEl[])
            .filter(el => el.tags?.name)
            .map(el => {
              const tags = el.tags!;
              const name = tags.name;
              const street = tags["addr:housenumber"] && tags["addr:street"]
                ? `${tags["addr:housenumber"]} ${tags["addr:street"]}`
                : tags["addr:street"] ?? "";
              const city = tags["addr:city"] ?? "";
              const state = tags["addr:state"] ?? "";
              const address = [street, city, state].filter(Boolean).join(", ") || "Address not listed";
              const label = address !== "Address not listed" ? `${name}, ${address}` : name;
              return { name, address, label };
            })
            .filter(s => {
              if (seen.has(s.name)) return false;
              seen.add(s.name);
              return true;
            })
            .slice(0, 10);

          setShopResults(shops);
          if (shops.length === 0) {
            toast.info("No card shops found within 25 km. Try typing the address manually.");
          }
        } catch {
          toast.error("Search failed — please type the address manually.");
        } finally {
          setShopSearching(false);
        }
      },
      () => {
        setShopSearching(false);
        toast.error("Location access denied — please type the store address manually.");
      },
      { timeout: 10000 },
    );
  };

  const handleSendMessage = () => {
    const content = inputText.trim();
    if (!content) return;
    sendMsg.mutate({ threadId: thread.id, data: { content } });
  };

  const toggleAction = (a: ActiveAction) =>
    setActiveAction(v => (v === a ? null : a));

  // ── Render helpers ────────────────────────────────────────────────────────

  const offerItems = eventList.filter(e => e.kind === "offer");

  function renderItem(item: ThreadItem, idx: number) {
    // ── Text message ─────────────────────────────────────────────────────
    if (item.kind === "msg") {
      const isMe = item.msg.senderClerkId === currentUserId;
      return (
        <div key={`msg-${item.msg.id}`} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
              isMe
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm",
            )}
          >
            <p>{item.msg.content}</p>
            <p className={cn("text-[10px] mt-1", isMe ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
              {formatDistanceToNow(new Date(item.msg.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
      );
    }

    // ── Offer bubble ──────────────────────────────────────────────────────
    if (item.kind === "offer") {
      const isMe = item.entry.from === myRole;
      const isLatest = offerItems[offerItems.length - 1] === item;
      const canAct = isLatest && myTurn && isActive;
      const label = item.isInitial
        ? item.entry.from === "seller" ? "Asking Price" : "Opening Offer"
        : item.entry.from === "seller" ? "Seller Counter" : "Buyer Counter";

      return (
        <div key={`offer-${idx}`} className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
          <div
            className={cn(
              "w-[min(280px,82%)] rounded-2xl border-2 overflow-hidden shadow-sm",
              isMe
                ? "rounded-br-sm border-primary/30 bg-primary/5"
                : "rounded-bl-sm border-amber-300 bg-amber-50",
            )}
          >
            {/* Label bar */}
            <div
              className={cn(
                "px-4 py-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider",
                isMe ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700",
              )}
            >
              <DollarSign className="h-3 w-3" />
              {label}
            </div>
            {/* Amount */}
            <div className="px-4 pt-3 pb-2">
              {item.entry.amount > 0 && (
                <div className={cn("text-3xl font-bold tabular-nums", isMe ? "text-primary" : "text-amber-800")}>
                  ${item.entry.amount.toFixed(2)}
                </div>
              )}
              {item.entry.amount === 0 && (!item.entry.cards || item.entry.cards.length === 0) && (
                <div className={cn("text-3xl font-bold tabular-nums", isMe ? "text-primary" : "text-amber-800")}>
                  $0.00
                </div>
              )}
              {/* Offered cards strip */}
              {item.entry.cards && item.entry.cards.length > 0 && (
                <div className={cn("mt-2", item.entry.amount > 0 && "border-t pt-2")}>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide mb-1.5", isMe ? "text-primary/70" : "text-amber-700/70")}>
                    <Package className="inline h-2.5 w-2.5 mr-0.5" />
                    {item.entry.amount > 0 ? "+" : ""}{item.entry.cards.length} card{item.entry.cards.length > 1 ? "s" : ""} included
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {item.entry.cards.map(c => (
                      <div key={c.cardId} className="flex flex-col items-center">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.cardName} className="w-10 h-14 rounded-md object-cover border border-border/50 shadow-sm" />
                        ) : (
                          <div className="w-10 h-14 rounded-md border border-border/50 bg-muted flex items-center justify-center">
                            <Package className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-[8px] text-muted-foreground truncate w-10 text-center mt-0.5 leading-tight">{c.cardName}</p>
                      </div>
                    ))}
                  </div>
                  {item.entry.cards.some(c => c.estimatedValue != null) && (
                    <p className={cn("text-[10px] mt-1.5", isMe ? "text-primary/60" : "text-amber-700/60")}>
                      Cards est. ~${item.entry.cards.reduce((s, c) => s + (c.estimatedValue ?? 0), 0).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {item.entry.note && (
                <p className="text-xs text-muted-foreground mt-1.5 italic">{item.entry.note}</p>
              )}
              <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                {format(new Date(item.entry.sentAt), "MMM d, h:mm a")}
              </p>
            </div>
            {/* Action buttons when it's your turn */}
            {canAct && (() => {
              const hasCards = (item.entry.cards?.length ?? 0) > 0;
              const acceptLabel = hasCards
                ? `Accept (${item.entry.amount > 0 ? `$${item.entry.amount.toFixed(2)} + ` : ""}${item.entry.cards!.length} card${item.entry.cards!.length > 1 ? "s" : ""})`
                : `Accept $${item.entry.amount.toFixed(2)}`;
              return (
                <div className="border-t px-3 py-2.5 flex flex-col gap-1.5 bg-white/60">
                  <Button
                    size="sm"
                    className="w-full h-8 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                    disabled={updating}
                    onClick={() => doAction({ action: "accept" })}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    {acceptLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs"
                    disabled={updating}
                    onClick={() => toggleAction("offer")}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Counter Offer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                    disabled={updating}
                    onClick={() => doAction({ action: "decline" })}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Decline
                  </Button>
                </div>
              );
            })()}
          </div>
          {/* Waiting label */}
          {!canAct && isLatest && isActive && !isMe && (
            <p className="text-[10px] text-muted-foreground px-2">Waiting for their response…</p>
          )}
          {!canAct && isLatest && isActive && isMe && (
            <p className="text-[10px] text-muted-foreground px-2">Awaiting reply</p>
          )}
        </div>
      );
    }

    // ── Video call event ──────────────────────────────────────────────────
    if (item.kind === "video") {
      const iAmBuyer = myRole === "buyer";
      const confirmedByMe = iAmBuyer ? item.confirmedByBuyer : item.confirmedBySeller;
      const bothConfirmed = item.confirmedByBuyer && item.confirmedBySeller;
      return (
        <div key={`video-${idx}`} className="flex justify-center">
          <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-blue-700 max-w-xs w-full">
            <div className="flex items-center gap-2.5">
              <Video className="h-4 w-4 shrink-0 text-blue-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Video call scheduled</p>
                <p className="text-xs text-blue-600">
                  {format(item.scheduledAt, "EEEE, MMM d 'at' h:mm a")}
                </p>
                {item.notes && (
                  <p className="text-[11px] text-blue-500 mt-0.5">{item.notes}</p>
                )}
              </div>
              {!bothConfirmed && (
                <button
                  type="button"
                  title="Cancel video call"
                  onClick={() => doAction({ action: "cancel_video" })}
                  className="shrink-0 text-blue-300 hover:text-blue-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Confirmation row */}
            {bothConfirmed ? (
              <div className="flex items-center gap-1.5 bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <p className="text-[11px] text-emerald-700 font-medium">Both parties confirmed the call happened</p>
              </div>
            ) : confirmedByMe ? (
              <div className="flex items-center gap-1.5 text-blue-500 text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>You confirmed — waiting for them</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] w-full border-blue-300 text-blue-700 hover:bg-blue-100"
                disabled={updating}
                onClick={() => doAction({ action: "confirm_video" })}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Confirm call happened
              </Button>
            )}
          </div>
        </div>
      );
    }

    // ── Meetup event ──────────────────────────────────────────────────────
    if (item.kind === "meetup") {
      return (
        <div key={`meetup-${idx}`} className="flex justify-center">
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-emerald-700 max-w-xs">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">Meetup proposed</p>
              <p className="text-xs text-emerald-600 truncate">{item.location}</p>
              {item.notes && (
                <p className="text-[11px] text-emerald-500 mt-0.5">{item.notes}</p>
              )}
            </div>
            {isActive && (
              <button
                type="button"
                title="Cancel meetup"
                onClick={() => doAction({ action: "cancel_meetup" })}
                className="shrink-0 text-emerald-300 hover:text-emerald-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── Status terminal event ─────────────────────────────────────────────
    if (item.kind === "status") {
      const cfgMap: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
        accepted:  { label: "Deal agreed!",   color: "bg-emerald-100 border-emerald-300 text-emerald-700", Icon: CheckCircle2 },
        declined:  { label: "Offer declined", color: "bg-red-100 border-red-200 text-red-600",             Icon: XCircle      },
        cancelled: { label: "Cancelled",      color: "bg-muted border-border text-muted-foreground",        Icon: XCircle      },
      };
      const cfg = cfgMap[item.status] ?? { label: item.status, color: "bg-muted border-border text-muted-foreground", Icon: CheckCircle2 };

      return (
        <div key={`status-${idx}`} className="flex justify-center py-1">
          <div className={cn("flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm font-semibold", cfg.color)}>
            <cfg.Icon className="h-4 w-4 shrink-0" />
            {cfg.label}
            {item.status === "accepted" && item.finalAmount != null && (
              <span className="font-bold ml-0.5">— ${item.finalAmount.toFixed(2)}</span>
            )}
          </div>
        </div>
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Thread header ──────────────────────────────────────────────── */}
      <div className="border-b px-4 py-3 flex items-center gap-3 bg-card shrink-0">
        {thread.otherUserImageUrl ? (
          <img src={thread.otherUserImageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{thread.otherUserDisplayName ?? "Unknown user"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Heart className="h-3 w-3 text-rose-400 fill-rose-100" />
            {thread.wantedCardName ?? "Trade conversation"}
          </p>
        </div>
        {offer && (
          <Badge
            className={cn(
              "text-[10px] px-2 py-0.5 border shrink-0",
              offer.status === "pending"   && "bg-amber-100 text-amber-700 border-amber-200",
              offer.status === "countered" && "bg-blue-100 text-blue-700 border-blue-200",
              offer.status === "accepted"  && "bg-emerald-100 text-emerald-700 border-emerald-200",
              (offer.status === "declined" || offer.status === "cancelled") &&
                "bg-muted text-muted-foreground border-border",
            )}
          >
            {offer.status === "pending"   ? "Offer open"     :
             offer.status === "countered" ? (myTurn ? "Your turn ↩" : "Awaiting reply") :
             offer.status === "accepted"  ? "Agreed ✓"       :
             offer.status === "declined"  ? "Declined"       : "Cancelled"}
          </Badge>
        )}
      </div>

      {/* ── Seller media strip ─────────────────────────────────────────── */}
      {offer &&
        ((offer.sellerImages && offer.sellerImages.length > 0) || offer.sellerVideo) && (
          <div className="border-b px-4 py-2 flex gap-2 overflow-x-auto bg-muted/20 shrink-0">
            {offer.sellerImages?.map((path, i) => (
              <img
                key={i}
                src={`/api/storage${path}`}
                alt=""
                className="w-14 rounded-lg border object-cover shrink-0"
                style={{ height: 68 }}
              />
            ))}
            {offer.sellerVideo && (
              <video
                src={`/api/storage${offer.sellerVideo}`}
                controls
                className="w-24 rounded-lg border shrink-0 bg-black"
                style={{ height: 68 }}
              />
            )}
          </div>
        )}

      {/* ── Event stream ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
        {msgsLoading && offer === undefined ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-3/4 rounded-2xl" />
            ))}
          </div>
        ) : eventList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Start the conversation below</p>
          </div>
        ) : (
          eventList.map((item, idx) => renderItem(item, idx))
        )}

        {/* ── Escrow picker (when accepted, method not yet chosen) ─────── */}
        {offer?.status === "accepted" && !offer.exchangeMethod && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-emerald-800">
                  Deal agreed at ${activeOfferAmount?.toFixed(2) ?? "—"}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Choose how you'll securely exchange the card and payment.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {ESCROW_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={updating}
                  onClick={() => doAction({ action: "set_exchange", method: opt.id })}
                  className={cn(
                    "text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all hover:shadow-sm active:scale-[0.99]",
                    opt.color,
                  )}
                >
                  <opt.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── DexPoky Pay panel ────────────────────────────────────────── */}
        {offer?.status === "accepted" && offer.exchangeMethod === "dexpoky_pay" && (() => {
          const agreedAmount = offer.offerAmount ?? offer.askingPrice ?? 0;
          const amountCents = Math.round(agreedAmount * 100);
          const isBuyer = offer.role === "buyer";
          const hasEnough = walletBalance !== null && walletBalance >= amountCents;

          return (
            <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4 space-y-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-emerald-800">Pay with DexPoky — ${agreedAmount.toFixed(2)}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {isBuyer ? "Choose how you'd like to pay the seller." : "Waiting for buyer to complete payment…"}
                  </p>
                </div>
              </div>

              {isBuyer && (
                <div className="space-y-2">
                  {/* Wallet option */}
                  <div className={cn(
                    "rounded-xl border-2 p-3 space-y-2 transition-colors",
                    hasEnough ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-muted/30 opacity-70",
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        <p className="text-sm font-semibold">Pay from Wallet</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Balance: {walletBalance !== null ? `$${(walletBalance / 100).toFixed(2)}` : "—"}
                      </p>
                    </div>
                    {hasEnough ? (
                      <Button
                        size="sm"
                        className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        disabled={paying}
                        onClick={handleWalletPayment}
                      >
                        {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Pay ${agreedAmount.toFixed(2)} instantly
                      </Button>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">Insufficient balance</p>
                        <a href="/wallet" className="text-[11px] text-emerald-700 font-semibold hover:underline">Top up →</a>
                      </div>
                    )}
                  </div>

                  {/* Card option */}
                  <div className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-sky-600" />
                      <p className="text-sm font-semibold">Pay by Card</p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 bg-sky-600 hover:bg-sky-700 text-white text-xs"
                      disabled={paying}
                      onClick={handleCardPayment}
                    >
                      {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Pay ${agreedAmount.toFixed(2)} with Stripe
                    </Button>
                    <p className="text-[11px] text-muted-foreground">Redirects to Stripe checkout. Cards are not stored on DexPoky.</p>
                  </div>

                  <p className="text-[11px] text-muted-foreground text-center">3% platform fee included. Seller receives ${(agreedAmount * 0.97).toFixed(2)}.</p>
                </div>
              )}

              {!isBuyer && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  <Clock className="h-3.5 w-3.5" />
                  Waiting for the buyer to complete payment. You'll be notified when funds arrive.
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Payment confirmed banner ──────────────────────────────────── */}
        {offer?.status === "paid" && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 rounded-full px-4 py-1.5 text-sm text-emerald-700 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Payment confirmed ✓
            </div>
          </div>
        )}

        {/* ── Escrow confirmed pill (non-dexpoky_pay methods) ──────────── */}
        {(offer?.status === "accepted" || offer?.status === "paid") && offer.exchangeMethod && offer.exchangeMethod !== "dexpoky_pay" && (() => {
          const opt = ESCROW_OPTIONS.find(o => o.id === offer.exchangeMethod);
          if (!opt) return null;
          return (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 rounded-full px-4 py-1.5 text-sm text-emerald-700 font-semibold">
                <opt.Icon className="h-4 w-4" />
                {opt.label} confirmed
              </div>
            </div>
          );
        })()}

        <div ref={bottomRef} />
      </div>

      {/* ── Expansion panels (counter / video / meetup) ─────────────────── */}

      {activeAction === "offer" && (
        <div className="border-t bg-muted/40 shrink-0 flex flex-col" style={{ maxHeight: "min(480px, 55vh)", overflowY: "auto" }}>
          <div className="px-4 pt-3 pb-2 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Make an Offer</p>
              <button type="button" onClick={() => { setActiveAction(null); setSelectedCards([]); setShowCardPicker(false); setCardSearch(""); }}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            {/* Cash amount */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">
                Cash amount{selectedCards.length > 0 ? " (optional — 0 for a pure card swap)" : ""}
              </p>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={counterAmount}
                  onChange={e => setCounterAmount(e.target.value)}
                  className="pl-7 h-9 text-sm"
                  placeholder={selectedCards.length > 0 ? "0.00" : "Your price"}
                  autoFocus
                />
              </div>
            </div>

            {/* Selected cards preview */}
            {selectedCards.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Offering {selectedCards.length} card{selectedCards.length > 1 ? "s" : ""}
                  {selectedCards.some(c => c.estimatedValue != null) && (
                    <span className="ml-1 text-primary font-medium">
                      (~${selectedCards.reduce((s, c) => s + (c.estimatedValue ?? 0), 0).toFixed(2)} est. value)
                    </span>
                  )}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {selectedCards.map(c => (
                    <div key={c.cardId} className="relative group flex flex-col items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedCards(v => v.filter(x => x.cardId !== c.cardId))}
                        className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt={c.cardName} className="w-12 h-[68px] rounded-lg object-cover border-2 border-primary/40 shadow-sm" />
                      ) : (
                        <div className="w-12 h-[68px] rounded-lg border-2 border-primary/40 bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-[9px] text-muted-foreground truncate w-12 text-center mt-0.5">{c.cardName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle card picker */}
            <button
              type="button"
              onClick={() => setShowCardPicker(v => !v)}
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Package className="h-3.5 w-3.5" />
              {showCardPicker ? "Hide collection" : "Add cards from your collection"}
            </button>

            {/* Card picker grid */}
            {showCardPicker && (
              <div className="space-y-2">
                <Input
                  value={cardSearch}
                  onChange={e => setCardSearch(e.target.value)}
                  placeholder="Search your cards…"
                  className="h-8 text-sm"
                />
                {!myCards && (
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="aspect-[5/7] rounded-lg" />)}
                  </div>
                )}
                {myCards && myCards.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No cards in your collection yet</p>
                )}
                {myCards && myCards.length > 0 && (
                  <div className="grid grid-cols-5 gap-1.5 max-h-44 overflow-y-auto pb-1">
                    {myCards
                      .filter(c =>
                        !cardSearch ||
                        c.name.toLowerCase().includes(cardSearch.toLowerCase()) ||
                        c.pokemonName.toLowerCase().includes(cardSearch.toLowerCase())
                      )
                      .map(c => {
                        const isSel = selectedCards.some(s => s.cardId === c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setSelectedCards(v => v.filter(s => s.cardId !== c.id));
                              } else {
                                setSelectedCards(v => [...v, {
                                  cardId: c.id,
                                  cardName: c.name,
                                  imageUrl: c.imageUrl ?? null,
                                  estimatedValue: c.estimatedValue != null ? parseFloat(String(c.estimatedValue)) : null,
                                  rarity: c.rarity,
                                  condition: c.condition,
                                }]);
                              }
                            }}
                            className={cn(
                              "relative rounded-lg overflow-hidden border-2 transition-all",
                              isSel ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
                            )}
                          >
                            {c.imageUrl ? (
                              <img src={c.imageUrl} alt={c.name} className="w-full aspect-[5/7] object-cover" />
                            ) : (
                              <div className="w-full aspect-[5/7] bg-muted flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            {isSel && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-primary drop-shadow" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            <Input
              value={counterNote}
              onChange={e => setCounterNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="h-9 text-sm"
            />

            {/* Send */}
            <Button
              size="sm"
              className="w-full"
              disabled={updating || ((parseFloat(counterAmount) || 0) === 0 && selectedCards.length === 0)}
              onClick={sendCounter}
            >
              Send Offer
              {(parseFloat(counterAmount) || 0) > 0 && ` — $${parseFloat(counterAmount).toFixed(2)}`}
              {selectedCards.length > 0 && ` + ${selectedCards.length} card${selectedCards.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {activeAction === "video" && (
        <div className="border-t px-4 py-3 bg-blue-50/60 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5" />
              Schedule Video Call
            </p>
            <button type="button" onClick={() => setActiveAction(null)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Video calls let both parties verify the card's condition and authenticity in real time.
          </p>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={videoDate}
              onChange={e => setVideoDate(e.target.value)}
              className="flex-1 h-9 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!videoDate || updating}
              onClick={sendVideoCall}
            >
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Schedule
            </Button>
          </div>
          <Input
            value={videoNotes}
            onChange={e => setVideoNotes(e.target.value)}
            placeholder="Platform or notes (e.g. Zoom, FaceTime)"
            className="h-9 text-sm"
          />
        </div>
      )}

      {activeAction === "meetup" && (
        <div className="border-t px-4 py-3 bg-emerald-50/60 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Propose a Meetup
            </p>
            <button type="button" onClick={() => setActiveAction(null)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Suggest a local card shop where staff can validate the card while you exchange.
          </p>
          {/* Shop search combobox */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={meetupLocation}
                onChange={e => { setMeetupLocation(e.target.value); setShopResults([]); }}
                placeholder="Search for a local card shop…"
                className="h-9 text-sm pl-8 pr-24"
                autoFocus
              />
              <button
                type="button"
                onClick={searchNearbyShops}
                disabled={shopSearching}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60 transition-colors"
              >
                {shopSearching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Navigation className="h-3.5 w-3.5" />}
                {shopSearching ? "Searching…" : "Near me"}
              </button>
            </div>
            {shopResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                {shopResults.map((shop, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/40 last:border-0"
                    onClick={() => { setMeetupLocation(shop.label); setShopResults([]); }}
                  >
                    <p className="text-xs font-semibold text-foreground">{shop.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{shop.address}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={meetupNotes}
              onChange={e => setMeetupNotes(e.target.value)}
              placeholder="Proposed date & time (optional)"
              className="flex-1 h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!meetupLocation.trim() || updating}
              onClick={sendMeetup}
            >
              <MapPin className="h-3.5 w-3.5 mr-1" />
              Propose
            </Button>
          </div>
        </div>
      )}

      {/* ── Bottom bar: message input + action chips ─────────────────────── */}
      <div className="border-t shrink-0 bg-card">
        {/* Text input row */}
        <div className="px-4 pt-3 pb-2 flex gap-2">
          <Input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message…"
            className="flex-1"
            disabled={sendMsg.isPending}
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!inputText.trim() || sendMsg.isPending}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick action chips — always visible */}
        <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
          {offer && isActive && (
            <button
              type="button"
              onClick={() => toggleAction("offer")}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                activeAction === "offer"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <DollarSign className="h-3 w-3" />
              {myTurn ? "Counter Offer" : "Make Offer"}
            </button>
          )}

          <button
            type="button"
            onClick={() => toggleAction("video")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
              activeAction === "video"
                ? "bg-blue-600 text-white border-blue-600"
                : offer?.videoCallScheduledAt
                  ? "border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Video className="h-3 w-3" />
            {offer?.videoCallScheduledAt ? "Reschedule Call" : "Video Call"}
          </button>

          <button
            type="button"
            onClick={() => toggleAction("meetup")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
              activeAction === "meetup"
                ? "bg-emerald-600 text-white border-emerald-600"
                : offer?.meetupLocation
                  ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <MapPin className="h-3 w-3" />
            {offer?.meetupLocation ? "Update Meetup" : "Propose Meetup"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── InboxPage ───────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useUser();
  const search = useSearch();
  const qcInbox = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  // When arriving from ?thread=<id> (e.g. via Counter Offer button), force a
  // fresh fetch so the brand-new thread is immediately available.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("thread")) {
      qcInbox.invalidateQueries({ queryKey: ["/api/threads"] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: threads, isLoading } = useListThreads({
    query: {
      queryKey: ["/api/threads"],
      refetchInterval: 15000,
    },
  });

  // Auto-open thread from ?thread=<id> URL param (e.g. after clicking Counter Offer)
  useEffect(() => {
    if (autoOpened || !threads) return;
    const params = new URLSearchParams(search);
    const threadParam = params.get("thread");
    if (!threadParam) return;
    const threadId = parseInt(threadParam, 10);
    if (isNaN(threadId)) return;
    const match = threads.find(t => t.id === threadId);
    if (match) {
      setActiveThreadId(threadId);
      setShowChat(true);
      setAutoOpened(true);
    }
  }, [threads, search, autoOpened]);

  const activeThread = threads?.find(t => t.id === activeThreadId) ?? null;

  const handleSelectThread = (threadId: number) => {
    setActiveThreadId(threadId);
    setShowChat(true);
  };

  return (
    <Layout>
      <div className="sm:max-w-6xl sm:mx-auto sm:px-6 lg:px-8 sm:py-8">
        {/* Heading — hidden on mobile when a chat is open to maximise space */}
        <div className={cn("flex items-center gap-3 mb-6 px-4 sm:px-0 pt-6 sm:pt-0", showChat && activeThread ? "hidden sm:flex" : "flex")}>
          <MessageSquare className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          {threads && threads.filter(t => t.unreadCount > 0).length > 0 && (
            <Badge className="bg-primary text-primary-foreground">
              {threads.filter(t => t.unreadCount > 0).length} unread
            </Badge>
          )}
        </div>

        <div
          className="sm:border sm:rounded-xl bg-card overflow-hidden"
          style={{ height: showChat && activeThread ? "calc(100dvh - 4rem - 4rem)" : "calc(100vh - 200px)", minHeight: 520 }}
        >
          <div
            className={cn(
              "grid h-full",
              showChat && activeThread
                ? "grid-cols-1 sm:grid-cols-[300px_1fr]"
                : "grid-cols-1",
            )}
          >
            {/* Thread list */}
            <div
              className={cn(
                "border-r flex flex-col",
                showChat && activeThread ? "hidden sm:flex" : "flex",
              )}
            >
              <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Conversations
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 rounded-xl" />
                    ))}
                  </div>
                ) : threads && threads.length > 0 ? (
                  (threads as DmThreadSummary[]).map(thread => (
                    <ThreadListItem
                      key={thread.id}
                      thread={thread}
                      isActive={thread.id === activeThreadId}
                      onClick={() => handleSelectThread(thread.id)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold mb-1">No conversations yet</h3>
                    <p className="text-sm text-muted-foreground">
                      When a seller contacts you about a wanted card (or you respond to a listing),
                      the conversation appears here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Thread panel */}
            {showChat && activeThread && user ? (
              <div className="flex flex-col h-full min-h-0">
                {/* Mobile back button */}
                <div className="sm:hidden border-b px-3 py-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChat(false)}
                    className="flex items-center gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <TradeThread thread={activeThread} currentUserId={user.id} />
                </div>
              </div>
            ) : (
              <div className="hidden sm:flex flex-col items-center justify-center text-center px-8">
                <MessageSquare className="h-14 w-14 text-muted-foreground/20 mb-4" />
                <h3 className="font-semibold mb-2">Select a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a thread on the left to view the full trade
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
