import { useEffect, useRef, type ComponentType } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser, useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Collection from "@/pages/collection/index";
import NewCard from "@/pages/collection/new";
import EditCard from "@/pages/collection/edit";
import CardDetail from "@/pages/collection/[id]";
import Categories from "@/pages/categories/index";
import Decks from "@/pages/decks/index";
import NewDeck from "@/pages/decks/new";
import DeckDetail from "@/pages/decks/[id]";
import Marketplace from "@/pages/marketplace/index";
import ListingDetail from "@/pages/marketplace/[id]";
import Sell from "@/pages/sell";
import SharePage from "@/pages/share";
import Scan from "@/pages/scan";
import ScanBulk from "@/pages/scan-bulk";
import Profile from "@/pages/profile";
import SellerProfile from "@/pages/seller/[clerkId]";
import PublicCardView from "@/pages/view/card/[id]";
import PublicCategoryView from "@/pages/view/category/[id]";
import PublicCollectionView from "@/pages/view/collection";
import PublicListingView from "@/pages/view/listing/[id]";
import GroupShareView from "@/pages/view/group/[code]";
import ShortLinkRedirect from "@/pages/s/[code]";
import WantedPublicPage from "@/pages/w/[code]";
import FeedbackPage from "@/pages/feedback/[clerkId]";
import SubscriptionPage from "@/pages/subscription";
import AdminPayouts from "@/pages/admin/payouts";
import RulesPage from "@/pages/rules";
import Wishlist from "@/pages/wishlist";
import InboxPage from "@/pages/inbox/index";
import WalletPage from "@/pages/wallet/index";
import { UsernameGate } from "@/components/username-gate";
import { usePaymentSSE } from "@/hooks/use-payment-sse";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
  },
  variables: {
    colorPrimary: "#2563eb",
    colorForeground: "#0f172a",
    colorMutedForeground: "#64748b",
    colorDanger: "#ef4444",
    colorBackground: "#f8fafc",
    colorInput: "#ffffff",
    colorInputForeground: "#0f172a",
    colorNeutral: "#cbd5e1",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-100",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-bold text-2xl",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 font-medium text-sm",
    footerActionLink: "text-blue-600 hover:text-blue-700 font-medium",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400 text-sm",
    identityPreviewEditButton: "text-blue-600",
    formFieldSuccessText: "text-green-600",
    alertText: "text-red-700",
    logoBox: "flex justify-center py-2",
    logoImage: "h-20 w-20 object-contain rounded-full",
    socialButtonsBlockButton: "border border-slate-200 hover:bg-slate-50 transition-colors",
    formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors",
    formFieldInput: "border-slate-200 bg-white text-slate-900 focus:ring-blue-500",
    footerAction: "bg-slate-50 border-t border-slate-100",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200 rounded-lg",
    otpCodeFieldInput: "border-slate-200 text-slate-900",
    formFieldRow: "",
    main: "px-8 py-4",
  },
};

function SignInPage() {
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get("redirect_url") ?? undefined;
  const signUpUrl = redirectUrl
    ? `${basePath}/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
    : `${basePath}/sign-up`;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={signUpUrl}
          forceRedirectUrl={redirectUrl}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get("redirect_url") ?? undefined;
  const signInUrl = redirectUrl
    ? `${basePath}/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
    : `${basePath}/sign-in`;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={signInUrl}
          forceRedirectUrl={redirectUrl}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/marketplace");
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn) return null;
  return <Component />;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/marketplace");
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn) return null;
  return <Dashboard />;
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function ClerkAuthSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

function PaymentSSEGlobal() {
  usePaymentSSE();
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back to DexPoky", subtitle: "Sign in to your account" } },
        signUp: { start: { title: "Join DexPoky", subtitle: "Create your free account today" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ScrollToTop />
          <ClerkAuthSync />
          <ClerkQueryClientCacheInvalidator />
          <PaymentSSEGlobal />
          <UsernameGate>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/collection" component={() => <ProtectedRoute component={Collection} />} />
            <Route path="/collection/new" component={() => <ProtectedRoute component={NewCard} />} />
            <Route path="/collection/:id/edit" component={() => <ProtectedRoute component={EditCard} />} />
            <Route path="/collection/:id" component={() => <ProtectedRoute component={CardDetail} />} />
            <Route path="/categories" component={() => <ProtectedRoute component={Categories} />} />
            <Route path="/decks" component={() => <ProtectedRoute component={Decks} />} />
            <Route path="/decks/new" component={() => <ProtectedRoute component={NewDeck} />} />
            <Route path="/decks/:id" component={() => <ProtectedRoute component={DeckDetail} />} />
            <Route path="/rules" component={() => <ProtectedRoute component={RulesPage} />} />
            <Route path="/wishlist" component={() => <ProtectedRoute component={Wishlist} />} />
            <Route path="/inbox" component={() => <ProtectedRoute component={InboxPage} />} />
            <Route path="/wallet" component={() => <ProtectedRoute component={WalletPage} />} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/marketplace/:id" component={ListingDetail} />
            <Route path="/sell" component={() => <ProtectedRoute component={Sell} />} />
            <Route path="/share" component={() => <ProtectedRoute component={SharePage} />} />
            <Route path="/scan" component={() => <ProtectedRoute component={Scan} />} />
            <Route path="/scan/bulk" component={() => <ProtectedRoute component={ScanBulk} />} />
            <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
            <Route path="/subscription" component={() => <ProtectedRoute component={SubscriptionPage} />} />
            <Route path="/admin/payouts" component={() => <ProtectedRoute component={AdminPayouts} />} />
            <Route path="/seller/:clerkId" component={SellerProfile} />
            <Route path="/feedback/:clerkId" component={FeedbackPage} />
            <Route path="/view/card/:id" component={PublicCardView} />
            <Route path="/view/category/:id" component={PublicCategoryView} />
            <Route path="/view/collection" component={PublicCollectionView} />
            <Route path="/view/listing/:id" component={PublicListingView} />
            <Route path="/view/group/:code" component={GroupShareView} />
            <Route path="/s/:code" component={ShortLinkRedirect} />
            <Route path="/w/:code" component={WantedPublicPage} />
            <Route component={NotFound} />
          </Switch>
          </UsernameGate>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
