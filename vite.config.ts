import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Na Vercel usamos raiz, no GitHub Pages usamos o subdiretório do repo
  base: process.env.VERCEL ? '/' : '/RVM-Designacoes-Antigravity/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
