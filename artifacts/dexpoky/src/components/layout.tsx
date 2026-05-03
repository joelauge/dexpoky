import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import {
  LayoutDashboard,
  Layers,
  FolderTree,
  Store,
  Share2,
  PlusCircle,
  Menu,
  ScanLine,
  User,
  LogOut,
  LogIn,
  Scan,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LayoutProps {
  children: ReactNode;
}

function PokeBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" fill="white" stroke="#1e293b" strokeWidth="2" />
      <path d="M1 20 Q1 1 20 1 Q39 1 39 20Z" fill="#ef4444" />
      <rect x="1" y="18.5" width="38" height="3" fill="#1e293b" />
      <circle cx="20" cy="20" r="5.5" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="2.5" fill="#f8fafc" />
    </svg>
  );
}

function UserWidget({ collapsed }: { collapsed: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();

  return (
    <Show
      when="signed-in"
      fallback={
        collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/sign-in">
                <div className="flex items-center justify-center p-2.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors">
                  <LogIn className="h-5 w-5 shrink-0" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Sign In</TooltipContent>
          </Tooltip>
        ) : (
          <div className="px-2 space-y-1">
            <Link href="/sign-in">
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors text-sm">
                <LogIn className="h-4 w-4 shrink-0" />
                Sign In
              </div>
            </Link>
            <Link href="/sign-up">
              <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer transition-colors text-sm font-medium">
                <User className="h-4 w-4 shrink-0" />
                Create Account
              </div>
            </Link>
          </div>
        )
      }
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/profile">
              <div className="flex items-center justify-center p-2.5 rounded-md cursor-pointer hover:bg-secondary transition-colors">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{user?.firstName ?? "Profile"}</TooltipContent>
        </Tooltip>
      ) : (
        <div className="mx-2 rounded-xl border bg-muted/30 p-3">
          <Link href="/profile">
            <div className="flex items-center gap-2.5 cursor-pointer mb-2 hover:opacity-80 transition-opacity">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-border shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user?.firstName ?? "My Profile"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
          </Link>
          <button
            onClick={() => signOut(() => setLocation("/"))}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <LogOut className="h-3 w-3" /> Sign Out
          </button>
        </div>
      )}
    </Show>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/collection", label: "Collection", icon: Layers },
    { href: "/categories", label: "Categories", icon: FolderTree },
    { href: "/marketplace", label: "Marketplace", icon: Store },
    { href: "/share", label: "Share", icon: Share2 },
  ];

  const quickActions = [
    { href: "/scan", label: "Scan Card", icon: ScanLine },
    { href: "/collection/new", label: "Add Card", icon: PlusCircle },
  ];

  const MobileNavLinks = () => (
    <>
      <div className="space-y-1 mb-8">
        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</h3>
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors cursor-pointer ${
                isActive ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}>
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="space-y-1 mb-8">
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
      <div className="space-y-1">
        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Account</h3>
        <Show
          when="signed-in"
          fallback={
            <>
              <Link href="/sign-in">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors">
                  <LogIn className="h-5 w-5" /><span>Sign In</span>
                </div>
              </Link>
              <Link href="/sign-up">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-md text-primary hover:bg-secondary cursor-pointer transition-colors font-medium">
                  <User className="h-5 w-5" /><span>Create Account</span>
                </div>
              </Link>
            </>
          }
        >
          <Link href="/profile">
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors cursor-pointer ${
              location === "/profile" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}>
              <User className="h-5 w-5" /><span>Profile</span>
            </div>
          </Link>
        </Show>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background flex flex-col md:flex-row">

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card sticky top-0 z-30">
          <img src="/logo.png" alt="DexPoky" className="h-9 w-9 object-contain" />
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
              <div className="p-6 border-b flex justify-center">
                <img src="/logo.png" alt="DexPoky" className="h-20 w-20 object-contain" />
              </div>
              <ScrollArea className="h-[calc(100vh-112px)] px-4 py-6">
                <MobileNavLinks />
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </header>

        {/* Desktop Sidebar */}
        <aside className={`hidden md:flex flex-col border-r bg-card h-screen sticky top-0 transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
          <div className={`border-b flex flex-col items-center transition-all duration-300 ${collapsed ? "p-3 gap-2" : "p-5 gap-3"}`}>
            {!collapsed && (
              <Link href="/">
                <img src="/logo.png" alt="DexPoky" className="h-40 w-40 object-contain cursor-pointer" />
              </Link>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-secondary transition-colors"
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            >
              {collapsed ? <PokeBallIcon className="h-7 w-7" /> : <Menu className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>

          <ScrollArea className="flex-1 py-4">
            {!collapsed && <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</p>}
            <div className={`space-y-1 mb-6 ${collapsed ? "px-2" : "px-2"}`}>
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                const btn = (
                  <Link key={item.href} href={item.href}>
                    <div className={`flex items-center rounded-md transition-colors cursor-pointer ${
                      collapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
                    } ${isActive ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </div>
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : btn;
              })}
            </div>

            {!collapsed && <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Actions</p>}
            <div className={`space-y-1 ${collapsed ? "px-2" : "px-2"}`}>
              {quickActions.map((item) => {
                const btn = (
                  <Link key={item.href} href={item.href}>
                    <div className={`flex items-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:bg-secondary hover:text-foreground ${
                      collapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
                    }`}>
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </div>
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : btn;
              })}
            </div>
          </ScrollArea>

          {/* User widget at bottom */}
          <div className="border-t py-3">
            <UserWidget collapsed={collapsed} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-[100vw]">
          {children}
        </main>

        {/* Floating Scan FAB — hidden on /scan page */}
        {location !== "/scan" && (
          <Link href="/scan">
            <button
              className="fixed bottom-6 right-5 z-50 flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-5 py-3.5 font-bold text-sm active:scale-95 transition-transform hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label="Scan a card"
            >
              <Scan className="h-5 w-5" />
              <span>Scan</span>
            </button>
          </Link>
        )}
      </div>
    </TooltipProvider>
  );
}
