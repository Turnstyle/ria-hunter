// Script to check narrative generation status
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNarrativeGeneration() {
  try {
    console.log('Checking narrative generation status...');
    
    // Get total count of RIA profiles
    const { count: totalProfiles, error: profileError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    if (profileError) {
      console.error('Error counting profiles:', profileError);
      return;
    }
    
    // Get total count of narratives
    const { count: totalNarratives, error: narrativeError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
      
    if (narrativeError) {
      console.error('Error counting narratives:', narrativeError);
      return;
    }
    
    const missingNarratives = totalProfiles - totalNarratives;
    const completionPercentage = (totalNarratives / totalProfiles * 100).toFixed(2);
    
    console.log(`\nNarrative generation progress:`);
    console.log(`- Total RIA profiles: ${totalProfiles}`);
    console.log(`- Total narratives generated: ${totalNarratives}`);
    console.log(`- Missing narratives: ${missingNarratives}`);
    console.log(`- Completion percentage: ${completionPercentage}%`);
    
    // Check for narratives without embeddings
    const { count: missingEmbeddings, error: embeddingError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);
      
    if (embeddingError) {
      console.error('Error counting missing embeddings:', embeddingError);
    } else {
      console.log(`- Narratives without embeddings: ${missingEmbeddings}`);
    }
    
    // Check embedding format
    const { data: embeddingSample, error: sampleError } = await supabase
      .from('narratives')
      .select('embedding')
      .not('embedding', 'is', null)
      .limit(1);
      
    if (sampleError) {
      console.error('Error fetching embedding sample:', sampleError);
    } else if (embeddingSample && embeddingSample.length > 0) {
      const embeddingType = typeof embeddingSample[0].embedding;
      console.log(`\nEmbedding format:`);
      console.log(`- Type: ${embeddingType}`);
      
      if (embeddingType === 'string') {
        try {
          const parsed = JSON.parse(embeddingSample[0].embedding);
          console.log(`- Parsed to array: ${Array.isArray(parsed)}`);
          console.log(`- Dimensions: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
        } catch (e) {
          console.log(`- Not valid JSON: ${embeddingSample[0].embedding.substring(0, 50)}...`);
        }
      }
    }
    
    // Check narrative creation dates
    const { data: dateStats, error: dateError } = await supabase
      .from('narratives')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);
      
    const { data: lastNarrative, error: lastError } = await supabase
      .from('narratives')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (dateError || lastError) {
      console.error('Error fetching narrative dates:', dateError || lastError);
    } else if (dateStats && dateStats.length > 0 && lastNarrative && lastNarrative.length > 0) {
      console.log(`\nNarrative creation dates:`);
      console.log(`- First narrative created: ${new Date(dateStats[0].created_at).toLocaleString()}`);
      console.log(`- Last narrative created: ${new Date(lastNarrative[0].created_at).toLocaleString()}`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkNarrativeGeneration();
