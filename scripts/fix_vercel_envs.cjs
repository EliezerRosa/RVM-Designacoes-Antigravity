const { spawn } = require('child_process');

async function addEnv(key, value) {
  return new Promise((resolve, reject) => {
    console.log(`Adding ${key}...`);
    // Remove if exists
    const rm = spawn('npx', ['vercel', 'env', 'rm', key, 'production', '-y'], { shell: true });
    rm.on('close', () => {
      const add = spawn('npx', ['vercel', 'env', 'add', key, 'production'], { shell: true });
      add.stdout.pipe(process.stdout);
      add.stderr.pipe(process.stderr);
      
      // Write the exact value to stdin without any extra newlines or spaces
      add.stdin.write(value);
      add.stdin.end();

      add.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Added ${key}`);
          resolve();
        } else {
          console.error(`❌ Failed to add ${key}`);
          reject(new Error(`Exit code ${code}`));
        }
      });
    });
  });
}

async function run() {
  try {
    // Valores lidos de process.env para NÃO hardcodar segredos neste arquivo.
    // SEGURANÇA: nunca empurrar VITE_ZAPI_* para o Vercel — VITE_* é embutido no
    // bundle público. As credenciais Z-API vivem só como secrets da Edge Function.
    await addEnv('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL || '');
    await addEnv('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY || '');
    if (process.env.GEMINI_API_KEY) {
      await addEnv('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
    }
    await addEnv('VITE_WHATSAPP_PROVIDER', 'edge-function');
    console.log('🎉 All variables added successfully!');
  } catch (err) {
    console.error(err);
  }
}

run();
