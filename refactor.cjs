const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'supabase', 'functions', 'cron-whatsapp-reminders', 'index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace logDispatch and sendWhatsApp definitions with the globalQueue and enqueueWhatsApp logic
const utilsRegex = /async function logDispatch[\s\S]*?async function sendWhatsApp[\s\S]*?return { success: data\.success, messageId: data\.messageId };\n}/m;

const newUtils = `
let globalQueue: any[] = [];

function enqueueWhatsApp(type: string, phone: string, message: string, options?: any, partId?: string) {
    globalQueue.push({
        type,
        payload: { phone, message, options, partId }
    });
}

async function triggerHeadlessQueueConsumer() {
    const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
    const REPO_OWNER = Deno.env.get('GITHUB_REPO_OWNER') ?? 'EliezerRosa';
    const REPO_NAME = Deno.env.get('GITHUB_REPO_NAME') ?? 'RVM-Designacoes-Antigravity';
    
    if (!GITHUB_PAT) {
        console.error("GITHUB_PAT não encontrado. Não posso acordar o GitHub Actions.");
        return;
    }

    const res = await fetch(\`https://api.github.com/repos/\${REPO_OWNER}/\${REPO_NAME}/dispatches\`, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': \`Bearer \${GITHUB_PAT}\`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Supabase-Edge-Function'
        },
        body: JSON.stringify({
            event_type: "consume-whatsapp-queue"
        })
    });
    if (!res.ok) {
        console.error("Falha ao disparar consumer:", await res.text());
    } else {
        console.log("Consumer disparado no GitHub Actions.");
    }
}
`;

content = content.replace(utilsRegex, newUtils);

// 2. Replace 72h
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(pub\.phone, msg, options\);\s*\/\/.*?\s*\/\/.*?\s*await logDispatch\(part\.id, 'COBRANCA_72H', pub\.phone, success \? 'SUCCESS' : 'ERROR', messageId\);\s*if \(success\) sentCount\+\+;/gm,
    `enqueueWhatsApp('COBRANCA_72H', pub.phone, msg, options, part.id);
                sentCount++;`
);

// 3. Replace D9/D7/D2
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(pub\.phone, msg, options\);\s*await logDispatch\(part\.id, dispatchType, pub\.phone, success \? 'SUCCESS' : 'ERROR', messageId\);\s*if \(success\) sentCount\+\+;/gm,
    `enqueueWhatsApp(dispatchType, pub.phone, msg, options, part.id);
        sentCount++;`
);

// 4. Replace Auto-Reparo
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(pub\.phone, msg\);\s*await logDispatch\(part\.id, 'REPARO_ZAPI', pub\.phone, success \? 'SUCCESS' : 'ERROR', messageId\);\s*if \(success\) repairReports\.push\(`✅ Auto-reparo p\/ \$\{pub\.name\} \(\$\{part\.tipo_parte\}\)`\);/gm,
    `enqueueWhatsApp('REPARO_ZAPI', pub.phone, msg, undefined, part.id);
        repairReports.push(\`✅ Auto-reparo p/ \${pub.name} (\${part.tipo_parte})\`);`
);

// 5. Replace Ghosting
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(pub\.phone, msg\);\s*await logDispatch\(part\.id, 'ALERTA_GHOSTING', pub\.phone, success \? 'SUCCESS' : 'ERROR', messageId\);\s*if \(success\) ghostingReports\.push\(`👻 Ghosting alertado p\/ \$\{pub\.name\} \(\$\{part\.tipo_parte\}\)`\);/gm,
    `enqueueWhatsApp('ALERTA_GHOSTING', pub.phone, msg, undefined, part.id);
        ghostingReports.push(\`👻 Ghosting alertado p/ \${pub.name} (\${part.tipo_parte})\`);`
);

// 6. Replace Monthly
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(member\.phone, memberReport\);\s*if \(success\) sentMonthly\+\+;/gm,
    `enqueueWhatsApp('RELATORIO_LIDERANCA', member.phone, memberReport);
            sentMonthly++;`
);

// 7. Replace Weekly
content = content.replace(
    /const { success, messageId } = await sendWhatsApp\(member\.phone, personalizedReport\);\s*if \(success\) sentWeekly\+\+;/gm,
    `enqueueWhatsApp('RELATORIO_LIDERANCA', member.phone, personalizedReport);
        sentWeekly++;`
);

// 8. Replace Daily Report
content = content.replace(
    /await sendWhatsApp\(pub\.phone, report\);/gm,
    `enqueueWhatsApp('RELATORIO_LIDERANCA', pub.phone, report);`
);

// 9. Add the flush block at the end of serve
const flushBlock = `
    // Flush the queue to DB
    if (globalQueue.length > 0) {
        const { error: insertErr } = await supabase.from('whatsapp_queue').insert(globalQueue);
        if (insertErr) {
            console.error('[cron] Falha catastrófica ao inserir na whatsapp_queue:', insertErr);
        } else {
            console.log(\`[cron] \${globalQueue.length} itens enfileirados na whatsapp_queue com sucesso.\`);
            await triggerHeadlessQueueConsumer();
        }
    }
    
    // Reset queue in memory in case the runtime reuses the lambda environment
    globalQueue = [];
`;

content = content.replace(
    /console\.log\(`\[cron-whatsapp-reminders\] Finalizado/gm,
    `${flushBlock}\n    console.log(\`[cron-whatsapp-reminders] Finalizado`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Refactored successfully!');
