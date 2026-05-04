import { ReactNode, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { RulebookContent } from "@/components/rulebook-content";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

export interface RulesSheetQuickLink {
  sectionId: string;
  label: string;
}

interface RulesSheetProps {
  trigger?: ReactNode;
  /**
   * Section id (matches `rulebook.json`) the sheet should jump to on open —
   * e.g. "deck-building" for deck-builder pages, "card-types" or "setup"
   * elsewhere. Falls back to the top of the rulebook when omitted.
   */
  defaultSectionId?: string;
  /**
   * Optional quick-link chips rendered just under the sheet header so users
   * can hop directly between the most relevant sections for the current page
   * (e.g. Deck Building / Card Types / Game Setup on the deck pages) without
   * scrolling the TOC.
   */
  quickLinks?: RulesSheetQuickLink[];
}

export function RulesSheet({
  trigger,
  defaultSectionId,
  quickLinks,
}: RulesSheetProps) {
  // `nonce` bumps when a quick-link is clicked so the inner RulebookContent
  // remounts and re-runs its initial-focus effect on the newly chosen section.
  const [activeSection, setActiveSection] = useState<string | undefined>(
    defaultSectionId,
  );
  const [nonce, setNonce] = useState(0);

  const focusSection = (id: string) => {
    setActiveSection(id);
    setNonce((n) => n + 1);
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open) {
          setActiveSection(defaultSectionId);
          setNonce((n) => n + 1);
        }
      }}
    >
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Rulebook
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Pokémon TCG Rulebook
          </SheetTitle>
          <VisuallyHidden.Root>
            <SheetDescription>
              Official Pokémon Trading Card Game rules — search or browse by
              section.
            </SheetDescription>
          </VisuallyHidden.Root>
          {quickLinks && quickLinks.length > 0 && (
            <div
              className="flex flex-wrap gap-2 pt-2"
              aria-label="Jump to relevant rulebook section"
            >
              {quickLinks.map((q) => (
                <Button
                  key={q.sectionId}
                  type="button"
                  size="sm"
                  variant={
                    activeSection === q.sectionId ? "default" : "secondary"
                  }
                  className="h-7 px-2 text-xs"
                  onClick={() => focusSection(q.sectionId)}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          )}
        </SheetHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <RulebookContent
            key={`${activeSection ?? "top"}-${nonce}`}
            variant="sheet"
            defaultSectionId={activeSection}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
