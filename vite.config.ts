import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  console.log('[Vite Config] Loading env for mode:', mode);
  console.log('[Vite Config] VITE_SUPABASE_URL present?', !!env.VITE_SUPABASE_URL);
  if (env.VITE_SUPABASE_URL) {
    console.log('[Vite Config] VITE_SUPABASE_URL starts with:', env.VITE_SUPABASE_URL.substring(0, 10) + '...');
  } else {
    console.warn('[Vite Config] WARNING: VITE_SUPABASE_URL is MISSING in environment variables!');
  }

  const isDev = command === 'serve';
  const isVercel = process.env.VERCEL === '1';

  return {
    // Forçar a definição das variáveis de ambiente para garantir que não se percam
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
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
