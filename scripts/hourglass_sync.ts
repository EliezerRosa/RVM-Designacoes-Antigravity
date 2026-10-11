import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const LGROUP = '39934'; // Congregação ID

// Configurações e Opções de CLI
const options = {
    direction: process.argv.includes('--pull') ? 'pull' : 'push', // pull: HG -> RVM, push: RVM -> HG
    syncPublishers: process.argv.includes('--publishers') || process.argv.includes('--all'),
    syncAssignments: process.argv.includes('--assignments') || process.argv.includes('--all'),
};

async function main() {
    console.log(`🚀 Iniciando Sincronização do Hourglass!`);
    console.log(`Direção: ${options.direction === 'pull' ? 'HG ➡️ RVM (Puxar)' : 'RVM ➡️ HG (Empurrar)'}`);
    console.log(`Escopo: ${options.syncPublishers ? '[X] Publicadores' : '[ ] Publicadores'} | ${options.syncAssignments ? '[X] Designações' : '[ ] Designações'}\n`);

    if (!options.syncPublishers && !options.syncAssignments) {
        console.log('⚠️ Nenhum escopo selecionado. Use --publishers, --assignments ou --all');
        return;
    }

    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    // Mudando headless para false temporariamente para garantir que a sessão carregue sem restrições
    const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    let xsrfToken = '';
    page.on('request', request => {
        const token = request.headers()['x-hourglass-xsrf-token'];
        if (token) xsrfToken = token;
    });

    console.log('📡 Conectando com a sessão do Hourglass...');
    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(4000); 

    // Testa se estamos logados, passando o token
    const startupData = await page.evaluate(async (token) => {
        try {
            const res = await fetch('https://app.hourglass-app.com/api/v0.2/fsreport/startup', {
                headers: {
                    'x-hourglass-xsrf-token': token,
                    'accept': 'application/json'
                }
            });
            if (!res.ok) return { error: await res.text() };
            return await res.json();
        } catch(e: any) {
            return { error: e.message };
        }
    }, xsrfToken);

    if (!startupData || !startupData.whoami) {
        console.error('❌ Sessão expirada ou não autorizada! Resposta:', startupData?.error || 'Nenhuma');
        console.log('Token tentado:', xsrfToken);
        await context.close();
        return;
    }
    console.log(`✅ Autenticado no Hourglass como: ${startupData.whoami.user.firstname} ${startupData.whoami.user.lastname}`);

    // --- SINCRONIA DE PUBLICADORES ---
    if (options.syncPublishers) {
        if (options.direction === 'pull') {
            await pullPublishers(page);
        } else {
            console.log('⚠️ Push de publicadores (RVM -> HG) será implementado em breve.');
        }
    }

    // --- SINCRONIA DE DESIGNAÇÕES ---
    if (options.syncAssignments) {
        if (options.direction === 'push') {
            await pushAssignments(page, xsrfToken);
        } else {
            console.log('⚠️ Pull de designações (HG -> RVM) será implementado em breve.');
        }
    }

    await context.close();
    console.log('\n🏁 Sincronização finalizada!');
}

async function pullPublishers(page: any) {
    console.log('\n🔄 [PULL] Baixando Publicadores do Hourglass...');
    
    // Puxando a tabela DOM porque a API de publishers deles é oculta/restrita no GraphQL deles
    await page.goto('https://app.hourglass-app.com/v2/page/app/contactList');
    await page.waitForTimeout(4000);
    
    const hgPubs = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(tr => {
            const name = tr.querySelector('td')?.innerText.split('\n')[0].trim();
            const editLink = tr.querySelector('a[href*="/user/edit/"]');
            let id = null;
            if (editLink) {
                const match = editLink.getAttribute('href')?.match(/\/user\/edit\/(\d+)/);
                if (match) id = parseInt(match[1]);
            }
            return { name, hg_id: id };
        }).filter(p => p.hg_id);
    });

    console.log(`✅ Lidos ${hgPubs.length} publicadores do Hourglass.`);
    // A lógica de atualizar no banco Supabase seria a mesma do script sync_hourglass_publishers.ts
    // ... [Será migrada para cá nas próximas etapas]
    console.log(`(Lógica de mesclagem no Supabase ignorada neste teste).`);
}

