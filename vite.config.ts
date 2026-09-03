import path from "node:path";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
// import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Define default values for env variables
  const defaultValues = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: null,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: null,
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: null,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: null,
    COMFY_DEPLOY_SHARED_MACHINE_API_URL: null,
    NEXT_PUBLIC_CD_API_URL: "http://localhost:3011",
    NEXT_PUBLIC_APP_URL: "http://localhost:3001",
    NEXT_PUBLIC_STUDIO_URL: null,
    NEXT_PUBLIC_ADMIN_URL: null,
    NEXT_PUBLIC_NGROK_CD_API_URL: null,
    VITE_PUBLIC_POSTHOG_KEY: null,
    VITE_PUBLIC_POSTHOG_HOST: "https://app.posthog.com",
    COMFYUI_FRONTEND_URL: "https://comfyui.comfydeploy.com",
  };

  // Create process.env definitions with defaults
  const processEnvDefinitions = Object.fromEntries(
    Object.entries(defaultValues).map(([key, defaultValue]) => [
      `process.env.${key}`,
      JSON.stringify(env[key] || defaultValue),
    ]),
  );

  return {
    plugins: [TanStackRouterVite(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@repo": path.resolve(__dirname, "./src/repo"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: env.NEXT_PUBLIC_CD_API_URL || "http://localhost:3011",
          changeOrigin: true,
        },
      },
    },
    define: processEnvDefinitions,
  };
});
