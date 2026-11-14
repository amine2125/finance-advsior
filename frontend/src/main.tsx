import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AppProvider, useApp } from "./hooks/AppContext";
import "./index.css";
import Copilot from "./pages/Copilot";
import Dashboard from "./pages/Dashboard";
import Debate from "./pages/Debate";
import Guardian from "./pages/Guardian";
import Hype from "./pages/Hype";
import PortfolioPage from "./pages/Portfolio";
import Reports from "./pages/Reports";
import Scenarios from "./pages/Scenarios";
import Settings from "./pages/Settings";
import Sources from "./pages/Sources";
import XRay from "./pages/XRay";
import { Loading } from "./components/ui";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">Erreur d'affichage : {this.state.error.message} <button className="ml-2 underline" onClick={() => this.setState({ error: null })}>Réessayer</button></div>;
    return this.props.children;
  }
}

function Shell() {
  const { ready } = useApp();
  if (!ready) return <div className="grid min-h-screen place-items-center"><Loading label="Connexion à AEGIS…" /></div>;
  return (
    <Layout>
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/xray" element={<XRay />} />
        <Route path="/copilot" element={<Copilot />} />
        <Route path="/debate" element={<Debate />} />
        <Route path="/scenarios" element={<Scenarios />} />
        <Route path="/hype" element={<Hype />} />
        <Route path="/guardian" element={<Guardian />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
