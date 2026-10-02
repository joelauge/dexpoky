import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { useListThreads } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Layers,
  Library,
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
  Sparkles,
  BookOpen,
  Heart,
  MessageSquare,
  ChevronUp,
  Wallet,
  Code2,
  Bot,
  Album,
  BadgeDollarSign,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function JoinCTA({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/sign-up">
            <div className="flex items-center justify-center p-2.5 rounded-md bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
              <Sparkles className="h-5 w-5 shrink-0" />
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Join DexPoky</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div className="mx-2 space-y-2">
      <Link href="/sign-up">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm cursor-pointer hover:bg-primary/90 transition-colors shadow-sm">
          <Sparkles className="h-4 w-4 shrink-0" />
          Join DexPoky — free
        </div>
      </Link>
      <Link href="/sign-in">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors text-sm">
          <LogIn className="h-4 w-4 shrink-0" />
          Sign In
        </div>
      </Link>
    </div>
  );
}

function UserWidget({ collapsed }: { collapsed: boolean }) {
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [location, setLocation] = useLocation();
  const authFetch = useAuthFetch();
  const prevUnreadRef = useRef(0);

  const { data: profile } = useQuery<{ username?: string }>({
    queryKey: ["/api/users/me"],
    queryFn: () => authFetch("/api/users/me").then(r => r.ok ? r.json() : null),
    enabled: !!isSignedIn,
  });

  const { data: threads } = useListThreads({
    query: {
      queryKey: ["/api/threads"],
      refetchInterval: 30000,
      enabled: !!isSignedIn,
    },
  });

  const totalUnread = threads?.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0) ?? 0;

  // Request browser notification permission and fire a notification when new messages arrive
  useEffect(() => {
    if (!isSignedIn || totalUnread === 0) return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }

    if (totalUnread > prevUnreadRef.current && !location.startsWith("/inbox")) {
      if (Notification.permission === "granted") {
        const n = new Notification("DexPoky — New Message", {
          body: `You have ${totalUnread} unread message${totalUnread !== 1 ? "s" : ""} in your inbox.`,
          icon: "/dexpoky-logo.png",
        });
        n.onclick = () => {
          window.focus();
          setLocation("/inbox");
          n.close();
        };
      }
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread, isSignedIn, location, setLocation]);

  const displayName = profile?.username || user?.username || user?.firstName?.split(" ")[0] || "My Profile";

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
        ) : null
      }
    >
      {collapsed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center justify-center p-2.5 rounded-md cursor-pointer hover:bg-secondary transition-colors relative">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
              {totalUnread > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
              )}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/inbox" className="flex items-center gap-2 cursor-pointer">
                <MessageSquare className="h-4 w-4" /> Inbox
                {totalUnread > 0 && (
                  <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/wallet" className="flex items-center gap-2 cursor-pointer">
                <Wallet className="h-4 w-4" /> Wallet
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/agents" className="flex items-center gap-2 cursor-pointer">
                <Bot className="h-4 w-4" /> DexAgents
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/subscription" className="flex items-center gap-2 cursor-pointer">
                <Sparkles className="h-4 w-4" /> Subscription
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/developer" className="flex items-center gap-2 cursor-pointer">
                <Code2 className="h-4 w-4" /> DexPoky API
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut(() => setLocation("/marketplace"))}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="mx-2 rounded-xl border bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2.5 mb-0">
                <div className="relative shrink-0">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  {totalUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-background" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
                </div>
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-52 mb-1">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/inbox" className="flex items-center gap-2 cursor-pointer">
                <MessageSquare className="h-4 w-4" /> Inbox
                {totalUnread > 0 && (
                  <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/wallet" className="flex items-center gap-2 cursor-pointer">
                <Wallet className="h-4 w-4" /> Wallet
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/agents" className="flex items-center gap-2 cursor-pointer">
                <Bot className="h-4 w-4" /> DexAgents
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/subscription" className="flex items-center gap-2 cursor-pointer">
                <Sparkles className="h-4 w-4" /> Subscription
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/developer" className="flex items-center gap-2 cursor-pointer">
                <Code2 className="h-4 w-4" /> DexPoky API
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut(() => setLocation("/marketplace"))}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Show>
  );
}

function MobileProfileBar() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const authFetch = useAuthFetch();
  const barRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery<{ username?: string }>({
    queryKey: ["/api/users/me"],
    queryFn: () => authFetch("/api/users/me").then(r => r.ok ? r.json() : null),
    enabled: !!isSignedIn,
  });

  const { data: threads } = useListThreads({
    query: { queryKey: ["/api/threads"], refetchInterval: 30000, enabled: !!isSignedIn },
  });
  const totalUnread = threads?.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0) ?? 0;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  const navTo = (href: string) => { close(); setLocation(href); };

  const displayName = profile?.username || user?.username || user?.firstName || "My Account";

  if (!isSignedIn) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card border-t px-4 py-3 flex gap-2 safe-area-pb">
        <Link href="/sign-in" className="flex-1">
          <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-secondary transition-colors">
            <LogIn className="h-4 w-4" /> Sign In
          </div>
        </Link>
        <Link href="/sign-up" className="flex-1">
          <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-colors">
            <Sparkles className="h-4 w-4" /> Join Free
          </div>
        </Link>
      </div>
    );
  }

  const menuItems = [
    { href: "/profile",      icon: User,         label: "Profile" },
    { href: "/inbox",        icon: MessageSquare, label: "Inbox",  badge: totalUnread },
    { href: "/wallet",       icon: Wallet,        label: "Wallet" },
    { href: "/agents",       icon: Bot,           label: "DexAgents" },
    { href: "/subscription", icon: Sparkles,      label: "Subscription" },
    { href: "/developer",    icon: Code2,         label: "DexPoky API" },
  ];

  return (
    <div ref={barRef} className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      {/* Expanding menu panel */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out bg-card border-t border-x rounded-t-2xl shadow-2xl",
          open ? "max-h-80 opacity-100" : "max-h-0 opacity-0 pointer-events-none",
        )}
      >
        <div className="px-2 pt-3 pb-2 space-y-0.5">
          {menuItems.map(({ href, icon: Icon, label, badge }) => (
            <button
              key={href}
              onClick={() => navTo(href)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                location === href
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {badge != null && badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          ))}
          <div className="my-1 mx-4 border-t" />
          <button
            onClick={() => { close(); signOut(() => setLocation("/marketplace")); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Profile trigger bar */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full bg-card border-t px-4 py-3 flex items-center gap-3 active:bg-secondary transition-colors"
      >
        <div className="relative shrink-0">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover border border-border" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
          )}
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-card" />
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
        <ChevronUp className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open ? "" : "rotate-180")} />
      </button>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { isSignedIn } = useUser();

  const publicNavItems = [
    { href: "/marketplace", label: "Find/Buy - Marketplace", icon: Store },
  ];

  const authNavItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/collection", label: "Collection", icon: Layers },
    { href: "/sets", label: "Sets", icon: Album },
    { href: "/binders", label: "Binders", icon: BookMarked },
    { href: "/card-lookup", label: "Card Lookup", icon: BadgeDollarSign },
    { href: "/wishlist", label: "Wishlist", icon: Heart },
    { href: "/decks", label: "Decks", icon: Library },
    { href: "/share", label: "Share/Sell", icon: Share2 },
    { href: "/rules", label: "Rules", icon: BookOpen },
  ];

  const quickActions = [
    { href: "/scan", label: "Scan Card", icon: ScanLine },
    { href: "/collection/new", label: "Add Card", icon: PlusCircle },
  ];

  const visibleNavItems = isSignedIn
    ? [...authNavItems, ...publicNavItems]
    : publicNavItems;

  const MobileNavLinks = () => (
    <>
      <div className="space-y-1 mb-8">
        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</h3>
        {visibleNavItems.map((item) => {
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

      {isSignedIn && (
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
      )}
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background flex flex-col md:flex-row">

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card sticky top-0 z-30">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="!h-18 !w-18 [&_svg]:size-12">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <VisuallyHidden.Root>
                <SheetTitle>Navigation Menu</SheetTitle>
                <SheetDescription>Main navigation for DexPoky app</SheetDescription>
              </VisuallyHidden.Root>
              <div className="p-6 border-b flex justify-center">
                <img src="/dexpoky-logo.png" alt="DexPoky" className="w-44 h-auto object-contain" />
              </div>
              <ScrollArea className="h-[calc(100vh-112px)] px-4 py-6">
                <MobileNavLinks />
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <img src="/dexpoky-logo.png" alt="DexPoky" className="h-10 w-auto object-contain" />
        </header>

        {/* Desktop Sidebar */}
        <aside className={`hidden md:flex flex-col border-r bg-card h-screen sticky top-0 transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
          <div className={`border-b flex flex-col items-center transition-all duration-300 ${collapsed ? "p-3 gap-2" : "p-5 gap-3"}`}>
            {!collapsed && (
              <Link href={isSignedIn ? "/" : "/marketplace"}>
                <img src="/dexpoky-logo.png" alt="DexPoky" className="w-48 h-auto object-contain cursor-pointer" />
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
              {visibleNavItems.map((item) => {
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

            {isSignedIn && (
              <>
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
              </>
            )}

            {/* Join CTA for logged-out users */}
            {!isSignedIn && !collapsed && (
              <div className="px-2 mt-4">
                <JoinCTA collapsed={false} />
              </div>
            )}
            {!isSignedIn && collapsed && (
              <div className="px-2 mt-2">
                <JoinCTA collapsed={true} />
              </div>
            )}
          </ScrollArea>

          {/* User widget at bottom */}
          <div className="border-t py-3">
            <UserWidget collapsed={collapsed} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-[100vw] pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom profile bar */}
        <MobileProfileBar />

        {/* Floating Scan FAB — only when signed in, hidden on /scan page */}
        {isSignedIn && location !== "/scan" && (
          <Link href="/scan">
            <button
              className="fixed bottom-[4.5rem] right-5 md:bottom-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-5 py-3.5 font-bold text-sm active:scale-95 transition-transform hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
