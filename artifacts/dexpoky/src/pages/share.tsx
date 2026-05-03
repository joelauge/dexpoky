import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useListCards, useListCategories } from "@workspace/api-client-react";
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
} from "lucide-react";

type SellType = "single" | "group" | "category" | "collection";

const SELL_TYPES: {
  id: SellType; label: string; desc: string;
  Icon: React.ElementType; color: string;
}[] = [
  { id: "single",     label: "Single Card",     desc: "One card with its own checkout page",     Icon: Package,    color: "bg-violet-100 text-violet-700 border-violet-200" },
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
          ? "bg-violet-50 border border-violet-200"
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
      {selectable && selected && <Check className="h-4 w-4 text-violet-600 shrink-0" />}
    </button>
  );
}

const SHARE_VIA = [
  { label: "Copy link",       action: "copy",     Icon: Link2,        color: "bg-slate-100 hover:bg-slate-200 text-slate-700" },
  { label: "Email",           action: "email",    Icon: Mail,         color: "bg-blue-50 hover:bg-blue-100 text-blue-700" },
  { label: "iMessage / SMS",  action: "sms",      Icon: MessageCircle,color: "bg-green-50 hover:bg-green-100 text-green-700" },
  { label: "WhatsApp",        action: "whatsapp", Icon: Share2,       color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" },
  { label: "QR Code",         action: "qr",       Icon: QrCode,       color: "bg-purple-50 hover:bg-purple-100 text-purple-700" },
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
  const [shareLink, setShareLink] = useState("");
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);

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

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Create Share Link</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Share & get paid in seconds</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  step === s ? "w-6 bg-violet-600"
                  : step > s ? "w-2 bg-violet-300"
                  : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

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
                      ? "border-violet-600 bg-white shadow-md shadow-violet-100/60"
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
                            ? "border-violet-600 bg-violet-50 text-violet-700 shadow-sm"
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
                  <div className="flex items-center gap-1 text-xs text-violet-600 font-semibold">
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
                      className="w-full text-center text-xs text-violet-600 font-semibold py-2 hover:underline"
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
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
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
                    className={`rounded-full transition-colors relative ${includeShipping ? "bg-violet-600" : "bg-muted"}`}
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

            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-violet-700 font-medium">Buyer pays total</span>
              <span className="text-lg font-black text-violet-700">${buyerTotal.toFixed(2)}</span>
            </div>

            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
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
              <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-3">
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
                      : "bg-violet-100 text-violet-700 hover:bg-violet-200"
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
                <p className="text-lg font-black text-violet-600">${buyerTotal.toFixed(2)}</p>
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
      </div>
    </Layout>
  );
}
