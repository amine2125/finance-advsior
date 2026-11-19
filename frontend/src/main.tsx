import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBox, Spinner } from "./components/ui";
import { AppProvider, useApp } from "./hooks/useApp";
import "./index.css";
import { MotionRoot } from "./components/motion";
import About from "./pages/About";
import AssetPage from "./pages/Asset";
import { Decisions, MandateResult, MandateRun } from "./pages/Mandate";
import Home from "./pages/Home";
import Holdings from "./pages/Holdings";
import Connect from "./pages/Connect";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import Learn, { LessonPage } from "./pages/Learn";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <ErrorBox error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function Shell() {
  const { me, error, reload, auth } = useApp();
  if (auth === "loading") return <div className="grid min-h-screen place-items-center"><Spinner label="Chargement…" /></div>;
  if (auth === "signedOut" && !error) return <Login />;
  if (error && !me) return <div className="mx-auto max-w-lg p-8"><ErrorBox error={error} onRetry={() => (auth === "signedOut" ? window.location.reload() : reload())} /></div>;
  if (!me) return <div className="grid min-h-screen place-items-center"><Spinner label="Chargement…" /></div>;
  if (!me.onboarded) {
    // No profile yet: only the welcome screen and the questionnaire are reachable.
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
              <Route path="/placements" element={<Holdings />} />
              <Route path="/connecter" element={<Connect />} />
              <Route path="/decisions" element={<Decisions />} />
              <Route path="/mandats/en-cours/:jobId" element={<MandateRun />} />
              <Route path="/mandats/:id" element={<MandateResult />} />
              <Route path="/portefeuille" element={<Navigate to="/placements" replace />} />
              <Route path="/placement/:id" element={<AssetPage />} />
              <Route path="/a-propos" element={<About />} />
              <Route path="/profil" element={<Profile />} />
              <Route path="/apprendre" element={<Learn />} />
              <Route path="/apprendre/:id" element={<LessonPage />} />
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
    <MotionRoot>
      <BrowserRouter>
        <AppProvider>
          <Shell />
        </AppProvider>
      </BrowserRouter>
    </MotionRoot>
  </React.StrictMode>,
);
