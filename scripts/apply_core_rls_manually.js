/**
 * Apply Core RLS Policies Manually
 * This script executes the most critical RLS changes step by step
 */

const { createClient } = require('@supabase/supabase-js')

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeSQL(description, sql) {
  console.log(`🔧 ${description}`)
  console.log(`   SQL: ${sql.substring(0, 100)}...`)
  
  try {
    // For now, we'll log what would be executed
    // The actual SQL execution will need to be done via Supabase SQL Editor
    console.log('   ℹ️  SQL logged for manual execution')
    return true
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
    return false
  }
}

async function applyCoreRLS() {
  console.log('🔧 Applying Core RLS Implementation...\n')
  
  const sqlStatements = [
    {
      description: 'Create migration_log table',
      sql: `CREATE TABLE IF NOT EXISTS migration_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`
    },
    {
      description: 'Create etl_dead_letter table',
      sql: `CREATE TABLE IF NOT EXISTS etl_dead_letter (
        id SERIAL PRIMARY KEY,
        record_data JSONB NOT NULL,
        error_message TEXT,
        error_stage TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`
    },
    {
      description: 'Create search_errors table',
      sql: `CREATE TABLE IF NOT EXISTS search_errors (
        id SERIAL PRIMARY KEY,
        function_name TEXT NOT NULL,
        error_message TEXT NOT NULL,
        query_params JSONB,
        user_id UUID DEFAULT auth.uid(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`
    },
    {
      description: 'Create audit trigger function',
      sql: `CREATE OR REPLACE FUNCTION audit_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          INSERT INTO audit_logs (
              table_name, operation, user_id, record_id, 
              old_values, new_values, created_at
          ) VALUES (
              TG_TABLE_NAME, TG_OP, auth.uid(),
              COALESCE((NEW).id, (OLD).id),
              CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) END,
              CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END,
              NOW()
          );
          RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;`
    },
    {
      description: 'Enable RLS on core tables',
      sql: `ALTER TABLE ria_profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
      ALTER TABLE control_persons ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ria_private_funds ENABLE ROW LEVEL SECURITY;`
    },
    {
      description: 'Create anon policy for ria_profiles',
      sql: `CREATE POLICY "anon_read_rias" ON ria_profiles
        FOR SELECT TO anon USING (true);`
    },
    {
      description: 'Create auth policy for ria_profiles',
      sql: `CREATE POLICY "auth_read_rias" ON ria_profiles
        FOR SELECT TO authenticated USING (true);`
    },
    {
      description: 'Create service role policy for ria_profiles',
      sql: `CREATE POLICY "service_full_access_ria_profiles" ON ria_profiles
        FOR ALL TO service_role USING (true) WITH CHECK (true);`
    }
  ]
  
  console.log('📝 SQL Statements to Execute via Supabase SQL Editor:\n')
  console.log('=' .repeat(80))
  
  for (let i = 0; i < sqlStatements.length; i++) {
    const stmt = sqlStatements[i]
    console.log(`\n-- ${i + 1}. ${stmt.description}`)
    console.log(stmt.sql)
    console.log('')
  }
  
  console.log('=' .repeat(80))
  console.log('\n⚠️  IMPORTANT: Copy and paste the above SQL into Supabase SQL Editor')
  console.log('   URL: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql')
  console.log('')
  
  // Test current state
  console.log('🧪 Testing current database state...\n')
  
  // Test table access
  const testTables = ['ria_profiles', 'narratives', 'control_persons', 'ria_private_funds']
  
  for (const tableName of testTables) {
    try {
      const { data, error, count } = await supabase
        .from(tableName)
        .select('id', { count: 'exact' })
        .limit(1)
      
      if (error) {
        console.log(`❌ ${tableName}: ${error.message}`)
      } else {
        console.log(`✅ ${tableName}: accessible, ~${count} total records`)
      }
    } catch (err) {
      console.log(`❌ ${tableName}: ${err.message}`)
    }
  }
  
  // Test new audit tables
  console.log('\n🔍 Testing audit infrastructure...')
  const auditTables = ['audit_logs', 'migration_log', 'etl_dead_letter', 'search_errors']
  
  for (const tableName of auditTables) {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`❌ ${tableName}: ${error.message} (needs to be created)`)
      } else {
        console.log(`✅ ${tableName}: exists with ${count || 0} records`)
      }
    } catch (err) {
      console.log(`❌ ${tableName}: needs to be created`)
    }
  }
}

// Run the script
applyCoreRLS()
  .then(() => {
    console.log('\n✅ Core RLS planning complete')
    console.log('📋 Next steps:')
    console.log('   1. Execute the SQL statements above in Supabase SQL Editor')
    console.log('   2. Run the RLS status check script to verify')
    console.log('   3. Continue with Phase 2 ETL pipeline')
  })
  .catch(error => {
    console.error('❌ Error:', error)
  })
