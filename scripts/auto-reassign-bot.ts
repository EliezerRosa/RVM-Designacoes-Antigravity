import './node-shims.cjs';
import puppeteer from 'puppeteer';
import { supabase } from '../src/lib/supabase';
import { replacementOrchestratorService } from '../src/services/replacementOrchestratorService';

const partId = process.argv[2];
if (!partId) {
    console.error("ERRO: partId não fornecido.");
    process.exit(1);
}

const printSecret = process.env.VITE_PRINT_SECRET;
const baseUrl = process.env.APP_BASE_URL || 'https://rvm-designacoes-antigravity.vercel.app';

if (!printSecret) {
    console.error("ERRO: VITE_PRINT_SECRET não configurado no ambiente.");
    process.exit(1);
}

async function run() {
    console.log(`[AutoReassignBot] Iniciando orquestração unificada para a parte: ${partId}`);

    // 1. Carregar Publishers e WorkbookParts do Banco
    const { data: pubsData, error: pubErr } = await supabase.from('publishers').select('*');
    if (pubErr || !pubsData) throw new Error("Erro ao carregar publicadores");
    
    // Convert publishers json to interface
    const publishers = pubsData.map(p => ({
        id: p.id,
        ...p.data
    }));

    const { data: partsData, error: partsErr } = await supabase.from('workbook_parts').select('*');
    if (partsErr || !partsData) throw new Error("Erro ao carregar partes");

    // Convert db snake_case to camelCase mapping for the engine
    const { mapDbToWorkbookPart } = await import('../src/services/workbookService');
    const workbookParts = partsData.map(mapDbToWorkbookPart);

    // 2. Prover a função que injeta a foto S-89 via Puppeteer
    const s89PuppeteerProvider = async (part: any) => {
        console.log(`[AutoReassignBot] (s89Provider) Abrindo navegador Headless para capturar o PNG do S-89...`);
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--window-size=1000,1000'
            ],
            defaultViewport: {
                width: 900,
                height: 900,
                deviceScaleFactor: 2
            }
        });

        try {
            const page = await browser.newPage();
            const url = `${baseUrl}/?portal=s89-print&partId=${part.id}&token=${printSecret}`;
            console.log(`[AutoReassignBot] (s89Provider) Navegando para: ${url}`);
            
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await page.waitForSelector('#s89-card-canvas', { timeout: 20000 });
            
            const imgSrc = await page.$eval('#s89-card-canvas', el => el.getAttribute('src'));
            if (!imgSrc || !imgSrc.includes('base64,')) {
                throw new Error("Elemento s89-card-canvas não gerou o base64 esperado.");
            }
            
            console.log(`[AutoReassignBot] (s89Provider) Imagem S-89 capturada com sucesso!`);
            return imgSrc.split(',')[1];
        } finally {
            await browser.close();
        }
    };

    // 3. Executar Orquestrador Universal
    console.log(`[AutoReassignBot] Delegando execução ao ReplacementOrchestratorService...`);
    const result = await replacementOrchestratorService.executeAutoReassignment(
        partId,
        publishers as any,
        workbookParts,
        s89PuppeteerProvider
    );
    
    if (!result.success) {
        console.warn(`[AutoReassignBot] O Orquestrador reportou falha (e já acionou o fallback humano). Motivo: ${result.reason}`);
        process.exit(0);
    }

    console.log(`[AutoReassignBot] Processo finalizado com sucesso. Substituição orquestrada perfeitamente.`);
}

run().catch(err => {
    console.error("[AutoReassignBot] Falha fatal:", err);
    process.exit(1);
});
