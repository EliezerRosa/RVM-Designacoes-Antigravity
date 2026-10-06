import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We can just run the logic from the index.ts directly, or serve it locally
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
