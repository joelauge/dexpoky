import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card as CardType } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatLabel, RARITY_COLORS, CONDITION_COLORS } from "@/lib/constants";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

interface CardItemProps {
  card: CardType & { quantity?: number };
  href?: string;
  showPrice?: boolean;
}

export function CardItem({ card, href, showPrice = false }: CardItemProps) {
  const isNew =
    card.agentAcquiredAt != null &&
    Date.now() - new Date(card.agentAcquiredAt).getTime() < THREE_DAYS_MS;

  const content = (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-card rounded-xl border shadow-sm flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="aspect-[3/4] relative bg-muted/50 border-b flex items-center justify-center overflow-hidden rounded-t-xl">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[144px] opacity-[0.12] grayscale select-none pointer-events-none" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 items-start">
          {card.quantity && card.quantity > 1 ? (
            <Badge className="bg-primary hover:bg-primary text-primary-foreground font-bold text-[10px] shadow-sm border-0 px-1.5 py-0">
              x{card.quantity}
            </Badge>
          ) : null}
          {isNew && (
            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm border-0">
              New
            </Badge>
          )}
        </div>
        {card.forSale && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="bg-white/90 text-primary font-bold shadow-sm backdrop-blur-sm border-white/20">
              For Sale
            </Badge>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
          <Badge className={`text-[10px] uppercase font-bold tracking-wider border-0 shadow-sm ${RARITY_COLORS[card.rarity] || ""}`}>
            {formatLabel(card.rarity)}
          </Badge>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="flex justify-between items-start gap-1 mb-0.5">
          <h3 className="font-bold text-foreground text-sm line-clamp-1 flex-1 leading-tight">{card.name}</h3>
          {card.cardNumber && (
            <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1 py-0.5 rounded shrink-0">
              {card.cardNumber}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
          {card.pokemonName}{card.setName ? ` • ${card.setName}` : ""}
        </p>

        <div className="mt-auto pt-2 border-t flex flex-col gap-1">
          <Badge variant="outline" className={`text-[10px] self-start ${CONDITION_COLORS[card.condition] || ""}`}>
            {formatLabel(card.condition)}
          </Badge>
          <span className="font-bold text-sm text-foreground">
            {formatCurrency(showPrice ? card.listingPrice : card.estimatedValue)}
          </span>
        </div>
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}
