import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default defineConfig({
    root: "src",
    publicDir: "../public",
    clearScreen: false,
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
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
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, "src/index.html"),
                bookmarks: resolve(import.meta.dirname, "src/pages/bookmarks.html"),
                downloads: resolve(import.meta.dirname, "src/pages/downloads.html"),
                history: resolve(import.meta.dirname, "src/pages/history.html"),
                settings: resolve(import.meta.dirname, "src/pages/settings.html"),
            },
        },
    },
});
