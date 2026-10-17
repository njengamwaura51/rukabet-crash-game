import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AviatorGame from "@/pages/AviatorGame";
import AdminDashboard from "@/pages/AdminDashboard";
import { ProfilePage, ReferralsPage, BonusesPage, SupportPage } from "@/pages/PlaceholderPages";
import { useConfigState, ConfigContext } from "@/hooks/useConfig";

const queryClient = new QueryClient();

function RefRedirect({ code }: { code: string }) {
  useEffect(() => {
    if (code && typeof window !== 'undefined') {
      localStorage.setItem('rukabet_referral', decodeURIComponent(code).trim());
    }
  }, [code]);
  return <AviatorGame />;
}

import ErrorButton from "@/components/ErrorButton";

function SentryTestPage() {
  return (
    <div className="min-h-screen bg-[#070b12] text-white flex flex-col items-center justify-center p-6 space-y-4">
      <div className="max-w-md w-full bg-[#0d1424] border border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-2xl">
        <h1 className="text-xl font-bold text-white">Sentry Diagnostic Test</h1>
        <p className="text-slate-400 text-xs leading-relaxed">
          Click the button below to emit a structured log (<code>Sentry.logger.info</code>), record a metric counter (<code>Sentry.metrics.count</code>), and trigger a test error to verify your Sentry dashboard ingestion.
        </p>
        <div className="pt-2 flex justify-center">
          <ErrorButton />
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AviatorGame} />
      <Route path="/ref/:code">{(params) => <RefRedirect code={params.code} />}</Route>
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/test-sentry" component={SentryTestPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/bonuses" component={BonusesPage} />
      <Route path="/support" component={SupportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { config, updateConfig } = useConfigState();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        localStorage.setItem('rukabet_referral', ref.trim());
      }
    } catch {}
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigContext.Provider value={{ config, updateConfig }}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ConfigContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
