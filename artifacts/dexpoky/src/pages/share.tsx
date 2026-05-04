import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  useListCards, useListCategories,
  useCreateWantedListing, useListMyWantedListings, useDeleteWantedListing,
} from "@workspace/api-client-react";
import type { WantedListing } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Share2, Link2, Mail, MessageCircle, Copy, Check,
  ChevronRight, Package, Layers, FolderOpen, LayoutGrid, Sparkles,
  QrCode, ExternalLink, DollarSign, Truck, ChevronDown, ArrowLeft,
  Search, Heart, Globe, Lock, Clock, Calendar, Trash2,
} from "lucide-react";
import { CatalogSearch } from "@/components/catalog-search";
import type { CatalogCard } from "@workspace/api-client-react";

type ExpiryOption = "never" | "7d" | "30d" | "3m" | "custom";

const EXPIRY_OPTIONS: { id: ExpiryOption; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "7d",    label: "7 days" },
  { id: "30d",   label: "30 days" },
  { id: "3m",    label: "3 months" },
  { id: "custom", label: "Custom" },
];

function computeExpiresAt(expiry: ExpiryOption, customDate: string): string | null {
  if (expiry === "never") return null;
  if (expiry === "7d")    return new Date(Date.now() + 7  * 86_400_000).toISOString();
  if (expiry === "30d")   return new Date(Date.now() + 30 * 86_400_000).toISOString();
  if (expiry === "3m")    return new Date(Date.now() + 90 * 86_400_000).toISOString();
  if (expiry === "custom" && customDate) return new Date(customDate).toISOString();
  return null;
}

type SellType = "single" | "group" | "category" | "collection";
type PageMode = "sell" | "looking";

