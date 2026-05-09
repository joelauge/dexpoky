import { useQuery } from "@tanstack/react-query";
import { User, Package } from "lucide-react";

interface Card {
  id: number;
  name: string;
  imageUrl: string | null;
  rarity: string;
  categoryName: string | null;
}

interface PublicUser {
  clerkId: string;
  username: string | null;
  avatarUrl: string | null;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function PublicCollectionView() {
  const owner = new URLSearchParams(window.location.search).get("owner");

  const { data: cards = [], isLoading } = useQuery<Card[]>({
    queryKey: ["/api/cards/public/collection"],
    queryFn: () => fetch("/api/cards").then(r => r.json()),
  });

  const { data: profile } = useQuery<PublicUser>({
    queryKey: ["/api/users/public", owner],
    queryFn: () => fetch(`/api/users/${owner}`).then(r => r.json()),
    enabled: !!owner,
  });

  const displayName = profile?.username ?? "Anonymous Trainer";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-white/5 backdrop-blur-sm sticky top-0 z-10 bg-slate-950/80">
        <div className="flex items-center gap-2.5 min-w-0">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt={displayName} className="h-9 w-9 rounded-full border-2 border-white/20 object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-white/60" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white/90 text-sm font-semibold leading-tight truncate">
              {profile?.username ?? <em className="not-italic font-normal text-white/50">Anonymous Trainer</em>}
            </p>
            <p className="text-white/40 text-xs leading-tight">Pokémon card collector</p>
          </div>
        </div>
        <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-9 w-9 rounded-full opacity-90 shrink-0 ml-3" />
      </header>

      {/* Title */}
      <div className="px-5 pt-6 pb-2 text-center">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">
          {profile?.username ? `${profile.username}'s Collection` : "My Collection"}
        </h1>
        {!isLoading && (
          <p className="text-white/40 text-sm">{cards.length} card{cards.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Cards grid */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3 max-w-4xl mx-auto">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-full aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package className="h-12 w-12 text-white/20" />
            <p className="text-white/40 text-sm">No cards yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3 max-w-4xl mx-auto">
            {cards.map((card) => (
              <div
                key={card.id}
                className="group relative rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/25 transition-all hover:scale-[1.03] shadow-lg"
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-full aspect-[3/4] object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full aspect-[3/4] flex items-center justify-center bg-white/5">
                    <span className="text-2xl">🃏</span>
                  </div>
                )}
                {card.categoryName && (
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[9px] font-bold bg-black/60 text-white/70 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                      {card.categoryName}
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-[10px] font-bold truncate leading-tight">{card.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="shrink-0 px-6 pb-8 pt-4 border-t border-white/5 text-center">
        <p className="text-white/35 text-xs mb-3">Trade · Collect · Battle</p>
        <a
          href={`${basePath}/sign-up`}
          className="inline-flex items-center justify-center w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition-colors shadow-lg shadow-indigo-900/50"
        >
          Join DexPoky to share your collection like this! ✨
        </a>
        <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
          <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-5 w-5 rounded-full" />
          <span className="text-white text-sm font-bold tracking-tight">DexPoky</span>
        </div>
      </div>
    </div>
  );
}
