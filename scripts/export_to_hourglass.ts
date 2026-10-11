import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not found in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportToHourglass() {
  console.log('Fetching publishers from Supabase...');
  const { data: publishersData, error } = await supabase.from('publishers').select('*');

  if (error) {
    console.error('Error fetching publishers:', error);
    return;
  }

  const activePublishers = publishersData.filter(pub => pub.data.isServing !== false);
  console.log(`Found ${publishersData.length} total publishers. Excluding inactive... ${activePublishers.length} active publishers left. Formatting for Hourglass...`);

  // The exact columns from the template:
  // ID, lastname, firstname, middlename, suffix, sex, birth, baptism, appt, pioneerid, email, cellphone, homephone, address_line1, address_line2, address_city, address_state, address_postalcode, status, label
  const rows = activePublishers.map((pub, index) => {
    const data = pub.data;
    const nameParts = (data.name || '').trim().split(' ');
    const firstname = nameParts[0] || '';
    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    
    let sex = '';
    if (data.gender === 'brother') sex = 'Male';
    if (data.gender === 'sister') sex = 'Female';

    let appt = '';
    if (data.funcao === 'Ancião' || data.funcao === 'Anciao') appt = 'Elder';
    if (data.funcao === 'Servo Ministerial' || data.funcao === 'Servo') appt = 'Ministerial Servant';

    let pioneerid = '';
    if (data.condition === 'Pioneiro Regular' || data.condition === 'Pioneiro') pioneerid = 'Regular';

    let status = '';
    if (data.isBaptized) {
      status = 'Baptized Publisher';
    } else {
      status = 'Unbaptized Publisher';
    }

    return [
      index + 1, // ID (numeric sequential)
      lastname,  // lastname
      firstname, // firstname
      '',        // middlename
      '',        // suffix
      sex,       // sex
      null,      // birth
      null,      // baptism
      appt,      // appt
      pioneerid, // pioneerid
      data.email || '', // email
      data.phone || '', // cellphone
      '',        // homephone
      '',        // address_line1
      '',        // address_line2
      '',        // address_city
      '',        // address_state
      '',        // address_postalcode
      status,    // status
      ''         // label
    ];
  });

  const templatePath = path.resolve(process.cwd(), 'hourglass-import.xlsx');
  if (!fs.existsSync(templatePath)) {
    console.error('Template file not found at:', templatePath);
    return;
  }

  const fileBuffer = fs.readFileSync(templatePath);
  const wb = xlsx.read(fileBuffer);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  xlsx.utils.sheet_add_json(ws, rows, { skipHeader: true, origin: 'A2' });

  const outBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(templatePath, outBuffer);

  console.log(`Successfully exported to ${templatePath}`);
}

exportToHourglass();
