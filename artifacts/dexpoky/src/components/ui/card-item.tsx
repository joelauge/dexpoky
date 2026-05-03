import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card as CardType } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatLabel, RARITY_COLORS, CONDITION_COLORS } from "@/lib/constants";
import { ImageIcon } from "lucide-react";

interface CardItemProps {
  card: CardType;
  href?: string;
  showPrice?: boolean;
}

export function CardItem({ card, href, showPrice = false }: CardItemProps) {
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
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-2 opacity-50" />
            <span className="text-xs font-medium uppercase tracking-wider opacity-70">No Image</span>
          </div>
        )}
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

        <div className="mt-auto pt-2 border-t flex items-center justify-between gap-1">
          <Badge variant="outline" className={`text-[10px] shrink-0 ${CONDITION_COLORS[card.condition] || ""}`}>
            {formatLabel(card.condition)}
          </Badge>
          <span className="font-bold text-sm text-foreground truncate text-right">
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
