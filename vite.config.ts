import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import conversaNluHandler from './api/conversa-nlu'

function conversaLocalDevAuthPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'conversa-local-dev-auth',
    apply: 'serve',
    configureServer(server) {
      if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
      }

      server.middlewares.use('/api/conversa-nlu', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const rawBody = Buffer.concat(chunks).toString('utf8');
          const webReq = new Request('http://localhost/api/conversa-nlu', {
            method: req.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: req.method === 'POST' ? rawBody : undefined,
          });
          const webRes = await conversaNluHandler(webReq);
          res.statusCode = webRes.status;
          webRes.headers.forEach((val, key) => res.setHeader(key, val));
          res.end(await webRes.text());
        } catch (err) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              intentId: 'fallback.unknown',
              slots: {},
              confidence: 0,
              reason: err instanceof Error ? err.message : 'Local NLU fallback',
            })
          );
        }
      });

      server.middlewares.use('/__conversa_dev_auth', async (req, res) => {
        const remote = req.socket.remoteAddress || '';
        const isLoopback =
          remote === '127.0.0.1' ||
          remote === '::1' ||
          remote === '::ffff:127.0.0.1';
        if (!isLoopback || req.method !== 'POST') {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }

        const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const serviceKey =
          env.SUPABASE_SERVICE_ROLE_KEY ||
          env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing local SUPABASE_SERVICE_ROLE_KEY' }));
          return;
        }

        try {
          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: profiles } = await admin
            .from('profiles')
            .select('email, role')
            .eq('role', 'admin')
            .limit(1);

          const targetEmail = profiles?.[0]?.email;
          if (!targetEmail) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No admin profile found' }));
            return;
          }

          const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: targetEmail,
          });

          const hashedToken = linkData?.properties?.hashed_token;
          if (linkErr || !hashedToken) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: linkErr?.message || 'Failed to generate dev token' }));
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ email: targetEmail, hashed_token: hashedToken }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Internal dev auth error',
            })
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    console.warn('[Vite Config] WARNING: VITE_SUPABASE_URL is MISSING in environment variables!');
  }

  const isDev = command === 'serve';

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co'
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        (
          env.VITE_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_ANON_KEY ||
          'sb_publishable_SObnBXFPKyoPO7-b4ldeqg_i2gpKOrv'
        ).trim()
      ),
    },
    plugins: [react(), conversaLocalDevAuthPlugin(env)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          conversa: resolve(__dirname, 'conversa.html'),
        },
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
          bypass(req) {
            if (req.url?.startsWith('/api/conversa-nlu')) {
              return req.url;
            }
          },
        },
      },
    },
  };
})
