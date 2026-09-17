import './node-shims.cjs';
import puppeteer from 'puppeteer';
import { supabase } from '../src/lib/supabase';
import { reassignParts } from '../src/services/reassignmentService';
import { zapiOrchestrator } from '../src/services/zapiOrchestrator';

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
    console.log(`[AutoReassignBot] Iniciando processo para a parte: ${partId}`);

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

    // 2. Executar Motor Cirúrgico
    console.log(`[AutoReassignBot] Rodando motor de inteligência para ${partId}...`);
    const result = await reassignParts([partId], publishers as any, workbookParts);
    
    if (!result.success || result.partsGenerated === 0) {
        console.warn(`[AutoReassignBot] Nenhuma reatribuição feita. Motivo: ${result.warnings.join(', ')}`);
        // Abortar graciosamente se a lista estiver vazia
        // A notificação para SRVM agir manualmente já deve ter sido enviada ou o sistema
        // deixa marcado como "REJEITADA" no painel.
        process.exit(0);
    }

    console.log(`[AutoReassignBot] Sucesso! Motor encontrou um substituto.`);

    // 3. Buscar parte atualizada
    const { data: updatedPartData } = await supabase.from('workbook_parts').select('*').eq('id', partId).single();
    if (!updatedPartData) throw new Error("Falha ao re-pesquisar parte atualizada");
    
    const updatedPart = mapDbToWorkbookPart(updatedPartData);
    const newPublisherName = updatedPart.resolvedPublisherName || updatedPart.rawPublisherName;
    const newPublisher = publishers.find(p => p.name === newPublisherName || p.id === updatedPart.resolvedPublisherId);
    
    if (!newPublisher) throw new Error(`Publicador ${newPublisherName} não encontrado na base local`);

    // 4. Capturar Renderização Headless via Puppeteer
    console.log(`[AutoReassignBot] Abrindo navegador Headless para capturar o PNG do S-89...`);
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
            deviceScaleFactor: 2 // Qualidade Retina
        }
    });

    try {
        const page = await browser.newPage();
        const url = `${baseUrl}/?portal=s89-print&partId=${partId}&token=${printSecret}`;
        console.log(`[AutoReassignBot] Navegando para a rota limpa: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Aguarda a renderização do React e pdf.js gerar o <img id="s89-card-canvas">
        await page.waitForSelector('#s89-card-canvas', { timeout: 20000 });
        
        // Extrai a string Base64 gerada pelo pdf.js (já fiel e perfeita)
        const imgSrc = await page.$eval('#s89-card-canvas', el => el.getAttribute('src'));
        
        if (!imgSrc || !imgSrc.includes('base64,')) {
            throw new Error("Elemento s89-card-canvas não gerou o base64 esperado.");
        }
        
        const base64Data = imgSrc.split(',')[1];
        console.log(`[AutoReassignBot] Imagem S-89 capturada com sucesso!`);

        // 5. Enviar pelo Z-API
        const phone = (newPublisher as any).phone || (newPublisher as any).contact_phone;
        if (!phone) {
            console.warn(`[AutoReassignBot] Substituto ${newPublisherName} não tem telefone cadastrado. Impossível enviar Z-API.`);
        } else {
            console.log(`[AutoReassignBot] Disparando Z-API para ${newPublisherName} (${phone})...`);
            
            // Texto de acompanhamento
            const { communicationService } = await import('../src/services/communicationService');
            
            // Precisamos simular o weekParts
            const { data: weekPartsData } = await supabase.from('workbook_parts').select('*').eq('week_id', updatedPart.weekId);
            const wParts = weekPartsData ? weekPartsData.map(mapDbToWorkbookPart) : workbookParts.filter(p => p.weekId === updatedPart.weekId);
            
            const msgInfo = await communicationService.prepareS89Message(
                updatedPart as any, 
                publishers as any, 
                wParts as any, 
                { isSubstitution: true, isZApiFlow: true }
            );

            const sendRes = await zapiOrchestrator.sendS89Direct(
                updatedPart.id,
                String(phone),
                msgInfo.content,
                base64Data,
                'PUBLICACAO_S89',
                msgInfo.availabilityUrl,
                newPublisher.id
            );

            if (sendRes.success) {
                console.log(`[AutoReassignBot] Notificação enviada com sucesso ao novo titular!`);
                
                // Alertar a liderança sobre a troca bem sucedida
                console.log(`[AutoReassignBot] (SRVM poderá ver a atualização no painel de status em tempo real)`);
            } else {
                console.error(`[AutoReassignBot] Falha no Z-API:`, sendRes.error);
            }
        }
    } finally {
        await browser.close();
    }
    
    console.log(`[AutoReassignBot] Processo finalizado.`);
}

run().catch(err => {
    console.error("[AutoReassignBot] Falha fatal:", err);
    process.exit(1);
});
