import { Slider } from "@/components/ui/slider";
import { SlidersHorizontal } from "lucide-react";

interface CardSizeSliderProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}

export function CardSizeSlider({ value, onChange, className }: CardSizeSliderProps) {
  return (
    <div className={`flex items-center gap-2 min-w-[130px] ${className ?? ""}`}>
      <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Slider
        min={1}
        max={5}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-24"
        aria-label="Card size"
      />
    </div>
  );
}
