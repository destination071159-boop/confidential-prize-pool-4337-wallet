import { Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { Sidebar } from "./components/layout/Sidebar";
import { Footer } from "./components/layout/Footer";
import { NetworkGuard } from "./components/shared/NetworkGuard";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { Dashboard } from "./pages/Dashboard";
import { Overview } from "./pages/Overview";
import { ShieldUnshield } from "./pages/ShieldUnshield";
import { Limits } from "./pages/Limits";
import { Send } from "./pages/Send";
import { Activity } from "./pages/Activity";
import { PrizePool } from "./pages/PrizePool";
import { SpendAsKey } from "./pages/SpendAsKey";

export default function App() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <Navbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <NetworkGuard>
            <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Navigate to="/pool" replace />} />
                  <Route path="/pool" element={<PrizePool />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/shield" element={<ShieldUnshield />} />
                  <Route path="/limits" element={<Limits />} />
                  <Route path="/send" element={<Send />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/spend" element={<SpendAsKey />} />
                  <Route path="*" element={<Navigate to="/pool" replace />} />
                </Routes>
              </ErrorBoundary>
            </main>
          </NetworkGuard>
          <Footer />
        </div>
      </div>
    </div>
  );
}
