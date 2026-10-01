import { useEffect, useState } from "react";
import { Check, ImageOff, Search, X } from "lucide-react";

export interface ScanPrinting {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId?: string;
  cardNumber: string;
  rarity?: string | null;
}

function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function filterScanPrintings<T extends ScanPrinting>(variants: T[], search: string): T[] {
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  if (!terms.length) return variants;
  return variants.filter((variant) => {
    const text = normalizeSearch(
      [variant.name, variant.setName, variant.setId, variant.cardNumber].filter(Boolean).join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
}

interface ScanPrintingPickerProps {
  entryId: string;
  variants: ScanPrinting[];
  selectedId?: string;
  onSelect: (variant: ScanPrinting) => void;
}

export function ScanPrintingPicker({ entryId, variants, selectedId, onSelect }: ScanPrintingPickerProps) {
  const [search, setSearch] = useState("");
  const matches = filterScanPrintings(variants, search);
  const inputId = `printing-search-${entryId}`;
  const currentId = selectedId ?? variants[0]?.id;

  return (
    <section aria-label="Choose a card printing" className="space-y-2">
      <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Choose printing
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id={inputId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search set, card name, or number"
          data-testid={`input-printing-search-${entryId}`}
          className="w-full min-h-10 rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear printing search"
            onClick={() => setSearch("")}
            data-testid={`button-clear-printing-search-${entryId}`}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      <p
        role="status"
        data-testid={`status-printing-count-${entryId}`}
        className="text-xs text-muted-foreground"
      >
        {search.trim() ? `${matches.length} of ${variants.length} printings match` : `${variants.length} printings available`}
      </p>
      {matches.length ? (
        <div
          className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[26rem] overflow-y-auto p-1"
          data-testid={`list-printings-${entryId}`}
        >
          {matches.map((variant) => (
            <PrintingOption
              key={variant.id}
              variant={variant}
              selected={variant.id === currentId}
              testId={`button-printing-${entryId}-${variant.id}`}
              onSelect={() => onSelect(variant)}
            />
          ))}
        </div>
      ) : (
        <p data-testid={`text-no-printing-match-${entryId}`} className="py-4 text-sm text-muted-foreground">
          No printings match this search. Clear it or try another set, name, or number.
        </p>
      )}
    </section>
  );
}

function PrintingOption({
  variant,
  selected,
  testId,
  onSelect,
}: {
  variant: ScanPrinting;
  selected: boolean;
  testId: string;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [variant.imageUrl]);
  const hasImage = !!variant.imageUrl && !imageFailed;
  const setLabel = variant.setName || variant.setId || "Set not provided";
  const numberLabel = variant.cardNumber ? `#${variant.cardNumber}` : "Number not provided";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${variant.name}, ${setLabel}, ${numberLabel}`}
      data-testid={testId}
      className={`min-w-0 rounded-lg border-2 bg-background text-left overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60"
      }`}
    >
      <div className="aspect-[5/7] bg-muted relative">
        {hasImage ? (
          <img
            src={variant.imageUrl}
            alt={`${variant.name} — ${setLabel} ${numberLabel}`}
            loading="lazy"
            className="w-full h-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
            <ImageOff aria-hidden="true" className="h-6 w-6" />
            <span className="text-[10px]">Artwork unavailable</span>
          </div>
        )}
        {selected && (
          <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
            <Check aria-hidden="true" className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="p-1.5 space-y-0.5">
        <p className="text-[11px] font-medium break-words">{variant.name}</p>
        <p className="text-[10px] text-muted-foreground break-words">{setLabel}</p>
        <p className="text-[10px] text-muted-foreground break-words">{numberLabel}</p>
      </div>
    </button>
  );
}