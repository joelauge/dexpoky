import { useState } from "react";
import {
  ShieldCheck, Truck, CreditCard, Star, ChevronDown, ChevronUp,
  Check, Lock, Package, ArrowRight, Info, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Step = "review" | "shipping" | "payment" | "success";

const CARD = {
  name: "Charizard VMAX",
  set: "Champion's Path",
  number: "074/073",
  condition: "Near Mint",
  rarity: "Secret Rare",
  price: 124.99,
  shipping: 5.99,
  img: "https://images.pokemontcg.io/swshp/SWSH006.png",
  seller: "PokeTrader99",
  sellerRating: 4.9,
  sellerSales: 312,
};

export function BuyerCheckout() {
  const [step, setStep] = useState<Step>("review");
  const [cardExpanded, setCardExpanded] = useState(false);

  const [shipping, setShipping] = useState({
    name: "", email: "", address: "", city: "", state: "", zip: "", country: "US",
  });
  const [payment, setPayment] = useState({
    number: "", expiry: "", cvc: "", name: "",
  });

  const total = CARD.price + CARD.shipping;

  const formatCardNumber = (val: string) =>
    val.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
  const formatExpiry = (val: string) =>
    val.replace(/\D/g, "").replace(/^(\d{2})(\d)/, "$1/$2").slice(0, 5);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <Check className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Order Confirmed!</h1>
          <p className="text-slate-500 mb-6">
            You've purchased <strong className="text-slate-800">{CARD.name}</strong>. A confirmation has been sent to {shipping.email || "your email"}.
          </p>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 text-left mb-5 shadow-sm">
            <div className="flex items-center gap-3">
              <img src={CARD.img} alt={CARD.name} className="w-12 h-16 object-contain rounded" onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='64' viewBox='0 0 48 64'%3E%3Crect width='48' height='64' rx='6' fill='%23e2e8f0'/%3E%3C/svg%3E"; }} />
              <div>
                <p className="font-bold text-slate-900">{CARD.name}</p>
                <p className="text-sm text-slate-500">{CARD.set}</p>
              </div>
              <p className="ml-auto font-black text-slate-900">${total.toFixed(2)}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-500">
              <Truck className="h-4 w-4" />
              Ships to {shipping.city || "your address"} within 2–3 business days
            </div>
          </div>
          <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold">
            Track your order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f8ff] font-sans">
      {/* Minimal header */}
      <div className="border-b border-slate-100 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-black text-slate-900 text-sm">DexPoky</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
          <Lock className="h-3 w-3" /> Secure checkout
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {(["review", "shipping", "payment"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                step === s ? "bg-violet-600 text-white" :
                  (["review","shipping","payment"].indexOf(step) > i) ? "bg-violet-200 text-violet-700" :
                  "bg-slate-200 text-slate-400"
              }`}>
                {["review","shipping","payment"].indexOf(step) > i ? <Check className="h-3 w-3" /> : i+1}
              </div>
              <span className={`text-xs capitalize font-medium ${step === s ? "text-slate-800" : "text-slate-400"}`}>
                {s === "review" ? "Review" : s === "shipping" ? "Shipping" : "Payment"}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Card summary — always visible, collapsible */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 p-4"
            onClick={() => setCardExpanded(!cardExpanded)}
          >
            <img
              src={CARD.img}
              alt={CARD.name}
              className="w-10 h-14 object-contain rounded shrink-0"
              onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='56' viewBox='0 0 40 56'%3E%3Crect width='40' height='56' rx='5' fill='%23e2e8f0'/%3E%3C/svg%3E"; }}
            />
            <div className="flex-1 text-left min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{CARD.name}</p>
              <p className="text-xs text-slate-500">{CARD.set} · {CARD.condition}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-slate-900">${total.toFixed(2)}</p>
              <p className="text-xs text-slate-400">incl. shipping</p>
            </div>
            {cardExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
          </button>

          {cardExpanded && (
            <div className="border-t border-slate-100 px-4 pb-4 space-y-3">
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">{CARD.rarity}</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{CARD.condition}</Badge>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs font-mono">{CARD.number}</Badge>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-black text-violet-700">
                  {CARD.seller.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{CARD.seller}</p>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-slate-500">{CARD.sellerRating} · {CARD.sellerSales} sales</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Card price</span>
                  <span className="font-semibold">${CARD.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Shipping</span>
                  <span className="font-semibold">${CARD.shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-1.5">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Hero card display */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center">
              <img
                src={CARD.img}
                alt={CARD.name}
                className="w-32 drop-shadow-xl"
                onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='179' viewBox='0 0 128 179'%3E%3Crect width='128' height='179' rx='12' fill='%23e2e8f0'/%3E%3C/svg%3E"; }}
              />
              <h2 className="text-xl font-black text-slate-900 mt-4">{CARD.name}</h2>
              <p className="text-sm text-slate-500">{CARD.set}</p>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">{CARD.rarity}</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{CARD.condition}</Badge>
              </div>
            </div>

            {/* Trust signals */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />, label: "Buyer Protection" },
                { icon: <Truck className="h-4 w-4 text-blue-600" />,         label: "Tracked Shipping" },
                { icon: <CreditCard className="h-4 w-4 text-violet-600" />, label: "Secure Payment" },
              ].map(t => (
                <div key={t.label} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center gap-1.5 text-center">
                  {t.icon}
                  <span className="text-xs font-medium text-slate-600 leading-tight">{t.label}</span>
                </div>
              ))}
            </div>

            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-base"
              onClick={() => setStep("shipping")}
            >
              Buy now · ${total.toFixed(2)} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> Powered by Stripe · SSL encrypted
            </p>
          </div>
        )}

        {/* Step: Shipping */}
        {step === "shipping" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Delivery address
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Full name</Label>
                  <Input value={shipping.name} onChange={e => setShipping({...shipping, name: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="Jane Smith" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Email</Label>
                  <Input type="email" value={shipping.email} onChange={e => setShipping({...shipping, email: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="jane@example.com" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Street address</Label>
                  <Input value={shipping.address} onChange={e => setShipping({...shipping, address: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="123 Main St" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">City</Label>
                  <Input value={shipping.city} onChange={e => setShipping({...shipping, city: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="New York" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">State</Label>
                  <Input value={shipping.state} onChange={e => setShipping({...shipping, state: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="NY" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">ZIP code</Label>
                  <Input value={shipping.zip} onChange={e => setShipping({...shipping, zip: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="10001" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Country</Label>
                  <Input value={shipping.country} onChange={e => setShipping({...shipping, country: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="US" />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-blue-700">
              <Truck className="h-4 w-4 shrink-0" />
              <span>Tracked shipping · arrives in <strong>2–3 business days</strong></span>
            </div>

            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl"
              onClick={() => setStep("payment")}
            >
              Continue to payment <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step: Payment */}
        {step === "payment" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Payment details
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-500">Name on card</Label>
                  <Input value={payment.name} onChange={e => setPayment({...payment, name: e.target.value})} className="mt-1 rounded-xl border-slate-200" placeholder="Jane Smith" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Card number</Label>
                  <Input
                    value={payment.number}
                    onChange={e => setPayment({...payment, number: formatCardNumber(e.target.value)})}
                    className="mt-1 rounded-xl border-slate-200 font-mono tracking-wider"
                    placeholder="1234 5678 9012 3456"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Expiry</Label>
                    <Input value={payment.expiry} onChange={e => setPayment({...payment, expiry: formatExpiry(e.target.value)})} className="mt-1 rounded-xl border-slate-200 font-mono" placeholder="MM/YY" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 flex items-center gap-1">CVC <Info className="h-3 w-3 text-slate-300" /></Label>
                    <Input value={payment.cvc} onChange={e => setPayment({...payment, cvc: e.target.value.slice(0,4)})} className="mt-1 rounded-xl border-slate-200 font-mono" placeholder="•••" />
                  </div>
                </div>
              </div>
            </div>

            {/* Order total */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>{CARD.name}</span>
                  <span>${CARD.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Shipping</span>
                  <span>${CARD.shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-slate-900 border-t border-slate-100 pt-2 text-base">
                  <span>Total charged</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <Button
              className="w-full h-13 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base"
              style={{ height: 52 }}
              onClick={() => setStep("success")}
            >
              <Lock className="h-4 w-4 mr-2" /> Pay ${total.toFixed(2)} securely
            </Button>
            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Protected by Stripe · 256-bit SSL
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
