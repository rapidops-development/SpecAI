import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, run `specai serve <dir>` on port 4321 and `npm run dev` here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:4321' } },
  build: { outDir: 'dist', emptyOutDir: true },
})
