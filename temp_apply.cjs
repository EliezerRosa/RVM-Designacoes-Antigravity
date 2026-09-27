require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('No SUPABASE_DB_URL'); process.exit(1); }
try {
  console.log('Applying migration...');
  execSync(`psql "${dbUrl}" -f supabase/migrations/20260922211500_status_pdf_queue.sql`, { stdio: 'inherit' });
  console.log('Done.');
} catch(e) {
  console.error('Error applying migration', e);
  process.exit(1);
}
