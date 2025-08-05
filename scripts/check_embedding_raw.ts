// Check raw embedding data
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRawEmbeddings() {
  console.log('🔍 Checking raw embedding data...');
  
  try {
    // Get one specific embedding we just created
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, embedding')
      .eq('crd_number', 4)
      .limit(1);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (data && data.length > 0 && data[0].embedding) {
      const embedding = data[0].embedding;
      console.log(`✅ Found embedding for CRD ${data[0].crd_number}`);
      console.log(`📊 Type: ${typeof embedding}`);
      console.log(`📊 Is Array: ${Array.isArray(embedding)}`);
      
      if (Array.isArray(embedding)) {
        console.log(`📊 Length: ${embedding.length}`);
        console.log(`📊 First 5 values: [${embedding.slice(0, 5).join(', ')}]`);
        console.log(`📊 Last 5 values: [${embedding.slice(-5).join(', ')}]`);
      } else {
        console.log(`📊 Value: ${JSON.stringify(embedding).substring(0, 200)}...`);
      }
    } else {
      console.log('❌ No embedding found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkRawEmbeddings().catch(console.error);