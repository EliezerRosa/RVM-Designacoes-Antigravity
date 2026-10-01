const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    console.log('Navigating...');
    await page.goto('https://wol.jw.org/pt/wol/s/r5/lp-t?q=Instru%C3%A7%C3%B5es+para+a+reuni%C3%A3o+Nossa+Vida+e+Minist%C3%A9rio+Crist%C3%A3o+S-38&p=par', { waitUntil: 'networkidle2' });
    
    console.log('Waiting 10s...');
    await new Promise(r => setTimeout(r, 10000));
    
    console.log('Extracting DOM...');
    const html = await page.evaluate(() => document.body.innerHTML);
    fs.writeFileSync('C:/Users/Eliez/.gemini/antigravity-ide/brain/ff3adf13-f208-45f3-904c-b9faf61ae151/scratch/dom.html', html);
    
    const links = await page.$$eval('a', as => as.map(a => a.href).filter(href => href.includes('wol/d/r5/lp-t/20')));
    console.log('S-38 Links:', links);
    
    await browser.close();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
