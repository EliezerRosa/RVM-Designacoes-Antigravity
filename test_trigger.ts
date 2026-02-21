import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        // 1. Fetch an existing assignment to use as base
        const { data: assignments, error: err1 } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .limit(1);

        if (err1 || !assignments || assignments.length === 0) {
            console.log("No assignments found to duplicate.");
            return;
        }

        const base = assignments[0];
        const publisher_id = base.principal_publisher_id;
        if (!publisher_id) {
            console.log("Base assignment missing principal_publisher_id");
            return;
        }

        // 2. Try to insert another assignment for the same publisher and the same week
        const newAssignment = {
            date: base.date,
            week_id: base.week_id,
            part_id: "test-duplicate-part-123",
            part_title: "TEST PART",
            part_type: "TEST",
            principal_publisher_id: publisher_id,
            principal_publisher_name: base.principal_publisher_name,
            status: "TEST",
            teaching_category: "TEST"
        };

        console.log(`Trying to assign publisher ${publisher_id} to week ${base.week_id} again...`);

        const { data, error } = await supabase
            .from('scheduled_assignments')
            .insert([newAssignment]);

        if (error) {
            console.error("EXPECTED ERROR - BLOCK SUCCESS:", error.message);
        } else {
            console.log("UNEXPECTED SUCCESS:", data);
        }
    } catch (e) {
        console.error("Exec:", e);
    }
}

run();
