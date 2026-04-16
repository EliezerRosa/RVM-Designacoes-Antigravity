import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    console.warn('[Vite Config] WARNING: VITE_SUPABASE_URL is MISSING in environment variables!');
  }

  const isDev = command === 'serve';

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            charts: ['recharts'],
          }
        }
      }
    },
    // Dev usa raiz; produção usa paths relativos para o mesmo artefato funcionar
    // tanto em GitHub Pages quanto em Vercel sem rebuild específico por host.
    base: isDev ? '/' : './',
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
