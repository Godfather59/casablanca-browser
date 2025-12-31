import { defineConfig } from "vite";

export default defineConfig({
    root: "src",
    publicDir: "../public",
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
        minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
