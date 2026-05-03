import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Layers, 
  FolderTree, 
  Store, 
  PlusCircle,
  Menu,
  Tags,
  ScanLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/collection", label: "Collection", icon: Layers },
    { href: "/categories", label: "Categories", icon: FolderTree },
    { href: "/marketplace", label: "Marketplace", icon: Store },
  ];

  const quickActions = [
    { href: "/scan", label: "Scan Card", icon: ScanLine },
    { href: "/collection/new", label: "Add Card", icon: PlusCircle },
    { href: "/sell", label: "Sell Card", icon: Tags },
  ];

  const NavLinks = () => (
    <>
      <div className="space-y-1 mb-8">
        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</h3>
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="space-y-1">
        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>
        {quickActions.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer">
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DexPoky" className="h-9 w-9 object-contain" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <VisuallyHidden.Root>
              <SheetTitle>Navigation Menu</SheetTitle>
              <SheetDescription>Main navigation for DexPoky app</SheetDescription>
            </VisuallyHidden.Root>
            <div className="p-6 border-b">
              <img src="/logo.png" alt="DexPoky" className="h-12 w-12 object-contain" />
            </div>
            <ScrollArea className="h-[calc(100vh-80px)] px-4 py-6">
              <NavLinks />
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0">
        <div className="p-5 border-b">
          <Link href="/">
            <img src="/logo.png" alt="DexPoky" className="h-40 w-40 object-contain cursor-pointer" />
          </Link>
        </div>
        <ScrollArea className="flex-1 px-4 py-6">
          <NavLinks />
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 max-w-[100vw]">
        {children}
      </main>
    </div>
  );
}