import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const isVercel = process.env.VERCEL === '1';

  return {
    plugins: [react()],
    // Local (dev) ou Vercel = raiz ('/')
    // GitHub Pages (build não-Vercel) = subdiretório
    base: (isDev || isVercel) ? '/' : '/RVM-Designacoes-Antigravity/',
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
})
