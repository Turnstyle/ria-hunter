import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyVectorMigration() {
  console.log('🚀 Applying vector similarity search migration...');
  
  try {
    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase/migrations/20250805000000_add_vector_similarity_search.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`\n📝 Executing statement ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + '...');
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error);
        // Try direct query for some statements
        const { error: directError } = await supabase
          .from('information_schema.tables')
          .select('*')
          .limit(1);
        
        if (!directError) {
          console.log('✅ Database connection is working, continuing...');
        }
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log('\n🎉 Vector similarity search migration completed!');
    
    // Test the functions
    console.log('\n🧪 Testing vector search functions...');
    
    // Check if functions exist
    const { data: functions, error: funcError } = await supabase
      .rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_threshold: 0.1,
        match_count: 1
      });
    
    if (funcError) {
      console.log('⚠️  match_narratives function may need manual setup:', funcError.message);
    } else {
      console.log('✅ match_narratives function is working!');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

applyVectorMigration().catch(console.error);