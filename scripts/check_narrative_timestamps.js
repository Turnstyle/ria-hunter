// Script to check narrative creation timestamps
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNarrativeTimestamps() {
  try {
    console.log('Checking narrative creation timestamps...');
    
    // Get earliest and latest creation timestamps
    const { data: earliest, error: earliestError } = await supabase
      .from('narratives')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);
      
    if (earliestError) {
      console.error('Error fetching earliest timestamp:', earliestError);
      return;
    }
    
    const { data: latest, error: latestError } = await supabase
      .from('narratives')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (latestError) {
      console.error('Error fetching latest timestamp:', latestError);
      return;
    }
    
    if (earliest && earliest.length > 0 && latest && latest.length > 0) {
      const firstTimestamp = new Date(earliest[0].created_at);
      const lastTimestamp = new Date(latest[0].created_at);
      
      console.log(`\nFirst narrative created: ${firstTimestamp.toLocaleString()}`);
      console.log(`Last narrative created: ${lastTimestamp.toLocaleString()}`);
      
      // Calculate duration
      const durationMs = lastTimestamp.getTime() - firstTimestamp.getTime();
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationSeconds = Math.floor((durationMs % 60000) / 1000);
      
      console.log(`Total duration: ${durationMinutes} minutes, ${durationSeconds} seconds`);
      
      // Get total count of narratives
      const { count, error: countError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('Error counting narratives:', countError);
      } else {
        console.log(`Total narratives: ${count}`);
        
        // Calculate processing rate
        const ratePerMinute = count / (durationMs / 60000);
        console.log(`Processing rate: ${ratePerMinute.toFixed(2)} narratives per minute`);
      }
      
      // Get distribution by hour
      console.log('\nNarrative creation distribution by hour:');
      
      // Create an array of hour ranges
      const startHour = firstTimestamp.getHours();
      const endHour = lastTimestamp.getHours();
      
      // Sample some narratives to get a distribution
      const { data: sampleData, error: sampleError } = await supabase
        .from('narratives')
        .select('created_at')
        .limit(1000);
        
      if (sampleError) {
        console.error('Error fetching sample narratives:', sampleError);
      } else if (sampleData && sampleData.length > 0) {
        // Count narratives by hour
        const hourCounts = {};
        
        sampleData.forEach(n => {
          const hour = new Date(n.created_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        
        // Display hour distribution
        Object.keys(hourCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(hour => {
          console.log(`- Hour ${hour}: ${hourCounts[hour]} narratives`);
        });
      }
    } else {
      console.log('No narratives found');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkNarrativeTimestamps();
