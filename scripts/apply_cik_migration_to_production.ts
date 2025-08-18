#!/usr/bin/env npx tsx

// Apply CIK migration to production database
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Use the production database URL from env.local
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyCikMigration() {
  console.log('🚀 Applying CIK migration to production database...\n');

  try {
    // Check if CIK column already exists
    const { data: columns, error: colError } = await supabase.rpc('exec', {
      sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ria_profiles' AND column_name = 'cik';`
    });

    if (colError) {
      console.error('Error checking columns:', colError);
      return;
    }

    if (columns && columns.length > 0) {
      console.log('✅ CIK column already exists!');
      return;
    }

    console.log('Adding CIK column...');
    
    // Add the cik column as TEXT (since CIK can have leading zeros)
    const { error: addColError } = await supabase.rpc('exec', {
      sql: `ALTER TABLE public.ria_profiles ADD COLUMN IF NOT EXISTS cik TEXT;`
    });

    if (addColError) {
      console.error('Error adding CIK column:', addColError);
      return;
    }

    console.log('✅ CIK column added successfully');

    // Create an index for performance on CIK lookups
    console.log('Creating CIK index...');
    const { error: indexError } = await supabase.rpc('exec', {
      sql: `CREATE INDEX IF NOT EXISTS idx_ria_profiles_cik ON public.ria_profiles(cik);`
    });

    if (indexError) {
      console.error('Error creating CIK index:', indexError);
    } else {
      console.log('✅ CIK index created successfully');
    }

    // Add a unique constraint since CIK should be unique when present
    console.log('Creating unique constraint...');
    const { error: uniqueError } = await supabase.rpc('exec', {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS uniq_ria_profiles_cik ON public.ria_profiles(cik) WHERE cik IS NOT NULL;`
    });

    if (uniqueError) {
      console.error('Error creating unique constraint:', uniqueError);
    } else {
      console.log('✅ Unique constraint created successfully');
    }

    // Add documentation comment
    console.log('Adding column comment...');
    const { error: commentError } = await supabase.rpc('exec', {
      sql: `COMMENT ON COLUMN public.ria_profiles.cik IS 'SEC Central Index Key (CIK) number from EDGAR system, used in SEC filings and frontend URLs';`
    });

    if (commentError) {
      console.error('Error adding comment:', commentError);
    } else {
      console.log('✅ Column comment added successfully');
    }

    console.log('\n🎉 CIK migration completed successfully!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

applyCikMigration();
