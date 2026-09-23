import { useEffect } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { ArrowRight, Search, Layers, ShieldCheck, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { isSignedIn } = useUser();
  
  useEffect(() => {
    const prevTitle = document.title;
    const prevMeta = document.querySelector('meta[name="description"]')?.getAttribute("content");
    
    document.title = "DexPoky | The Pokémon TCG marketplace built for collectors";
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Buy, sell, and trade Pokémon cards peer-to-peer — raw or graded. Set your criteria and let DexAgents do the hunting while you sleep.');
    
    return () => {
      document.title = prevTitle;
      if (prevMeta && metaDesc) {
        metaDesc.setAttribute('content', prevMeta);
      } else if (metaDesc) {
        metaDesc.remove();
      }
    };
  }, []);

  const primaryHref = isSignedIn ? "/collection" : "/sign-up?redirect_url=%2Fcollection";
  const signInHref = "/sign-in";

  return (
    <div className="min-h-[100dvh] bg-[#0c1838] text-white font-sans overflow-x-hidden flex flex-col selection:bg-[#fbd34d] selection:text-[#0c1838]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 md:px-8 bg-[#0c1838] border-b border-white/5">
        <Link href="/" data-testid="link-home-logo">
          <div className="flex items-center cursor-pointer">
            <img 
              src="/dexpoky-logo.png" 
              alt="DexPoky" 
              className="h-9 md:h-10 w-auto object-contain" 
            />
          </div>
        </Link>
        
        <div className="flex items-center gap-4 md:gap-6">
          {!isSignedIn && (
            <Link href={signInHref} data-testid="link-nav-signin">
              <span className="text-sm font-semibold text-white/80 hover:text-white transition-colors cursor-pointer hidden md:block">
                Log in
              </span>
            </Link>
          )}
          <Link href={primaryHref} data-testid="link-nav-primary">
            <Button className="bg-[#e13838] hover:bg-[#c93232] text-white font-bold rounded-md h-9 md:h-10 px-4 md:px-5 transition-all shadow-sm">
              Get started
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col">
        <section className="px-5 py-12 md:py-24 max-w-5xl mx-auto w-full flex flex-col items-start text-left relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fbd34d]/30 bg-[#fbd34d]/10 px-3 py-1.5 mb-8 md:mb-10">
            <span className="w-2 h-2 rounded-full bg-[#fbd34d]"></span>
            <span className="text-xs md:text-sm font-medium tracking-wide text-[#fbd34d]">
              Trade · Collect · Battle
            </span>
          </div>

          <h1 className="text-[2.75rem] sm:text-6xl md:text-7xl lg:text-[5rem] font-extrabold tracking-tight leading-[1.05] mb-6 md:mb-8 text-white">
            The Pokémon <br className="hidden sm:block" />
            TCG <br className="sm:hidden" />
            <span className="text-[#fbd34d]">marketplace</span> <br />
            built for <br className="sm:hidden" />
            collectors.
          </h1>

          <p className="text-lg md:text-xl lg:text-2xl text-white/80 max-w-2xl mb-10 leading-relaxed font-normal">
            Buy, sell, and trade Pokémon cards peer-to-peer — raw or graded. Set your criteria and let DexAgents do the hunting while you sleep.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href={primaryHref} className="w-full sm:w-auto" data-testid="link-hero-primary">
              <Button className="w-full sm:w-auto bg-[#e13838] hover:bg-[#c93232] text-white text-base md:text-lg font-bold rounded-md h-14 px-8 transition-all">
                Start collecting
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/marketplace" className="w-full sm:w-auto" data-testid="link-hero-marketplace">
              <Button variant="outline" className="w-full sm:w-auto border-white/20 bg-transparent hover:bg-white/5 text-white text-base md:text-lg font-medium rounded-md h-14 px-8 transition-colors">
                See how it works
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="w-full bg-[#0a1229] py-20 px-5 md:px-8 border-y border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
              <FeatureCard 
                icon={<Search className="w-7 h-7 text-[#fbd34d]" />}
                title="DexAgents"
                description="Tell your AI agent what cards you want, your budget, and preferred condition. It hunts 24/7 so you never miss a deal."
              />
              <FeatureCard 
                icon={<Layers className="w-7 h-7 text-[#fbd34d]" />}
                title="Digital Portfolio"
                description="Track your entire collection in one place. Scan cards instantly, organize by set, and watch your portfolio's value grow."
              />
              <FeatureCard 
                icon={<ShieldCheck className="w-7 h-7 text-[#fbd34d]" />}
                title="Secure Trading"
                description="Buy and sell with absolute confidence. Verified peer-to-peer marketplace built exclusively for the TCG community."
              />
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-24 px-5 text-center max-w-3xl mx-auto w-full">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight">Start building your <br className="md:hidden" />dream collection.</h2>
          <p className="text-white/70 text-lg mb-10 font-normal">Join thousands of collectors building their decks and tracking their portfolios.</p>
          <Link href={primaryHref} data-testid="link-bottom-cta">
            <Button className="bg-[#fbd34d] hover:bg-[#e5c147] text-[#0c1838] text-lg font-bold rounded-md h-14 px-10 transition-all">
              Create free account
              <Zap className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          {!isSignedIn && (
            <p className="mt-6 text-white/50 text-sm">
              Already have an account? <Link href={signInHref} className="text-white hover:text-[#fbd34d] underline underline-offset-4 transition-colors">Sign in</Link>
            </p>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 bg-[#081024] py-12 px-5 md:px-8 text-white/50 text-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
             <img src="/dexpoky-logo.png" alt="DexPoky Logo" className="h-6 w-auto object-contain grayscale opacity-50" />
             <span className="opacity-70">© {new Date().getFullYear()} DexPoky</span>
          </div>
          <div className="flex items-center gap-6 opacity-80">
            <Link href="/terms-of-service" className="hover:text-white transition-colors" data-testid="link-footer-terms">Terms</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors" data-testid="link-footer-privacy">Privacy</Link>
            <Link href="/support" className="hover:text-white transition-colors" data-testid="link-footer-support">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col gap-4 p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
      <div className="w-14 h-14 rounded-xl bg-[#0c1838] border border-white/10 flex items-center justify-center mb-2 shadow-inner">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
      <p className="text-white/70 leading-relaxed font-normal text-[15px]">{description}</p>
    </div>
  );
}
