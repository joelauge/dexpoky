import { useLocation } from "wouter";

const LEVEL_STYLES: Record<string, string> = {
  "New": "bg-slate-100 text-slate-600 border-slate-200",
  "Bronze": "bg-amber-50 text-amber-700 border-amber-200",
  "Silver": "bg-slate-100 text-slate-500 border-slate-300",
  "Gold": "bg-yellow-50 text-yellow-700 border-yellow-300",
  "Platinum": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Top Rated": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface SellerBadgeProps {
  level: string;
  positivePercent: number | null;
  clerkId: string;
  ratingCount: number;
}

export function SellerBadge({ level, positivePercent, clerkId, ratingCount }: SellerBadgeProps) {
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES["New"];
  const [, setLocation] = useLocation();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setLocation(`/feedback/${clerkId}`);
      }}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold cursor-pointer hover:opacity-75 transition-opacity ${style}`}
    >
      <span>{level}</span>
      {positivePercent !== null && ratingCount > 0 && (
        <span className="opacity-75">· {positivePercent.toFixed(1)}% positive</span>
      )}
    </button>
  );
}
