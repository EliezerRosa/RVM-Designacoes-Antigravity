import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 2 });
    
    console.log("Navigating to portal...");
    await page.goto('http://localhost:5173/?portal=s89-print&partId=abac264c-004b-4f00-a1e2-fee7aa63d451&token=123', { waitUntil: 'domcontentloaded' });
    
    console.log("Waiting for canvas...");
    await page.waitForSelector('#s89-card-canvas', { timeout: 20000 });
    
    const imgSrc = await page.$eval('#s89-card-canvas', el => el.getAttribute('src'));
    const base64Data = imgSrc.split(',')[1] || imgSrc;
    const outPath = 'C:\\\\Users\\\\Eliez\\\\.gemini\\\\antigravity-ide\\\\brain\\\\b0d3ad02-39fe-4fe8-99c4-8e6c46ce35e7\\\\s89_raquel.png';
    const fallbackPath = 'C:\\\\Users\\\\Eliez\\\\.gemini\\\\antigravity-ide\\\\brain\\\\b0d3ad02-39fe-4fe8-99c4-8e6c46ce35e7\\\\s89_raquel_screenshot.png';
    
    fs.writeFileSync(outPath, base64Data, 'base64');
    await page.screenshot({ path: fallbackPath, fullPage: true });
    
    console.log(`Saved to ${outPath} and ${fallbackPath}`);
    
    await browser.close();
})();
