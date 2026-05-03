import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
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
import Marketplace from "@/pages/marketplace/index";
import ListingDetail from "@/pages/marketplace/[id]";
import Sell from "@/pages/sell";
import SharePage from "@/pages/share";
import Scan from "@/pages/scan";
import Profile from "@/pages/profile";
import SellerProfile from "@/pages/seller/[clerkId]";

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
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
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
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/collection" component={Collection} />
            <Route path="/collection/new" component={NewCard} />
            <Route path="/collection/:id/edit" component={EditCard} />
            <Route path="/collection/:id" component={CardDetail} />
            <Route path="/categories" component={Categories} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/marketplace/:id" component={ListingDetail} />
            <Route path="/sell" component={Sell} />
            <Route path="/share" component={SharePage} />
            <Route path="/scan" component={Scan} />
            <Route path="/profile" component={Profile} />
            <Route path="/seller/:clerkId" component={SellerProfile} />
            <Route component={NotFound} />
          </Switch>
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
