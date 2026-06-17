const { chromium } = require('playwright');
(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    console.log('Navigating...');
    await page.goto('http://localhost:5173/?portal=confirm&partId=f9a79a07-46b2-42e3-9a45-27b1e747d294');
    console.log('Waiting...');
    await page.waitForTimeout(3000);
    const screenshotPath = 'C:\\Users\\Eliez\\.gemini\\antigravity-ide\\brain\\ebf96d39-e6cf-435b-9eb4-fb5a41122026\\real_portal.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to', screenshotPath);
    await browser.close();
})();
