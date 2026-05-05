import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { HoloCard } from "@/components/holo-card";
import { User } from "lucide-react";

interface Card {
  id: number;
  name: string;
  pokemonName: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string;
  condition: string;
  imageUrl: string | null;
  estimatedValue: number | null;
}

interface PublicUser {
  clerkId: string;
  username: string | null;
  avatarUrl: string | null;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function PublicCardView() {
  const [, params] = useRoute("/view/card/:id");
  const cardId = params?.id ? parseInt(params.id) : 0;
  const owner = new URLSearchParams(window.location.search).get("owner");

  const { data: card } = useQuery<Card>({
    queryKey: ["/api/cards/public", cardId],
    queryFn: () => fetch(`/api/cards/${cardId}`).then(r => r.json()),
    enabled: !!cardId,
  });

  const { data: profile } = useQuery<PublicUser>({
    queryKey: ["/api/users/public", owner],
    queryFn: () => fetch(`/api/users/${owner}`).then(r => r.json()),
    enabled: !!owner,
  });

  const displayName = profile?.username ?? "A DexPoky Collector";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col select-none">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt={displayName} className="h-9 w-9 rounded-full border-2 border-white/20 object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
              <User className="h-4 w-4 text-white/60" />
            </div>
          )}
          <div>
            <p className="text-white/90 text-sm font-semibold leading-tight">{displayName}</p>
            <p className="text-white/40 text-xs leading-tight">Pokémon card collector</p>
          </div>
        </div>
        <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-9 w-9 rounded-full opacity-90" />
      </header>

      {/* Card showcase */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 gap-5">

        {/* Card with 3D holo effect */}
        <div className="relative w-64 sm:w-72 md:w-80">
          <div
            className="absolute inset-0 scale-[1.15] blur-3xl opacity-25 rounded-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 60%, #6366f1 0%, #8b5cf6 40%, transparent 70%)" }}
          />
          <div className="relative">
            <HoloCard imageUrl={card?.imageUrl} name={card?.name ?? "Card"} />
          </div>
        </div>

        {/* Card info */}
        <div className="text-center space-y-2 max-w-xs">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">{card?.name}</h1>
          {(card?.pokemonName || card?.setName) && (
            <p className="text-white/45 text-sm">
              {[card.pokemonName, card.setName].filter(Boolean).join(" · ")}
              {card?.cardNumber && <span className="ml-2 font-mono text-xs bg-white/10 px-2 py-0.5 rounded">{card.cardNumber}</span>}
            </p>
          )}

          {card && (
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              {card.rarity && (
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RARITY_COLORS[card.rarity] ?? "bg-white/10 border-white/10 text-white/60"}`}>
                  {formatLabel(card.rarity)}
                </span>
              )}
              {card.condition && (
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CONDITION_COLORS[card.condition] ?? "bg-white/10 border-white/10 text-white/60"}`}>
                  {formatLabel(card.condition)}
                </span>
              )}
            </div>
          )}

          {card?.estimatedValue != null && card.estimatedValue > 0 && (
            <div className="inline-flex flex-col items-center bg-white/5 border border-white/10 rounded-2xl px-6 py-3 mt-1">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">Estimated Value</p>
              <p className="text-white text-2xl font-black">{formatCurrency(card.estimatedValue)}</p>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 px-6 pb-8 pt-4 border-t border-white/5 text-center">
        <p className="text-white/35 text-xs mb-3">Trade · Collect · Battle</p>
        <a
          href={`${basePath}/sign-up`}
          className="inline-flex items-center justify-center w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition-colors shadow-lg shadow-indigo-900/50"
        >
          Join DexPoky to share your cards like this! ✨
        </a>
        <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
          <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-5 w-5 rounded-full" />
          <span className="text-white text-sm font-bold tracking-tight">DexPoky</span>
        </div>
      </div>
    </div>
  );
}
