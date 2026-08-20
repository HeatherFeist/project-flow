import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RequireSubscription } from "@/components/layout/RequireSubscription";
import { RequireOnboarding } from "@/components/layout/RequireOnboarding";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Subscribe from "@/pages/Subscribe";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Schedule from "@/pages/Schedule";
import JobDetail from "@/pages/JobDetail";
import Quotes from "@/pages/Quotes";
import Invoices from "@/pages/Invoices";
import InvoiceDetail from "@/pages/InvoiceDetail";
import SettingsPage from "@/pages/Settings";
import PublicQuote from "@/pages/PublicQuote";
import PriceBook from "@/pages/PriceBook";
import EstimateChat from "@/pages/EstimateChat";
import EmbedGuide from "@/pages/EmbedGuide";
import PayInvoice from "@/pages/PayInvoice";
import JobGallery from "@/pages/JobGallery";

const queryClient = new QueryClient();

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/q/:token" element={<PublicQuote />} />
              <Route path="/q/:token/:action" element={<PublicQuote />} />
              <Route path="/estimate/:ownerId" element={<EstimateChat />} />
              <Route path="/embed-guide/:ownerId" element={<EmbedGuide />} />
              <Route path="/pay/:token" element={<PayInvoice />} />
              <Route path="/job-gallery/:token" element={<JobGallery />} />
              <Route
                path="/subscribe"
                element={
                  <ProtectedRoute>
                    <Subscribe />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <RequireSubscription>
                      <Onboarding />
                    </RequireSubscription>
                  </ProtectedRoute>
                }
              />
              <Route
                element={
                  <ProtectedRoute>
                    <RequireSubscription>
                      <RequireOnboarding>
                        <AppLayout />
                      </RequireOnboarding>
                    </RequireSubscription>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientDetail />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/schedule/:id" element={<JobDetail />} />
                <Route path="/quotes" element={<Quotes />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/:id" element={<InvoiceDetail />} />
                <Route path="/price-book" element={<PriceBook />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
