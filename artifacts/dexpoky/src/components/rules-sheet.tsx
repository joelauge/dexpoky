import { ReactNode } from "react";
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

interface RulesSheetProps {
  trigger?: ReactNode;
}

export function RulesSheet({ trigger }: RulesSheetProps) {
  return (
    <Sheet>
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
        </SheetHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <RulebookContent variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
