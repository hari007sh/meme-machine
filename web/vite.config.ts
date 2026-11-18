import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = "http://localhost:8091";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": api, "/i": api, "/m": api } },
});
