import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PRIVILEGIOS_PARA_ATIVAR = [
    'Leitura da Bíblia',
    'Como ter mais alegria no ministério',
    'Iniciando conversas',
    'Cultivando o interesse',
    'Fazendo discípulos',
    'Ajudante',
    'Discurso'
];

async function activatePrivileges() {
    console.log(`\n🔍 Buscando publicadores no banco de dados do RVM...`);
    
    // Busca todos os publicadores que tem um ID vinculado ao Hourglass
    const { data: publishers, error } = await supabase
        .from('publishers')
        .select('data')
        .not('data->>hg_id', 'is', null);

    if (error) {
        console.error(error);
        throw error;
    }
    
    console.log(`✅ Encontrados ${publishers.length} publicadores com vínculo no Hourglass.`);

    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    console.log('🚀 Iniciando Robô do Hourglass com Sessão Salva...');
    
    const context = await chromium.launchPersistentContext(userDataDir, { 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars'
        ]
    });
    
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('Acessando o Hourglass (Início) para validar a sessão...');
    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(3000);

    if (page.url().includes('login') || page.url().includes('auth')) {
        console.log('⚠️ O Hourglass pediu login. Uma janela do Chrome (Playwright) foi aberta! Faça login manualmente e eu continuo!');
        await page.waitForURL('**/app/**', { timeout: 0 });
        console.log('✅ Login detectado e salvo para as próximas vezes!');
    }

    let processedCount = 0;
    let modifiedCount = 0;

    for (const pub of publishers) {
        const hgId = pub.data.hg_id;
        const name = pub.data.hg_name || pub.name;
        const isSister = pub.data.gender === 'sister' || pub.data.gender === 'female' || pub.data.gender === 'F';
        
        console.log(`\n======================================================`);
        console.log(`👤 Acessando privilégios de: ${name} (ID: ${hgId})`);
        
        const url = `https://app.hourglass-app.com/v2/page/app/user/privileges/${hgId}`;
        await page.goto(url);
        
        try {
            // Os checkboxes do Hourglass são ocultos por CSS (display:none) para desenhar um SVG por cima.
            // Precisamos esperar eles existirem no DOM ('attached'), ignorando se estão 'visíveis' ou não.
            await page.waitForSelector('input[type="checkbox"]', { state: 'attached', timeout: 15000 });
            await page.waitForTimeout(1000); // Respiro pro React

            let hadChanges = false;
            
            // OTIMIZAÇÃO: Verifica primeiro se "Iniciando conversas" já está ativado. Se sim, pula o publicador inteiro!
            const labelIniciando = page.locator('label').filter({ hasText: /^Iniciando conversas/ }).first();
            if (await labelIniciando.count() > 0) {
                const forAttrIniciando = await labelIniciando.getAttribute('for');
                const checkboxIniciando = forAttrIniciando ? page.locator(`input#${forAttrIniciando}`) : labelIniciando.locator('..').locator('input[type="checkbox"]').first();
                if (await checkboxIniciando.isChecked({ timeout: 2000 }).catch(() => false)) {
                    console.log(`  ⏩ Publicador já está com "Iniciando conversas" ativado. Pulando para o próximo!`);
                    processedCount++;
                    await page.waitForTimeout(500);
                    continue;
                }
            }

            for (const priv of PRIVILEGIOS_PARA_ATIVAR) {
                // Procura a label exata e usa o atributo 'for' para achar o checkbox 100% correto (sem pegar checkbox do vizinho)
                const label = page.locator('label').filter({ hasText: new RegExp(`^${priv}`) }).first();
                
                if (await label.count() > 0) {
                    const forAttr = await label.getAttribute('for');
                    const checkbox = forAttr ? page.locator(`input#${forAttr}`) : label.locator('..').locator('input[type="checkbox"]').first();
                    
                    // Reduzindo timeout do isChecked para falhar rápido se não achar
                    const isChecked = await checkbox.isChecked({ timeout: 2000 });
                    
                    // Se o Hourglass já bloqueou essa parte para a pessoa (ex: Irmãs não podem fazer Discurso), pula!
                    if (await checkbox.isDisabled()) {
                        console.log(`  🚫 Bloqueado pelo Hourglass: ${priv} (pulando)`);
                        continue;
                    }
                    
                    const isRestrictedForSisters = (priv === 'Leitura da Bíblia' || priv === 'Discurso');
                    
                    if (isRestrictedForSisters && isSister) {
                        if (isChecked) {
                            console.log(`  ➖ Desativando: ${priv} (é Irmã)`);
                            await checkbox.uncheck({ force: true });
                            hadChanges = true;
                        } else {
                            console.log(`  ✔️ Já desativado: ${priv} (é Irmã)`);
                        }
                    } else {
                        if (!isChecked) {
                            console.log(`  ➕ Ativando: ${priv}`);
                            await checkbox.check({ force: true });
                            hadChanges = true;
                        } else {
                            console.log(`  ✔️ Já ativado: ${priv}`);
                        }
                    }
                } else {
                    console.log(`  ⚠️ Não encontrou o rótulo para: ${priv}`);
                }
            }
            
            if (hadChanges) {
                // O Hourglass geralmente salva sozinho (auto-save) ao clicar,
                // mas vamos dar um tempinho só por garantia antes de navegar pro próximo
                await page.waitForTimeout(1500);
                modifiedCount++;
            }
            processedCount++;

        } catch (e: any) {
            console.log(`⚠️ Erro ou Timeout ao processar ${name}.`);
            console.log(`Detalhe do erro: ${e.message}`);
        }
        
        // Dá um pequeno respiro entre um publicador e outro para o Hourglass não bloquear por excesso de requisições
        await page.waitForTimeout(1000);
    }

    console.log(`\n🎉 Processo finalizado!`);
    console.log(`Processados: ${processedCount}/${publishers.length}`);
    console.log(`Publicadores com privilégios modificados: ${modifiedCount}`);
    
    console.log(`👀 Fechando o navegador...`);
    await context.close();
}

activatePrivileges().catch(console.error);
