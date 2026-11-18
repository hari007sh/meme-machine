import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import Home from "./pages/Home";
import LogPage from "./pages/Log";
import Share from "./pages/Share";
import StatsPage from "./pages/Stats";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/m/:id" element={<Share />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/log" element={<LogPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
