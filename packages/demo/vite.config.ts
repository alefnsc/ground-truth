import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:https` runs with --mode https: a self-signed certificate on the LAN, because
// phones only grant camera access over HTTPS (or on localhost).
export default defineConfig(({ mode }) => ({
  plugins: mode === "https" ? [basicSsl()] : [],
  build: { target: "es2022" },
}));
