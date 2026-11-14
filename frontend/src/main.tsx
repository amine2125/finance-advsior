import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBox, Spinner } from "./components/ui";
import { AppProvider, useApp } from "./hooks/useApp";
import "./index.css";
import Assistant from "./pages/Assistant";
import Home from "./pages/Home";
import Invest from "./pages/Invest";
import Onboarding from "./pages/Onboarding";
import PortfolioPage from "./pages/Portfolio";
import Profile from "./pages/Profile";
import Welcome from "./pages/Welcome";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <ErrorBox error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function Shell() {
  const { me, error, reload } = useApp();
  if (error && !me) return <div className="mx-auto max-w-lg p-8"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!me) return <div className="grid min-h-screen place-items-center"><Spinner label="Chargement…" /></div>;
  if (!me.onboarded) {
    // Not registered yet: only the welcome screen and the onboarding are reachable.
    return (
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/inscription" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/inscription" element={<Onboarding />} />
      <Route path="*" element={
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/portefeuille" element={<PortfolioPage />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/investir" element={<Invest />} />
              <Route path="/investir/:assetId" element={<Invest />} />
              <Route path="/profil" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      } />
    </Routes>
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
