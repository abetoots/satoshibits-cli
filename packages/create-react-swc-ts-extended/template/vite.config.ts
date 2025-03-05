import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
// import eslintPlugin from "@nabla/vite-plugin-eslint";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globals: true,
    include: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
    environment: "happy-dom",
    setupFiles: "./src/setupTests.ts",
  },
  plugins: [
    // resolves paths from tsconfig.json
    tsconfigPaths(),
    // recommended way to use tailwindcss with Vite since v4
    tailwindcss(),
    react(),
    // Enables linting during hot reload
    // eslintPlugin(),
  ],
});
