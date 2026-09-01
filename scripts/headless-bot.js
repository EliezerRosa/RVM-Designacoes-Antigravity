const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.WORKER_URL;
  if (!url) {
    console.error('WORKER_URL is missing!');
    process.exit(1);
  }

  console.log(`[Bot] Starting headless browser for ${url.split('?')[0]}...`);
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  const page = await browser.newPage();

  // Pipe page console to node console
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[AutomationWorker]')) {
        console.log(text);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
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
