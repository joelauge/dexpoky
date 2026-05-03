import { useEffect, useState } from "react";
import { useRoute } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ShortLinkRedirect() {
  const [, params] = useRoute("/s/:code");
  const code = params?.code ?? "";
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/s/${code}`)
      .then((r) => r.json())
      .then((data: { url?: string; error?: string }) => {
        if (data.url) {
          window.location.replace(data.url);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-14 w-14 rounded-2xl opacity-80 mb-2" />
        <h1 className="text-white text-xl font-bold">Link not found</h1>
        <p className="text-white/50 text-sm">This share link may have expired or been removed.</p>
        <a href={`${basePath}/`} className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
          Go to DexPoky →
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-center gap-4">
      <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-14 w-14 rounded-2xl opacity-80 animate-pulse" />
      <p className="text-white/50 text-sm">Redirecting…</p>
    </div>
  );
}
