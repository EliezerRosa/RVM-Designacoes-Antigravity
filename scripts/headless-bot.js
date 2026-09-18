import puppeteer from 'puppeteer';

(async () => {
  let targetUrl = process.env.WORKER_URL;
  const envToken = process.env.BOT_TOKEN;

  if (!targetUrl && !envToken) {
    console.error('[Bot] ERRO: WORKER_URL ou BOT_TOKEN deve ser fornecido via variáveis de ambiente.');
    process.exit(1);
  }

  let url;
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (envToken && !parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', envToken);
      }
      url = parsed.toString();
    } catch {
      url = targetUrl;
    }
  } else {
    const baseUrl = process.env.APP_BASE_URL || 'https://rvm-designacoes-antigravity.vercel.app';
    const cleanBase = baseUrl.replace(/\/$/, '');
    url = `${cleanBase}/?portal=automation-worker&token=${envToken}`;
  }

  const maskedUrl = url.replace(/(token=)([^&]+)/, (_, p1, p2) => `${p1}${p2.substring(0, 8)}...`);
  console.log(`[Bot] Target URL: ${maskedUrl}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  const page = await browser.newPage();

  // Pipe page console to node console
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[Browser] ${text}`);
  });

  page.on('pageerror', err => {
    console.error('[Browser PageError]', err);
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    // Wait for the status element to turn to FINISHED
    console.log('[Bot] Waiting for worker to finish (max 10 minutes)...');
    
    await page.waitForFunction(
      'document.getElementById("worker-status") && document.getElementById("worker-status").innerText === "FINISHED"',
      { timeout: 600000 } // 10 minutes max
    );

    console.log('[Bot] Worker finished successfully.');

  } catch (err) {
    console.error('[Bot] Error during execution:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
