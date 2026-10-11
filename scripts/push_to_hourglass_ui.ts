import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Credenciais do Hourglass (coloque no .env.local)
const HG_EMAIL = process.env.HG_EMAIL;
const HG_PASSWORD = process.env.HG_PASSWORD;

async function pushAssignmentsViaUI() {
  console.log(`\n🔍 Buscando designações futuras no RVM...`);
  
  // Pega a data de hoje formatada YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  const { data: allParts, error } = await supabase
    .from('workbook_parts')
    .select('*, publishers:resolved_publisher_id(data)')
    .not('resolved_publisher_id', 'is', null)
    .in('status', ['DESIGNADA', 'APROVADA'])
    .gte('week_id', today)
    .order('week_id', { ascending: true });

  if (error) throw error;
  
  // Agrupa por semana
  const partsByWeek: Record<string, any[]> = {};
  for (const part of allParts) {
      if (!partsByWeek[part.week_id]) partsByWeek[part.week_id] = [];
      partsByWeek[part.week_id].push(part);
  }

  const weeks = Object.keys(partsByWeek);
  console.log(`Encontradas ${allParts.length} partes distribuídas em ${weeks.length} semanas: ${weeks.join(', ')}`);

  if (weeks.length === 0) return;

  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');

  console.log('🚀 Iniciando Robô do Hourglass com Sessão Salva...');
  
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: false
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    console.log('Acessando o Hourglass...');
    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(3000);
    
    if (page.url().includes('login') || page.url().includes('auth')) {
      console.log('⚠️ O Hourglass pediu login. Uma janela do Chrome (Playwright) foi aberta!');
      await page.waitForURL('**/app/**', { timeout: 0 });
      console.log('✅ Login detectado e salvo para as próximas vezes!');
    }

    for (const weekStart of weeks) {
        // weekStart é o MONDAY (ex: 2026-10-12). O Hourglass usa Monday_Sunday.
        const start = new Date(weekStart);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const weekEnd = end.toISOString().split('T')[0];

        const weekUrl = `https://app.hourglass-app.com/v2/page/app/scheduling/mm`;
        
        console.log(`\n======================================================`);
        console.log(`📅 Selecionando a semana: ${weekStart} no calendário`);
        
        // Se ainda não estivermos na página de designações, navega pra lá
        if (page.url() !== weekUrl) {
            await page.goto(weekUrl);
            await page.waitForLoadState('networkidle');
        }

        // Usa o DatePicker nativo do site para mudar a semana
        const dateInput = page.locator('input[type="date"]');
        await dateInput.fill(weekStart);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000); // Dar tempo para carregar as partes daquela semana
        
        console.log(`🤖 Aguardando partes carregarem (até 30s)...`);
        try {
            await page.waitForSelector('.mm_part', { timeout: 30000 });
            await page.waitForTimeout(1000); // Dar um respiro pro React renderizar tudo
        } catch (e) {
            console.log(`⚠️ A página demorou muito para carregar as partes. Tentando mesmo assim...`);
        }

        console.log('🤖 Iniciando preenchimento visual da semana...');
        const parts = partsByWeek[weekStart];

        for (const part of parts) {
            const pubData = (part.publishers as any)?.data || {};
            // Usa preferencialmente o nome EXATO sincronizado do Hourglass
            const searchName = pubData.hg_name || pubData.name || '';
            if (!searchName) continue;

            if (!part.part_title || part.part_title.trim() === '') continue;
            if (part.part_title.includes('Cântico') || part.part_title.includes('Elogios') || part.part_title.includes('Conselhos')) {
                continue;
            }

            console.log(`Preenchendo: ${part.part_title} -> ${searchName}`);
            
            try {
                let titleToSearch = part.part_title.replace(/^\d+\.\s*/, '').trim();
                let isHelper = false;
                let button;

                if (titleToSearch === 'Presidente') {
                    button = page.locator('#ddm_chairman button').first();
                } else if (titleToSearch === 'Oração Inicial') {
                    button = page.locator('#ddm_openprayer button').first();
                } else if (titleToSearch === 'Oração Final') {
                    button = page.locator('#ddm_closeprayer button').first();
                } else if (titleToSearch === 'Leitor do Estudo Bíblico de Congregação') {
                    button = page.locator('#ddm_cbs_reader button').first();
                } else {
                    if (titleToSearch.includes('- Ajudante')) {
                        isHelper = true;
                        titleToSearch = titleToSearch.replace(' - Ajudante', '').trim();
                    } else if (titleToSearch.includes('Necessidades Locais')) {
                        titleToSearch = 'Necessidades locais';
                    }

                    // Usa hasText que faz match parcial (mesmo se o HG tiver "4. " na frente)
                    const row = page.locator('.mm_part').filter({ hasText: titleToSearch }).first();
                    
                    if (isHelper) {
                        // Se for ajudante, é o segundo botão de dropdown na linha
                        button = row.locator('button[data-bs-toggle="dropdown"], button.dropdown-toggle').nth(1);
                    } else {
                        // Se for titular, é o primeiro botão
                        button = row.locator('button[data-bs-toggle="dropdown"], button.dropdown-toggle').first();
                    }
                }

                try {
                    await button.click({ timeout: 3000 });
                } catch (clickErr) {
                    console.log(`⚠️ Erro ao clicar. Inspecionando o HTML da linha:`);
                    console.log(await row.innerHTML());
                    throw clickErr;
                }
                
                await page.waitForTimeout(500);

                // Digita o nome de busca EXATO no input correto do dropdown
                const searchInput = page.locator('.dropdown-menu input[placeholder="Pesquisa..."]').first();
                await searchInput.fill(searchName);
                
                await page.waitForTimeout(500); // Esperar o filtro acontecer
                
                // Procurar o item do dropdown que realmente tem o nome da pessoa
                try {
                    const suggestion = page.locator('.dropdown-menu .dropdown-item').filter({ hasText: searchName }).first();
                    await suggestion.waitFor({ state: 'visible', timeout: 3000 });
                    
                    const text = await suggestion.innerText();
                    console.log(`  Achou no Hourglass: "${text.trim().split('\n').join(' ')}" (para ${searchName})`);
                    
                    await suggestion.click();
                    console.log(`✅ Preenchido: ${searchName}`);
                } catch (e) {
                    console.log(`  (Aviso: Nenhuma sugestão abriu para "${searchName}")`);
                }
                
                await page.waitForTimeout(1500);
            } catch (err) {
                console.log(`⚠️ Não consegui achar onde clicar para: ${part.part_title}`);
            }
            
            await page.waitForTimeout(1000); 
        }
    }

    console.log('\n✅ Push visual de todas as semanas finalizado com sucesso!');
    console.log('👀 Estou mantendo o navegador aberto por 5 minutos para você olhar!');
    await page.waitForTimeout(300000);
    
  } catch (err) {
    console.error('Erro durante a automação:', err);
  } finally {
    await context.close();
  }
}

pushAssignmentsViaUI();
