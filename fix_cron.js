import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const filePath = join('c:', 'Antigravity - RVM Designações', 'rvm-designacoes-unified', 'supabase', 'functions', 'cron-whatsapp-reminders', 'index.ts');
let content = readFileSync(filePath, 'utf8');

// The function we want to replace
const oldFunc = sync function checkDispatched(partId: string, dispatchType: string) {
    const { data } = await supabase
        .from('zapi_dispatch_log')
        .select('id')
        .eq('part_id', partId)
        .eq('dispatch_type', dispatchType)
        .eq('status', 'SUCCESS')
        .maybeSingle();
    return !!data;
};

const newFunc = sync function checkDispatched(partId: string, dispatchType: string) {
    // Busca flexível: encontra o ID original ou as variações -titular e -ajudante do frontend
    const { data } = await supabase
        .from('zapi_dispatch_log')
        .select('id')
        .or(\part_id.eq.\,part_id.eq.\-titular,part_id.eq.\-ajudante\)
        .eq('dispatch_type', dispatchType)
        .eq('status', 'SUCCESS')
        .limit(1)
        .maybeSingle();
    return !!data;
};

if (content.includes(oldFunc)) {
    content = content.replace(oldFunc, newFunc);
    writeFileSync(filePath, content, 'utf8');
    console.log('Função checkDispatched corrigida com sucesso!');
} else {
    console.log('Não foi possível encontrar a função original no arquivo para substituição.');
}
