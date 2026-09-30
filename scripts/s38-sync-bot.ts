import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { zapiOrchestrator } from '../src/services/zapiOrchestrator';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const TARGET_MODEL = process.env.SELECTED_MODEL || 'anthropic/claude-3.5-sonnet';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5527992035302'; // Defaulting to Eliezer Rosa's phone

async function runS38Sync() {
    console.log('[S38-Sync] Iniciando robô de sincronização S-38...');

    try {
        // 1. Scraping WOL
        console.log('[S38-Sync] Lançando Puppeteer para acessar JW.org / WOL...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        
        // Camuflagem contra bloqueios (Anti-Bot)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        });
        
        // Acessa a busca do WOL buscando pelo documento S-38
        await page.goto('https://wol.jw.org/pt/wol/s/r5/lp-t?q=Instru%C3%A7%C3%B5es+para+a+reuni%C3%A3o+Nossa+Vida+e+Minist%C3%A9rio+Crist%C3%A3o+S-38&p=par', { waitUntil: 'networkidle2' });
        
        // Clica no primeiro link dos resultados usando seletores resilientes e fallback
        const firstResultSelector = '.search-results .resultItem a, .results .resultItem a, .search-results a, .results a, a[href*="/pt/wol/d/r5/lp-t/202"]';
        await page.waitForSelector(firstResultSelector, { timeout: 45000 });
        
        const documentUrl = await page.$eval(firstResultSelector, el => (el as HTMLAnchorElement).href);
        console.log(`[S38-Sync] Acessando documento oficial: ${documentUrl}`);
        
        await page.goto(documentUrl, { waitUntil: 'networkidle2' });
        
        // Extrai o texto limpo do artigo
        await page.waitForSelector('article');
        const documentText = await page.$eval('article', el => el.innerText);
        await browser.close();
        
        console.log(`[S38-Sync] Documento extraído com sucesso. Tamanho: ${documentText.length} caracteres.`);

        if (!OPENROUTER_API_KEY) {
            throw new Error('OPENROUTER_API_KEY não configurada no .env');
        }

        // 2. Busca Base Atual (Injeção de Contexto)
        console.log('[S38-Sync] Consultando base atual de curator_profiles...');
        const { data: currentProfiles, error: dbError } = await supabase
            .from('curator_profiles')
            .select('*');
        
        if (dbError) throw dbError;

        const currentProfilesJson = JSON.stringify(currentProfiles, null, 2);

        // 3. Comunicação com OpenRouter
        console.log(`[S38-Sync] Enviando conteúdo para OpenRouter (${TARGET_MODEL})...`);
        
        const systemPrompt = `Você é um arquiteto de dados atuando em um sistema de designações (RVM).
Leia as instruções oficiais (S-38) atualizadas e a base de perfis atual listada abaixo.
Sua missão: Extraia as diretrizes do texto oficial e gere novos perfis sintéticos ou proponha alterações nos existentes.
Regras:
1. Retorne ESTRITAMENTE um JSON em formato de Array de objetos. Exemplo: [{"id": "leitor_fluente", "nome": "Leitor Fluente", "descricao": "...", "requisitos": ["Boa dicção"]}].
2. Não inclua Markdown envolto no JSON, retorne APENAS a string JSON válida.

Base Atual em JSON:
${currentProfilesJson}`;

        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://rvm-designacoes-antigravity.vercel.app',
                'X-Title': 'RVM Designações Auto-Sync'
            },
            body: JSON.stringify({
                model: TARGET_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `TEXTO OFICIAL DO S-38:\n\n${documentText}` }
                ],
                temperature: 0.1
            })
        });

        if (!openRouterResponse.ok) {
            const errText = await openRouterResponse.text();
            if (openRouterResponse.status === 402) {
                throw new Error(`OpenRouter Erro 402: Créditos Esgotados. ${errText}`);
            } else if (openRouterResponse.status === 429) {
                throw new Error(`OpenRouter Erro 429: Rate Limit excedido. ${errText}`);
            }
            throw new Error(`OpenRouter Erro HTTP ${openRouterResponse.status}: ${errText}`);
        }

        const aiData = await openRouterResponse.json();
        const rawJsonContent = aiData.choices?.[0]?.message?.content || '[]';
        
        // Limpar blocos markdown se existirem (fallback)
        const cleanJson = rawJsonContent.replace(/```(?:json)?\s*([\s\S]*?)\s*```/ig, '$1').trim();
        const extractedProfiles = JSON.parse(cleanJson);
        console.log(`[S38-Sync] IA gerou ${extractedProfiles.length} perfis/atualizações.`);

        // 4. Salvar no Supabase (Estágio: Rascunho IA)
        let insertedCount = 0;
        for (const profile of extractedProfiles) {
            const { error: upsertErr } = await supabase.from('curator_profiles').upsert({
                id: profile.id,
                nome: profile.nome,
                descricao: profile.descricao,
                requisitos: profile.requisitos,
                source: 'S-38',
                status: 'Rascunho IA',
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

            if (!upsertErr) insertedCount++;
        }

        // 5. Notificar Admin (Sucesso)
        const msgSuccess = `🤖 *RVM - Sincronização S-38 (JW.org)*\n\nA varredura mensal oficial foi concluída com sucesso.\n\n📄 *Perfis Processados*: ${extractedProfiles.length}\n🔄 *Inseridos/Atualizados*: ${insertedCount}\n🛑 *Estágio*: \`Rascunho IA\`\n\nAcesse a aba S-38 no painel como Admin para validar as regras.`;
        await zapiOrchestrator.sendTextDirect(ADMIN_PHONE, msgSuccess);
        console.log('[S38-Sync] Processo concluído com sucesso e Admin notificado.');

    } catch (error: any) {
        console.error('[S38-Sync] ERRO CRÍTICO:', error.message);
        // Notificar Admin (Falha)
        try {
            const msgError = `⚠️ *Alerta RVM S-38: Falha na Sincronização*\n\nO bot não conseguiu processar as instruções do WOL.\n\n*Motivo*: ${error.message}`;
            await zapiOrchestrator.sendTextDirect(ADMIN_PHONE, msgError);
            console.log('[S38-Sync] Alerta de falha enviado ao Admin via Z-API.');
        } catch (zapiErr) {
            console.error('[S38-Sync] Falha catastrófica ao tentar enviar alerta Z-API:', zapiErr);
        }
        process.exit(1);
    }
}

runS38Sync();
