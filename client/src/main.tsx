import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { PublicLayout } from "./components/PublicLayout.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { LoginPage } from "./routes/LoginPage.tsx";
import { SignupPage } from "./routes/SignupPage.tsx";
import { DashboardPage } from "./routes/DashboardPage.tsx";
import { TournamentPage } from "./routes/TournamentPage.tsx";
import { RosterPage } from "./routes/RosterPage.tsx";
import { PodPage } from "./routes/PodPage.tsx";
import { GesamtwertungPage } from "./routes/GesamtwertungPage.tsx";
import { PodStandingsPage } from "./routes/PodStandingsPage.tsx";
import { PairingsPage } from "./routes/PairingsPage.tsx";
import { PodValuePage } from "./routes/PodValuePage.tsx";
import { TournamentValuePage } from "./routes/TournamentValuePage.tsx";
import { TreasureChestPage } from "./routes/TreasureChestPage.tsx";
import { HallOfFamePage } from "./routes/HallOfFamePage.tsx";
import { PlayerStatsPage } from "./routes/PlayerStatsPage.tsx";
import { ApiTokensPage } from "./routes/ApiTokensPage.tsx";
import { PublicTournamentPage } from "./routes/PublicTournamentPage.tsx";
import { PublicPodPage } from "./routes/PublicPodPage.tsx";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/o/:slug/tournaments/:id" element={<PublicTournamentPage />} />
            <Route path="/o/:slug/tournaments/:tournamentId/pods/:podId" element={<PublicPodPage />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/roster" element={<RosterPage />} />
              <Route path="/tournaments/:id" element={<TournamentPage />} />
              <Route path="/tournaments/:id/gesamtwertung" element={<GesamtwertungPage />} />
              <Route path="/tournaments/:id/value" element={<TournamentValuePage />} />
              <Route path="/pods/:id" element={<PodPage />} />
              <Route path="/pods/:id/standings" element={<PodStandingsPage />} />
              <Route path="/pods/:id/rounds" element={<PairingsPage />} />
              <Route path="/pods/:id/value" element={<PodValuePage />} />
              <Route path="/hall-of-fame" element={<HallOfFamePage />} />
              <Route path="/hall-of-fame/players/:playerId" element={<PlayerStatsPage />} />
              <Route path="/treasure-chest" element={<TreasureChestPage />} />
              <Route path="/api-tokens" element={<ApiTokensPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
