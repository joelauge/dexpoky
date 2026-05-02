import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Collection from "@/pages/collection/index";
import NewCard from "@/pages/collection/new";
import CardDetail from "@/pages/collection/[id]";
import Categories from "@/pages/categories/index";
import Marketplace from "@/pages/marketplace/index";
import ListingDetail from "@/pages/marketplace/[id]";
import Sell from "@/pages/sell";
import Scan from "@/pages/scan";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/collection" component={Collection} />
      <Route path="/collection/new" component={NewCard} />
      <Route path="/collection/:id" component={CardDetail} />
      <Route path="/categories" component={Categories} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/:id" component={ListingDetail} />
      <Route path="/sell" component={Sell} />
      <Route path="/scan" component={Scan} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;