const SELL_TYPES: {
  id: SellType; label: string; desc: string;
  Icon: React.ElementType; color: string;
}[] = [
  { id: "single",     label: "Single Card",     desc: "One card with its own checkout page",     Icon: Package,    color: "bg-primary/10 text-primary border-primary/20" },
  { id: "group",      label: "Group",           desc: "Hand-pick cards into a custom bundle",    Icon: Layers,     color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "category",   label: "Category",        desc: "All cards in one of your categories",     Icon: FolderOpen, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { id: "collection", label: "Full Collection", desc: "Your entire collection as one bundle",    Icon: LayoutGrid, color: "bg-amber-100 text-amber-700 border-amber-200" },
];

function CardRow({
  name, setName, imageUrl, value, condition, selectable, selected, onToggle, readOnly,
}: {
  name: string; setName?: string | null; imageUrl?: string | null;
  value?: number | string | null; condition?: string | null;
  selectable?: boolean; selected?: boolean; onToggle?: () => void; readOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={readOnly ? undefined : onToggle}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
        readOnly
          ? "cursor-default"
          : selected
          ? "bg-primary/5 border border-primary/20"
          : "hover:bg-slate-50 border border-transparent"
      }`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="w-8 h-10 object-contain rounded shrink-0" />
      ) : (
        <div className="w-8 h-10 rounded bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{setName}{condition ? ` · ${condition}` : ""}</p>
      </div>
      {value != null && (
        <p className="text-sm font-bold shrink-0">${parseFloat(String(value)).toFixed(2)}</p>
      )}
      {selectable && selected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}

const SHARE_VIA = [
  { label: "Copy link",       action: "copy",     Icon: Link2,        color: "bg-slate-100 hover:bg-slate-200 text-slate-700" },
  { label: "Email",           action: "email",    Icon: Mail,         color: "bg-blue-50 hover:bg-blue-100 text-blue-700" },
  { label: "iMessage / SMS",  action: "sms",      Icon: MessageCircle,color: "bg-green-50 hover:bg-green-100 text-green-700" },
  { label: "WhatsApp",        action: "whatsapp", Icon: Share2,       color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" },
  { label: "QR Code",         action: "qr",       Icon: QrCode,       color: "bg-primary/10 hover:bg-primary/20 text-primary" },
  { label: "Open in browser", action: "open",     Icon: ExternalLink, color: "bg-orange-50 hover:bg-orange-100 text-orange-700" },
];

export default function SharePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();

  const { preCardId, preCategoryId } = useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      preCardId: p.get("card") ? parseInt(p.get("card")!) : null,
      preCategoryId: p.get("categoryId") ? parseInt(p.get("categoryId")!) : null,
    };
  }, [search]);

  const { data: allCards = [] } = useListCards({});
  const { data: categories = [] } = useListCategories();

  const availableCards = allCards.filter(c => !c.forSale);

  const initialSellType: SellType = preCategoryId ? "category" : "single";

  const [mode, setMode] = useState<PageMode>("sell");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sellType, setSellType] = useState<SellType>(initialSellType);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>(
    preCardId ? [preCardId] : availableCards.length > 0 ? [availableCards[0]?.id ?? 0] : []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    preCategoryId ?? (categories[0]?.id ?? null)
  );
  const [price, setPrice] = useState("");
  const [includeShipping, setIncludeShipping] = useState(false);
  const [shippingCost, setShippingCost] = useState("5.99");
  const [linkTitle, setLinkTitle] = useState("");
  const [collectionExpanded, setCollectionExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedListingId, setCopiedListingId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);

  const [wantedCard, setWantedCard] = useState<CatalogCard | null>(null);
  const [wantedMaxPrice, setWantedMaxPrice] = useState("");
  const [wantedNotes, setWantedNotes] = useState("");
  const [wantedResult, setWantedResult] = useState<WantedListing | null>(null);
  const [wantedIsPublic, setWantedIsPublic] = useState(true);
  const [wantedExpiry, setWantedExpiry] = useState<ExpiryOption>("never");
  const [wantedCustomDate, setWantedCustomDate] = useState("");
  const [wantedCopied, setWantedCopied] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { isSignedIn } = useUser();
  const { data: myWantedListings = [] } = useListMyWantedListings();

  const deleteWanted = useDeleteWantedListing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/wanted/mine"] });
        setConfirmDeleteId(null);
        toast.success("Request deleted");
      },
      onError: () => {
        toast.error("Failed to delete request");
        setConfirmDeleteId(null);
      },
    },
  });

  const activeCards = useMemo(() => {
    if (sellType === "single" || sellType === "group") {
      return availableCards.filter(c => selectedCardIds.includes(c.id));
    }
    if (sellType === "category" && selectedCategoryId) {
      return availableCards.filter(c => c.categoryId === selectedCategoryId);
    }
    return availableCards;
  }, [sellType, selectedCardIds, selectedCategoryId, availableCards]);

  const totalValue = activeCards.reduce((sum, c) => sum + parseFloat(String(c.estimatedValue ?? 0)), 0);
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const summaryLabel = useMemo(() => {
    if (sellType === "single") return activeCards[0]?.name ?? "—";
    if (sellType === "group") return `${activeCards.length} card${activeCards.length !== 1 ? "s" : ""} selected`;
    if (sellType === "category") return `${selectedCategory?.name ?? "Category"} (${activeCards.length} cards)`;
    return `Full Collection (${activeCards.length} cards)`;
  }, [sellType, activeCards, selectedCategory]);

  const createListing = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create listing");
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (listing) => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      setCreatedListingId(listing.id);
      const link = `${window.location.origin}/marketplace/${listing.id}`;
      setShareLink(link);
      setStep(3);
    },
    onError: () => toast.error("Failed to create listing"),
  });

  const createWanted = useCreateWantedListing({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["/api/wanted/mine"] });
        setWantedResult(data);
        setStep(3);
      },
      onError: () => toast.error("Failed to post your request"),
    },
  });

  const handleContinue = () => {
    setPrice(totalValue.toFixed(2));
    setLinkTitle(summaryLabel);
    setStep(2);
  };

  const handleGenerate = () => {
    const finalPrice = parseFloat(price || "0");
    if (finalPrice <= 0) { toast.error("Please enter a valid price"); return; }

    if (sellType === "single" && activeCards[0]) {
      createListing.mutate({
        cardId: activeCards[0].id,
        price: finalPrice,
        listingType: "buy_now",
        description: includeShipping ? `Includes shipping: $${shippingCost}` : undefined,
      });
    } else {
      const origin = window.location.origin;
      let link = origin + "/collection";
      if (sellType === "category" && selectedCategoryId) {
        link = `${origin}/collection?category=${selectedCategoryId}`;
      }
      setShareLink(link);
      setStep(3);
    }
  };

  const handleWantedContinue = () => {
    if (!wantedCard) { toast.error("Please pick a card first"); return; }
    setStep(2);
  };

  const handleWantedPost = () => {
    if (!wantedCard) return;
    const expiresAt = computeExpiresAt(wantedExpiry, wantedCustomDate) ?? undefined;
    createWanted.mutate({
      data: {
        catalogCardId: wantedCard.id,
        name: wantedCard.name,
        pokemonName: wantedCard.pokemonName,
        setName: wantedCard.setName ?? undefined,
        setCode: wantedCard.setCode ?? undefined,
        cardNumber: wantedCard.cardNumber ?? undefined,
        rarity: wantedCard.rarity ?? undefined,
        imageUrl: wantedCard.imageUrl ?? undefined,
        maxPrice: wantedMaxPrice ? parseFloat(wantedMaxPrice) : undefined,
        notes: wantedNotes.trim() || undefined,
        isPublic: wantedIsPublic,
        expiresAt: expiresAt,
      },
    });
  };

  const wantedShareLink = wantedResult ? `${window.location.origin}/w/${wantedResult.shortCode}` : "";

  const handleWantedCopy = () => {
    navigator.clipboard.writeText(wantedShareLink).then(() => {
      setWantedCopied(true);
      setTimeout(() => setWantedCopied(false), 2500);
      toast.success("Link copied!");
    });
  };

  const handleWantedShareAction = (action: string) => {
    const title = `${wantedResult?.name ?? "Card"} — Looking For on DexPoky`;
    if (action === "copy")     { handleWantedCopy(); return; }
    if (action === "email")    window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(wantedShareLink)}`);
    if (action === "sms")      window.open(`sms:?body=${encodeURIComponent(title + ": " + wantedShareLink)}`);
    if (action === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(title + ": " + wantedShareLink)}`);
    if (action === "open")     window.open(wantedShareLink, "_blank");
    if (action === "qr")       window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(wantedShareLink)}`, "_blank");
  };

  const handleCopy = (link = shareLink) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Link copied!");
    });
  };

  const handleShareAction = (action: string) => {
    const title = linkTitle || summaryLabel;
    if (action === "copy") { handleCopy(); return; }
    if (action === "email") {
      window.open(`mailto:?subject=${encodeURIComponent(title + " on DexPoky")}&body=${encodeURIComponent(shareLink)}`);
    }
    if (action === "sms") {
      window.open(`sms:?body=${encodeURIComponent(title + ": " + shareLink)}`);
    }
    if (action === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(title + ": " + shareLink)}`);
    }
    if (action === "open") {
      window.open(shareLink, "_blank");
    }
    if (action === "qr") {
      window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareLink)}`, "_blank");
    }
  };

  const buyerTotal = parseFloat(price || "0") + (includeShipping ? parseFloat(shippingCost || "0") : 0);

  const handleModeSwitch = (m: PageMode) => {
    setMode(m);
    setStep(1);
    setWantedCard(null);
    setWantedMaxPrice("");
    setWantedNotes("");
    setWantedResult(null);
    setWantedIsPublic(true);
    setWantedExpiry("never");
    setWantedCustomDate("");
    setWantedCopied(false);
    setShareLink("");
    setCopied(false);
    setCreatedListingId(null);
  };

  return (
    <Layout>
      <div className="px-4 py-8 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === "looking" ? "bg-rose-500" : "bg-primary"}`}>
            {mode === "looking" ? <Heart className="h-5 w-5 text-white" /> : <Share2 className="h-5 w-5 text-white" />}
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">{mode === "looking" ? "Looking For" : "Create Share Link"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "looking" ? "Broadcast a card you want to buy" : "Share & get paid in seconds"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  step === s ? `w-6 ${mode === "looking" ? "bg-rose-500" : "bg-primary"}`
                  : step > s ? `w-2 ${mode === "looking" ? "bg-rose-300" : "bg-primary/40"}`
                  : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Mode toggle — only show on step 1 */}
        {step === 1 && (
          <div className="flex items-center gap-1 p-1 bg-muted rounded-xl mb-6">
            <button
              type="button"
              onClick={() => handleModeSwitch("sell")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === "sell" ? "bg-white shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <Share2 className="h-3.5 w-3.5" /> Show/Sell Cards
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch("looking")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === "looking" ? "bg-white shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <Heart className="h-3.5 w-3.5" /> Looking For
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* SELL MODE                                  */}
        {/* ══════════════════════════════════════════ */}

        {mode === "sell" && (
          <>
            {/* ── Step 1: What are you sharing? ── */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-muted-foreground">What are you sharing?</p>

                <div className="grid grid-cols-2 gap-3">
                  {SELL_TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSellType(t.id);
                        if (t.id === "single" && availableCards.length > 0) {
                          setSelectedCardIds([availableCards[0]!.id]);
                        }
                        if (t.id === "group") {
                          setSelectedCardIds(availableCards.slice(0, 2).map(c => c.id));
                        }
                        if (t.id === "category" && categories.length > 0) {
                          setSelectedCategoryId(preCategoryId ?? categories[0]!.id);
                        }
                      }}
                      className={`text-left p-4 rounded-2xl border-2 transition-all ${
                        sellType === t.id
                          ? "border-primary bg-white shadow-md shadow-primary/20"
                          : "border-transparent bg-card hover:border-border"
                      }`}
                    >
                      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2.5 ${t.color} border`}>
                        <t.Icon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Single / Group: card selector */}
                {(sellType === "single" || sellType === "group") && (
                  <div className="bg-card rounded-2xl border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {sellType === "single" ? "Select card" : "Pick cards for bundle"}
                    </p>
                    {availableCards.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No available cards to share.</p>
                    ) : (
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {availableCards.map(card => (
                          <CardRow
                            key={card.id}
                            name={card.name}
                            setName={card.setName}
                            imageUrl={card.imageUrl}
                            value={card.estimatedValue}
                            condition={card.condition}
                            selectable
                            selected={selectedCardIds.includes(card.id)}
                            onToggle={() => {
                              if (sellType === "single") {
                                setSelectedCardIds([card.id]);
                              } else {
                                setSelectedCardIds(prev =>
                                  prev.includes(card.id)
                                    ? prev.filter(id => id !== card.id)
                                    : [...prev, card.id]
                                );
                              }
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Category: pick category then see its cards */}
                {sellType === "category" && (
                  <div className="space-y-3">
                    <div className="bg-card rounded-2xl border p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Choose category</p>
                      <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              selectedCategoryId === cat.id
                                ? "border-primary bg-primary/5 text-primary shadow-sm"
                                : "border-border bg-background text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            {cat.name}
                            <span className="opacity-70">({cat.cardCount ?? 0})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {activeCards.length > 0 && (
                      <div className="bg-card rounded-2xl border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cards included</p>
                          <span className="text-xs text-muted-foreground">
                            {activeCards.length} cards · ${totalValue.toFixed(2)} value
                          </span>
                        </div>
                        <div className="space-y-1 max-h-56 overflow-y-auto">
                          {activeCards.map(card => (
                            <CardRow key={card.id} name={card.name} setName={card.setName} imageUrl={card.imageUrl} value={card.estimatedValue} condition={card.condition} readOnly />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Collection: show all cards, collapsible */}
                {sellType === "collection" && (
                  <div className="bg-card rounded-2xl border p-4">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between"
                      onClick={() => setCollectionExpanded(e => !e)}
                    >
                      <div className="text-left">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your entire collection</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{availableCards.length} cards · ${totalValue.toFixed(2)} value</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-primary font-semibold">
                        {collectionExpanded ? "Collapse" : "Preview all"}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collectionExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    <div className="space-y-1 mt-3">
                      {(collectionExpanded ? availableCards : availableCards.slice(0, 3)).map(card => (
                        <CardRow key={card.id} name={card.name} setName={card.setName} imageUrl={card.imageUrl} value={card.estimatedValue} condition={card.condition} readOnly />
                      ))}
                      {!collectionExpanded && availableCards.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setCollectionExpanded(true)}
                          className="w-full text-center text-xs text-primary font-semibold py-2 hover:underline"
                        >
                          + {availableCards.length - 3} more cards
                        </button>
                      )}
                    </div>
                    {categories.length > 0 && (
                      <div className="mt-4 pt-3 border-t space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By category</p>
                        {categories.map(cat => (
                          <div key={cat.id} className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-muted text-muted-foreground">{cat.name}</span>
                            <span className="text-xs text-muted-foreground">{cat.cardCount ?? 0} cards</span>
                            <span className="ml-auto text-xs font-semibold">${parseFloat(String(cat.totalValue ?? 0)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl"
                  onClick={handleContinue}
                  disabled={
                    (sellType === "single" && selectedCardIds.length === 0) ||
                    (sellType === "group" && selectedCardIds.length === 0) ||
                    (sellType === "category" && !selectedCategoryId)
                  }
                >
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {/* ── Step 2: Price & shipping ── */}
            {step === 2 && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <p className="text-sm font-semibold text-muted-foreground">Set your price & shipping</p>

                {/* Summary pill */}
                <div className="flex items-center gap-3 bg-card border rounded-2xl p-3">
                  <div className="flex -space-x-2 shrink-0">
                    {activeCards.slice(0, 3).map(c => (
                      c.imageUrl
                        ? <img key={c.id} src={c.imageUrl} alt={c.name} className="w-8 h-10 object-contain rounded border-2 border-background" />
                        : <div key={c.id} className="w-8 h-10 rounded border-2 border-background bg-muted" />
                    ))}
                    {activeCards.length > 3 && (
                      <div className="w-8 h-10 rounded border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        +{activeCards.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{summaryLabel}</p>
                    <p className="text-xs text-muted-foreground">Market value: ${totalValue.toFixed(2)}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {SELL_TYPES.find(t => t.id === sellType)?.label}
                  </Badge>
                </div>

                <div className="bg-card rounded-2xl border p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page title</label>
                    <Input
                      value={linkTitle}
                      onChange={e => setLinkTitle(e.target.value)}
                      className="rounded-xl"
                      placeholder={summaryLabel}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your asking price</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number" step="0.01"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        className="pl-8 rounded-xl text-xl font-bold h-12"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Market value: ${totalValue.toFixed(2)}</p>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <label className="text-sm font-medium">Charge for shipping</label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIncludeShipping(v => !v)}
                        className={`rounded-full transition-colors relative ${includeShipping ? "bg-primary" : "bg-muted"}`}
                        style={{ width: 40, height: 22 }}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${includeShipping ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                    {includeShipping && (
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number" step="0.01"
                          value={shippingCost}
                          onChange={e => setShippingCost(e.target.value)}
                          className="pl-8 rounded-xl"
                          placeholder="Shipping cost"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-primary font-medium">Buyer pays total</span>
                  <span className="text-lg font-black text-primary">${buyerTotal.toFixed(2)}</span>
                </div>

                <Button
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl"
                  onClick={handleGenerate}
                  disabled={createListing.isPending}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {createListing.isPending ? "Creating…" : "Generate share link"}
                </Button>
              </div>
            )}

            {/* ── Step 3: Link is live! ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
                    <Check className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="text-xl font-black">Your page is live!</h2>
                  <p className="text-sm text-muted-foreground mt-1">Share it anywhere — buyers can pay in under a minute.</p>
                </div>

                <div className="bg-card rounded-2xl border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your link</p>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5 border">
                    <span className="text-sm text-muted-foreground flex-1 truncate font-mono">{shareLink}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy()}
                      className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                        copied
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      }`}
                    >
                      {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>

                <div className="bg-card rounded-2xl border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Share via</p>
                  <div className="grid grid-cols-3 gap-2">
                    {SHARE_VIA.map(opt => (
                      <button
                        key={opt.action}
                        type="button"
                        onClick={() => handleShareAction(opt.action)}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all text-center ${opt.color}`}
                      >
                        <opt.Icon className="h-4 w-4" />
                        <span className="text-xs font-medium leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-2xl border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Asking price</p>
                    <p className="text-lg font-black">${parseFloat(price || "0").toFixed(2)}</p>
                  </div>
                  {includeShipping && (
                    <div>
                      <p className="text-xs text-muted-foreground">+ Shipping</p>
                      <p className="text-lg font-black">${parseFloat(shippingCost || "0").toFixed(2)}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Buyer total</p>
                    <p className="text-lg font-black text-primary">${buyerTotal.toFixed(2)}</p>
                  </div>
                </div>

                {createdListingId && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setLocation(`/marketplace/${createdListingId}`)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" /> View on Marketplace
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => { setStep(1); setShareLink(""); setCreatedListingId(null); setCopied(false); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2"
                >
                  Create another share link
                </button>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* LOOKING FOR MODE                           */}
        {/* ══════════════════════════════════════════ */}

        {mode === "looking" && (
          <>
            {/* ── Step 1: Pick card from catalog ── */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-muted-foreground">Which card are you looking for?</p>

                <CatalogSearch
                  onSelect={(card) => setWantedCard(card)}
                />

                {wantedCard && (
                  <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-3">
                    {wantedCard.imageUrl ? (
                      <img src={wantedCard.imageUrl} alt={wantedCard.name} className="w-10 h-14 object-contain rounded shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-rose-800">{wantedCard.name}</p>
                      <p className="text-xs text-rose-600">{wantedCard.pokemonName}</p>
                      {wantedCard.setName && <p className="text-xs text-rose-500 mt-0.5">{wantedCard.setName}</p>}
                    </div>
                    <Heart className="h-5 w-5 text-rose-500 shrink-0 fill-rose-200" />
                  </div>
                )}

                <Button
                  className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
                  onClick={handleWantedContinue}
                  disabled={!wantedCard}
                >
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>

                {/* ── My Requests history ── */}
                {isSignedIn && myWantedListings.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">My Requests</p>
                    <div className="space-y-2">
                      {myWantedListings.map(listing => (
                        <div
                          key={listing.id}
                          className={`rounded-2xl border overflow-hidden ${
                            listing.status === "closed"
                              ? "bg-muted/30 opacity-75"
                              : "bg-card"
                          }`}
                        >
                          <div className="flex items-center gap-3 p-3">
                            {listing.imageUrl ? (
                              <img
                                src={listing.imageUrl}
                                alt={listing.name}
                                className="w-9 h-12 object-contain rounded shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-12 rounded bg-muted shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{listing.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {listing.setName ?? listing.pokemonName}
                              </p>
                              {listing.maxPrice != null && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Up to ${listing.maxPrice.toFixed(2)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              {listing.status === "closed" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <Check className="h-3 w-3" /> Found
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                  Active
                                </span>
                              )}
                              <div className="flex items-center gap-1.5">
                                {listing.isPublic ? (
                                  <Globe className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Lock className="h-3 w-3 text-muted-foreground" />
                                )}

                                {listing.isPublic && (
                                  <>
                                    {listing.status !== "closed" && listing.shortCode ? (
                                      <>
                                        <button
                                          type="button"
                                          title="Copy share link"
                                          onClick={() => {
                                            const link = `${window.location.origin}/w/${listing.shortCode}`;
                                            navigator.clipboard.writeText(link).then(() => {
                                              setCopiedListingId(listing.id.toString());
                                              toast.success("Link copied!");
                                              setTimeout(() => setCopiedListingId(null), 2000);
                                            }).catch(() => {
                                              toast.error("Could not copy link — please try again.");
                                            });
                                          }}
                                          className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                        >
                                          {copiedListingId === listing.id.toString() ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                                          ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                        <a
                                          href={`/w/${listing.shortCode}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Open listing page"
                                          aria-label="Open listing page in new tab"
                                          className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      </>
                                    ) : listing.status === "closed" && listing.shortCode ? (
                                      <>
                                        <button
                                          type="button"
                                          title="Listing closed"
                                          disabled
                                          className="p-1 rounded-md text-muted-foreground/40 cursor-not-allowed"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Listing closed"
                                          aria-label="Open listing page (listing closed)"
                                          aria-disabled="true"
                                          disabled
                                          className="p-1 rounded-md text-muted-foreground/40 cursor-not-allowed"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </button>
                                      </>
                                    ) : null}
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(
                                    confirmDeleteId === listing.id ? null : listing.id
                                  )}
                                  className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                                  aria-label="Delete request"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {confirmDeleteId === listing.id && (
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border-t border-red-100">
                              <p className="text-xs text-red-700 font-medium">Delete this request?</p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteWanted.mutate({ id: listing.id })}
                                  disabled={deleteWanted.isPending}
                                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors"
                                >
                                  {deleteWanted.isPending ? "Deleting…" : "Delete"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Max price + notes ── */}
            {step === 2 && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <p className="text-sm font-semibold text-muted-foreground">Set your budget & add a note (optional)</p>

                {wantedCard && (
                  <div className="flex items-center gap-3 bg-card border rounded-2xl p-3">
                    {wantedCard.imageUrl ? (
                      <img src={wantedCard.imageUrl} alt={wantedCard.name} className="w-8 h-10 object-contain rounded shrink-0" />
                    ) : (
                      <div className="w-8 h-10 rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{wantedCard.name}</p>
                      <p className="text-xs text-muted-foreground">{wantedCard.setName ?? wantedCard.pokemonName}</p>
                    </div>
                  </div>
                )}

                <div className="bg-card rounded-2xl border p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Max price you'd pay <span className="text-muted-foreground/60 normal-case font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        value={wantedMaxPrice}
                        onChange={e => setWantedMaxPrice(e.target.value)}
                        className="pl-8 rounded-xl text-xl font-bold h-12"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Note <span className="text-muted-foreground/60 normal-case font-normal">(condition, grading, etc.)</span>
                    </label>
                    <textarea
                      value={wantedNotes}
                      onChange={e => setWantedNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Must be NM or better, prefer PSA graded…"
                      className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-400/50 placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                {/* Destination toggle */}
                <div className="bg-card rounded-2xl border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Who can see this?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWantedIsPublic(true)}
                      className={`flex flex-col items-center gap-2 py-3 px-3 rounded-xl border-2 transition-all ${
                        wantedIsPublic
                          ? "border-rose-400 bg-rose-50 text-rose-700"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Globe className="h-5 w-5" />
                      <div className="text-center">
                        <p className="text-xs font-bold">Public</p>
                        <p className="text-[10px] leading-tight mt-0.5">Visible in marketplace</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWantedIsPublic(false)}
                      className={`flex flex-col items-center gap-2 py-3 px-3 rounded-xl border-2 transition-all ${
                        !wantedIsPublic
                          ? "border-rose-400 bg-rose-50 text-rose-700"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Lock className="h-5 w-5" />
                      <div className="text-center">
                        <p className="text-xs font-bold">Private</p>
                        <p className="text-[10px] leading-tight mt-0.5">Link only — not listed</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Expiry picker */}
                <div className="bg-card rounded-2xl border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expires after</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EXPIRY_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setWantedExpiry(opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          wantedExpiry === opt.id
                            ? "bg-rose-500 text-white border-rose-500"
                            : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {wantedExpiry === "custom" && (
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={wantedCustomDate}
                        onChange={e => setWantedCustomDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="pl-9 rounded-xl"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {wantedExpiry === "never"
                      ? "This request stays active until you find the card or remove it."
                      : "The request will automatically stop showing after the selected period."}
                  </p>
                </div>

                <Button
                  className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
                  onClick={handleWantedPost}
                  disabled={createWanted.isPending || (wantedExpiry === "custom" && !wantedCustomDate)}
                >
                  <Heart className="h-4 w-4 mr-2" />
                  {createWanted.isPending ? "Posting…" : "Post Looking For request"}
                </Button>
              </div>
            )}

            {/* ── Step 3: Posted! ── */}
            {step === 3 && wantedResult && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-14 h-14 rounded-2xl bg-rose-500 flex items-center justify-center mx-auto mb-3">
                    <Heart className="h-7 w-7 text-white fill-white/30" />
                  </div>
                  <h2 className="text-xl font-black">Request posted!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {wantedIsPublic
                      ? "Your request is live in the marketplace — share your link too."
                      : "Your private request is ready — share the link with sellers."}
                  </p>
                </div>

                <div className="bg-card rounded-2xl border p-4 flex items-center gap-4">
                  {wantedResult.imageUrl ? (
                    <img src={wantedResult.imageUrl} alt={wantedResult.name} className="w-12 h-16 object-contain rounded shrink-0" />
                  ) : (
                    <div className="w-12 h-16 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{wantedResult.name}</p>
                    <p className="text-sm text-muted-foreground">{wantedResult.setName ?? wantedResult.pokemonName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {wantedResult.maxPrice != null && (
                        <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">
                          Up to ${wantedResult.maxPrice.toFixed(2)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs gap-1">
                        {wantedIsPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                        {wantedIsPublic ? "Public" : "Private"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Short link */}
                <div className="bg-card rounded-2xl border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your share link</p>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5 border">
                    <span className="text-sm text-muted-foreground flex-1 truncate font-mono">{wantedShareLink}</span>
                    <button
                      type="button"
                      onClick={handleWantedCopy}
                      className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                        wantedCopied
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : "bg-rose-100 text-rose-600 hover:bg-rose-200"
                      }`}
                    >
                      {wantedCopied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Share via */}
                <div className="bg-card rounded-2xl border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Share via</p>
                  <div className="grid grid-cols-3 gap-2">
                    {SHARE_VIA.map(opt => (
                      <button
                        key={opt.action}
                        type="button"
                        onClick={() => handleWantedShareAction(opt.action)}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all text-center ${opt.color}`}
                      >
                        <opt.Icon className="h-4 w-4" />
                        <span className="text-xs font-medium leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {wantedIsPublic && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setLocation("/marketplace")}
                  >
                    <Search className="h-4 w-4 mr-2" /> View in Marketplace
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => { handleModeSwitch("looking"); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2"
                >
                  Post another request
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}
