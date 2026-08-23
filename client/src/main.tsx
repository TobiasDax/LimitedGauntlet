import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { LoginPage } from "./routes/LoginPage.tsx";
import { SignupPage } from "./routes/SignupPage.tsx";
import { DashboardPage } from "./routes/DashboardPage.tsx";
import { TournamentPage } from "./routes/TournamentPage.tsx";
import { RosterPage } from "./routes/RosterPage.tsx";
import { PodPage } from "./routes/PodPage.tsx";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/roster" element={<RosterPage />} />
              <Route path="/tournaments/:id" element={<TournamentPage />} />
              <Route path="/pods/:id" element={<PodPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
