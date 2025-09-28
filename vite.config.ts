// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite root is /web. We’ll set base via env for GitHub Pages.
export default defineConfig({
  root: "web",
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8080", ws: true } }
  },
  build: {
    outDir: "../docs",     // publish /docs from main branch on GitHub Pages
    emptyOutDir: true
  }
});