async function pushAssignments(page: any, xsrfToken: string) {
    console.log('\n🔄 [PUSH] Injetando Designações via API invisível...');
    
    // 1. Pega todas as designações do RVM do mês atual pra frente
    const { data: allParts, error } = await supabase
        .from('workbook_parts')
        .select('*, publishers:resolved_publisher_id(data)')
        .not('resolved_publisher_id', 'is', null)
        .gte('week_id', '2026-10-01') // Pegando de out/2026 pra frente
        .order('week_id', { ascending: true });

    if (error) throw error;

    const partsByWeek: Record<string, any[]> = {};
    for (const part of allParts) {
        if (!partsByWeek[part.week_id]) partsByWeek[part.week_id] = [];
        partsByWeek[part.week_id].push(part);
    }

    const weeks = Object.keys(partsByWeek);
    if (weeks.length === 0) {
        console.log('Nenhuma designação futura encontrada no RVM.');
        return;
    }

    for (const weekStart of weeks) {
        console.log(`\n=========================================`);
        console.log(`📅 Processando a semana de: ${weekStart}`);
        
        // No Hourglass, a URL exige o formato {start}_{end}
        const start = new Date(weekStart);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const weekEnd = end.toISOString().split('T')[0];

        // 2. Consulta os Metadados da Reunião (para pegar os Títulos das partes)
        const meetingData = await page.evaluate(async (params: any) => {
            const res = await fetch(`https://app.hourglass-app.com/api/v0.2/scheduling/mm/meeting/${params.weekStart}_${params.weekEnd}?lgroup=${params.LGROUP}&no_subs=true`, {
                headers: { 'x-hourglass-xsrf-token': params.xsrfToken, 'accept': 'application/json' }
            });
            if (!res.ok) return null;
            return await res.json();
        }, { weekStart, weekEnd, LGROUP, xsrfToken });

        // 3. Consulta a Agenda em si (para pegar os IDs dos slots)
        const scheduleData = await page.evaluate(async (params: any) => {
            const res = await fetch(`https://app.hourglass-app.com/api/v0.2/scheduling/mm/schedule/${params.weekStart}_${params.weekEnd}?lgroup=${params.LGROUP}`, {
                headers: { 'x-hourglass-xsrf-token': params.xsrfToken, 'accept': 'application/json' }
            });
            if (!res.ok) return null;
            return await res.json();
        }, { weekStart, weekEnd, LGROUP, xsrfToken });

        if (!meetingData || !scheduleData || meetingData.length === 0 || scheduleData.length === 0) {
            console.log(`⚠️ Não consegui baixar os dados do Hourglass para a semana ${weekStart}.`);
            continue;
        }

        const hgMeeting = meetingData[0];
        const hgSchedule = scheduleData[0];
        const rvmParts = partsByWeek[weekStart];

        for (const rvmPart of rvmParts) {
            const hgId = (rvmPart.publishers as any)?.data?.hg_id;
            const pubName = (rvmPart.publishers as any)?.data?.name;
            if (!hgId) {
                console.log(`⚠️ Ignorando ${pubName} (${rvmPart.part_title}) - Não possui hg_id sincronizado.`);
                continue;
            }

            let title = rvmPart.part_title;
            let section = '';
            let endpoint = '';
            let method = 'PUT';
            let payload: any = { assignee: parseInt(hgId) };

            // A. Mapeamento das Partes Core
            if (title === 'Presidente') {
                endpoint = 'core'; payload.part_type = 'chairman';
            } else if (title === 'Oração Inicial') {
                endpoint = 'core'; payload.part_type = 'openprayer';
            } else if (title === 'Oração Final') {
                endpoint = 'core'; payload.part_type = 'closeprayer';
            } else if (title === 'Leitor do Estudo Bíblico de Congregação') {
                endpoint = 'core'; payload.part_type = 'cbs_reader';
            } 
            // B. Mapeamento das Partes Dinâmicas (TGW, FM, LAC)
            else {
                let isHelper = false;
                if (title.includes('- Ajudante')) {
                    isHelper = true;
                    title = title.replace(' - Ajudante', '').trim();
                } else if (title.includes('Necessidades Locais')) {
                    title = 'Necessidades locais';
                }

                // Procura a parte nos arrays do Hourglass
                let foundPartDef = null;
                for (const cat of ['tgw', 'fm', 'lac']) {
                    const match = hgMeeting[cat]?.find((p: any) => p.title.toLowerCase().includes(title.toLowerCase()));
                    if (match) {
                        foundPartDef = match;
                        section = cat;
                        break;
                    }
                }

                if (!foundPartDef) {
                    console.log(`⚠️ Não achei a parte "${title}" na estrutura do Hourglass.`);
                    continue;
                }

                // Acha o slot na agenda usando o ID da definição da parte
                const slot = hgSchedule[section]?.find((s: any) => s.part === foundPartDef.id);
                
                if (!slot) {
                    // O slot não existe ainda! Descobrimos que o Hourglass usa PUT na raiz da seção para criar!
                    console.log(`⚠️ Slot não existe para "${title}". Tentando criar via PUT sem ID...`);
                    endpoint = `${section}`; // Ex: tgw (sem barra id)
                    method = 'PUT';
                    payload = { 
                        part: foundPartDef.id, 
                        assignee: parseInt(hgId), 
                        assistant: 0, 
                        classroom: 0 
                    };
                } else {
                    endpoint = `${section}/${slot.id}`; // Ex: tgw/15511731
                    
                    if (isHelper) {
                        payload = { assignee: slot.assignee || 0, assistant: parseInt(hgId), classroom: 0 };
                    } else {
                        payload = { assignee: parseInt(hgId), assistant: slot.assistant || 0, classroom: 0 };
                    }
                }
            }

            console.log(`Injetando: ${rvmPart.part_title} -> ${pubName} (HG ID: ${hgId}) [API: ${endpoint}]`);
            
            // Dispara a requisição (PUT ou POST)
            const status = await page.evaluate(async (params: any) => {
                const res = await fetch(`https://app.hourglass-app.com/api/v0.2/scheduling/mm/schedule/${params.weekStart}/${params.endpoint}?group=${params.LGROUP}`, {
                    method: params.method,
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-hourglass-xsrf-token': params.xsrfToken,
                        'accept': 'application/json'
                    },
                    body: JSON.stringify(params.payload)
                });
                return res.status;
            }, { weekStart, endpoint, LGROUP, payload, xsrfToken, method });

            if (status !== 200 && status !== 201) {
                console.log(`   ❌ Erro ao enviar. Status HTTP: ${status}`);
            }
        }
    }
}

main().catch(console.error);
