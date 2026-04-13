import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AviatorGame from "@/pages/AviatorGame";
import AdminDashboard from "@/pages/AdminDashboard";
import { ProfilePage, ReferralsPage, BonusesPage, SupportPage, BotHelpPage } from "@/pages/PlaceholderPages";
import { useConfigState, ConfigContext } from "@/hooks/useConfig";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={AviatorGame} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/bonuses" component={BonusesPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/bot-help" component={BotHelpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { config, updateConfig } = useConfigState();

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
