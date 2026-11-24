import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const API = `http://127.0.0.1:${process.env.PORT ?? 8787}`;

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { "@shared": path.resolve(here, "../src/shared") } },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(here, "..")] },
    proxy: { "/api": API, "/data": API, "/assets": API },
  },
  // assetsDir "ui" evita colidir com a rota /assets/* (biblioteca do usuário) do servidor
  build: { outDir: path.resolve(here, "dist"), emptyOutDir: true, sourcemap: false, assetsDir: "ui" },
});
