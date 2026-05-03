import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Link2, Mail, MessageCircle, Share2, Copy, Check, ChevronRight,
  Package, Layers, FolderOpen, LayoutGrid, Tag, Plus, X, Sparkles,
  QrCode, ExternalLink, DollarSign, Truck,
} from "lucide-react";

type SellType = "single" | "group" | "category" | "collection";

const SELL_TYPES: { id: SellType; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { id: "single",     label: "Single Card",  desc: "One card with its own checkout page",           icon: <Package className="h-5 w-5" />,    color: "bg-violet-100 text-violet-700 border-violet-200" },
  { id: "group",      label: "Group",        desc: "Hand-pick cards into a custom bundle",           icon: <Layers className="h-5 w-5" />,     color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "category",   label: "Category",     desc: "All cards in one of your categories",            icon: <FolderOpen className="h-5 w-5" />, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { id: "collection", label: "Full Collection", desc: "Your entire collection as one bundle",        icon: <LayoutGrid className="h-5 w-5" />, color: "bg-amber-100 text-amber-700 border-amber-200" },
];

const CARDS = [
  { id: 1, name: "Charizard VMAX", set: "Champion's Path", value: 124.99, img: "https://images.pokemontcg.io/swshp/SWSH006.png" },
  { id: 2, name: "Pikachu V",      set: "Vivid Voltage",    value: 18.50,  img: "https://images.pokemontcg.io/swsh4/43.png" },
  { id: 3, name: "Gengar ex",      set: "Perfect Order",    value: 0.40,   img: "https://images.pokemontcg.io/sv7/50.png" },
  { id: 4, name: "Mewtwo V",       set: "Brilliant Stars",  value: 22.00,  img: "https://images.pokemontcg.io/swsh9/30.png" },
];

const SHARE_OPTIONS = [
  { icon: <Link2 className="h-4 w-4" />,          label: "Copy link",       action: "copy",      color: "bg-slate-100 hover:bg-slate-200 text-slate-700" },
  { icon: <Mail className="h-4 w-4" />,            label: "Email",           action: "email",     color: "bg-blue-50 hover:bg-blue-100 text-blue-700" },
  { icon: <MessageCircle className="h-4 w-4" />,   label: "iMessage / SMS",  action: "sms",       color: "bg-green-50 hover:bg-green-100 text-green-700" },
  { icon: <Share2 className="h-4 w-4" />,          label: "WhatsApp",        action: "whatsapp",  color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" },
  { icon: <QrCode className="h-4 w-4" />,          label: "QR Code",         action: "qr",        color: "bg-purple-50 hover:bg-purple-100 text-purple-700" },
  { icon: <ExternalLink className="h-4 w-4" />,    label: "Open in browser", action: "open",      color: "bg-orange-50 hover:bg-orange-100 text-orange-700" },
];

export function SellerShareFlow() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sellType, setSellType] = useState<SellType>("single");
  const [selectedCards, setSelectedCards] = useState<number[]>([1]);
  const [price, setPrice] = useState("124.99");
  const [includeShipping, setIncludeShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState("5.99");
  const [copied, setCopied] = useState(false);
  const [linkTitle, setLinkTitle] = useState("Charizard VMAX — Champion's Path");

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalCards = selectedCards.length;
  const totalValue = selectedCards.reduce((sum, id) => {
    const card = CARDS.find(c => c.id === id);
    return sum + (card?.value ?? 0);
  }, 0);

  return (
    <div className="min-h-screen bg-[#f8f7ff] flex items-start justify-center p-8 font-sans">
      <div className="w-full max-w-[520px]">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
            <Share2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-none">Create Selling Page</h1>
            <p className="text-xs text-slate-500 mt-0.5">Share & get paid in seconds</p>
          </div>
          {/* Step dots */}
          <div className="ml-auto flex items-center gap-1.5">
            {[1,2,3].map(s => (
              <div key={s} className={`h-2 rounded-full transition-all ${step === s ? "w-6 bg-violet-600" : step > s ? "w-2 bg-violet-300" : "w-2 bg-slate-200"}`} />
            ))}
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">What are you selling?</h2>
            <div className="grid grid-cols-2 gap-3">
              {SELL_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSellType(t.id)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    sellType === t.id
                      ? "border-violet-600 bg-white shadow-md shadow-violet-100"
                      : "border-transparent bg-white hover:border-slate-200"
                  }`}
                >
                  <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2.5 ${t.color} border`}>
                    {t.icon}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>

            {/* Card selection for "single" and "group" */}
            {(sellType === "single" || sellType === "group") && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {sellType === "single" ? "Select card" : "Pick cards for bundle"}
                </p>
                <div className="space-y-2">
                  {CARDS.map(card => {
                    const isSelected = selectedCards.includes(card.id);
                    return (
                      <button
                        key={card.id}
                        onClick={() => {
                          if (sellType === "single") {
                            setSelectedCards([card.id]);
                          } else {
                            setSelectedCards(prev =>
                              isSelected ? prev.filter(id => id !== card.id) : [...prev, card.id]
                            );
                          }
                        }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                          isSelected ? "bg-violet-50 border border-violet-200" : "hover:bg-slate-50 border border-transparent"
                        }`}
                      >
                        <img src={card.img} alt={card.name} className="w-8 h-10 object-contain rounded" onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='44' viewBox='0 0 32 44'%3E%3Crect width='32' height='44' rx='4' fill='%23e2e8f0'/%3E%3C/svg%3E"; }} />
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{card.name}</p>
                          <p className="text-xs text-slate-400">{card.set}</p>
                        </div>
                        <p className="text-sm font-bold text-slate-700">${card.value.toFixed(2)}</p>
                        {isSelected && <Check className="h-4 w-4 text-violet-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
              onClick={() => setStep(2)}
            >
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-1">
              <ChevronRight className="h-3 w-3 rotate-180" /> Back
            </button>
            <h2 className="text-sm font-semibold text-slate-700">Set your price & shipping</h2>

            {/* Summary pill */}
            <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-2xl p-3">
              <div className="flex -space-x-2">
                {CARDS.filter(c => selectedCards.includes(c.id)).slice(0, 3).map(c => (
                  <img key={c.id} src={c.img} alt={c.name} className="w-8 h-10 object-contain rounded border-2 border-white" onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='44' viewBox='0 0 32 44'%3E%3Crect width='32' height='44' rx='4' fill='%23e2e8f0'/%3E%3C/svg%3E"; }} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {totalCards === 1
                    ? CARDS.find(c => c.id === selectedCards[0])?.name
                    : `${totalCards} cards selected`}
                </p>
                <p className="text-xs text-slate-500">Market value: ${totalValue.toFixed(2)}</p>
              </div>
              <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">
                {SELL_TYPES.find(t => t.id === sellType)?.label}
              </Badge>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Page title</Label>
                <Input
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                  className="mt-1.5 border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your asking price</Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="pl-8 border-slate-200 rounded-xl text-xl font-bold h-12"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Market value: ${totalValue.toFixed(2)}</p>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-slate-400" />
                    <Label className="text-sm font-medium text-slate-700">Charge for shipping</Label>
                  </div>
                  <button
                    onClick={() => setIncludeShipping(!includeShipping)}
                    className={`w-10 h-5.5 rounded-full transition-all relative ${includeShipping ? "bg-violet-600" : "bg-slate-200"}`}
                    style={{ height: 22 }}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${includeShipping ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
                {includeShipping && (
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      value={shippingCost}
                      onChange={e => setShippingCost(e.target.value)}
                      className="pl-8 border-slate-200 rounded-xl"
                      placeholder="Shipping cost"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-violet-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-violet-700 font-medium">Buyer pays total</span>
              <span className="text-lg font-black text-violet-700">
                ${(parseFloat(price || "0") + (includeShipping ? parseFloat(shippingCost || "0") : 0)).toFixed(2)}
              </span>
            </div>

            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
              onClick={() => setStep(3)}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Generate share link
            </Button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-3">
                <Check className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Your page is live!</h2>
              <p className="text-sm text-slate-500 mt-1">Share it anywhere — buyers can pay in under a minute.</p>
            </div>

            {/* Link */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Your link</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
                <span className="text-sm text-slate-600 flex-1 truncate font-mono">
                  dexpoky.app/sell/<span className="text-violet-600 font-bold">ch4r1z4rd-vmax</span>
                </span>
                <button
                  onClick={handleCopy}
                  className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                    copied ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                  }`}
                >
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            </div>

            {/* Share options */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Share via</p>
              <div className="grid grid-cols-3 gap-2">
                {SHARE_OPTIONS.map(opt => (
                  <button
                    key={opt.action}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all text-center ${opt.color}`}
                  >
                    {opt.icon}
                    <span className="text-xs font-medium leading-tight">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Asking price</p>
                <p className="text-lg font-black text-slate-900">${parseFloat(price).toFixed(2)}</p>
              </div>
              {includeShipping && (
                <div>
                  <p className="text-xs text-slate-500">+ Shipping</p>
                  <p className="text-lg font-black text-slate-900">${parseFloat(shippingCost).toFixed(2)}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-slate-500">Buyer pays</p>
                <p className="text-lg font-black text-violet-600">
                  ${(parseFloat(price || "0") + (includeShipping ? parseFloat(shippingCost || "0") : 0)).toFixed(2)}
                </p>
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-xl" onClick={() => setStep(1)}>
              <Plus className="h-4 w-4 mr-2" /> Create another page
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
