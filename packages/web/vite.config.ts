import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getChangelog(): string {
  try {
    return readFileSync(path.resolve(__dirname, "CHANGELOG.md"), "utf-8");
  } catch {
    return "# Changelog\n\nNo changelog available.";
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ATC_VERSION__: JSON.stringify(getVersion()),
    __ATC_CHANGELOG__: JSON.stringify(getChangelog()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7700",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:7700",
        ws: true,
      },
    },
  },
});
