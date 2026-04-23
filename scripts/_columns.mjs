import fs from 'fs';
const lines = fs.readFileSync('.env.local','utf-8').split('\n');
for(const l of lines){const m=l.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?$/);if(m)process.env[m[1]]=m[2];}
const {createClient}=await import('@supabase/supabase-js');
const sb=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY);
const {data}=await sb.from('workbook_parts').select('*').limit(1);
console.log(JSON.stringify(Object.keys(data[0]),null,2));
