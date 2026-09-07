import puppeteer from 'puppeteer';

(async () => {
  const token = process.env.BOT_TOKEN || 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';
  const rawBase = (process.env.WORKER_URL || 'https://rvm-designacoes-antigravity.vercel.app').split('?')[0];
  const cleanBase = rawBase.replace(/\/automation-worker\/?$/, '').replace(/\/$/, '');
  const url = `${cleanBase}/?portal=automation-worker&token=${token}`;

  console.log(`[Bot] Target URL: ${cleanBase}/?portal=automation-worker&token=${token.substring(0, 10)}...`);
  const browser = await puppeteer.launch({
    headless: 'new',
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
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    
    // Wait for the status element to turn to FINISHED
    console.log('[Bot] Waiting for worker to finish (max 5 minutes)...');
    
    await page.waitForFunction(
      'document.getElementById("worker-status") && document.getElementById("worker-status").innerText === "FINISHED"',
      { timeout: 300000 } // 5 minutes max
    );

    console.log('[Bot] Worker finished successfully.');

  } catch (err) {
    console.error('[Bot] Error during execution:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
