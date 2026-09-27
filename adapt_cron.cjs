const fs = require('fs');

let content = fs.readFileSync('temp_cron.ts', 'utf8');

// Replace imports
content = content.replace(
    /import \{ serve \} from "https:\/\/deno.land\/std@0.177.0\/http\/server.ts";/g,
    ''
);
content = content.replace(
    /import \{ createClient \} from "https:\/\/esm.sh\/@supabase\/supabase-js@2.42.0";/g,
    'import { createClient } from "@supabase/supabase-js";'
);

// Replace Deno.env.get with process.env
content = content.replace(/Deno\.env\.get\("([^"]+)"\)/g, 'process.env["$1"]');
content = content.replace(/Deno\.env\.get\('([^']+)'\)/g, 'process.env["$1"]');

// Remove serve wrapper
content = content.replace(/serve\(async \(req: Request\) => \{/g, 'async function runCron() {');

// Replace the return Responses with just returns
content = content.replace(/return new Response\("Forbidden", \{ status: 403 \}\);/g, 'return;');
content = content.replace(/return new Response\("Method Not Allowed", \{ status: 405 \}\);/g, 'return;');
content = content.replace(/return new Response\(JSON\.stringify\(\{ message: 'Cron job executed successfully'\s*\}\), \{[^}]+\}\);/g, 'return;');
content = content.replace(/return new Response\(JSON\.stringify\(\{ error: err\.message \}\), \{ status: 500 \}\);/g, 'throw err;');

// Call runCron at the end
content += '\n\nrunCron().then(() => console.log("Cron mock done")).catch(console.error);';

fs.writeFileSync('temp_cron.ts', content, 'utf8');
