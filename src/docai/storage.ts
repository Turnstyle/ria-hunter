/**
 * Supabase Storage Handler
 * 
 * This module handles saving normalized RIA profile data to Supabase.
 */

import { supabase, RIAProfile } from '../../lib/supabaseClient';

/**
 * Upsert RIA profile data to Supabase
 * 
 * @param data - Normalized RIA profile data
 * @returns Promise resolving to the upserted record
 */
export async function upsertToSupabase(data: Partial<RIAProfile>): Promise<RIAProfile> {
  try {
    if (!data.firm_name || !data.crd_number) {
      throw new Error('Missing required fields for RIA profile: firm_name and crd_number are required');
    }
    
    console.log(`Upserting RIA profile for ${data.firm_name} (CRD: ${data.crd_number})`);
    
    // Add timestamps
    const now = new Date().toISOString();
    const dataWithTimestamps = {
      ...data,
      updated_at: now,
    };
    
    // Check if the profile already exists
    const { data: existingProfiles, error: fetchError } = await supabase
      .from('ria_profiles')
      .select('id, created_at')
      .eq('crd_number', data.crd_number)
      .limit(1);
    
    if (fetchError) {
      throw new Error(`Error checking for existing profile: ${fetchError.message}`);
    }
    
    let result;
    
    if (existingProfiles && existingProfiles.length > 0) {
      // Update existing profile
      const existingProfile = existingProfiles[0];
      console.log(`Updating existing profile with ID: ${existingProfile.id}`);
      
      const updateData = {
        ...dataWithTimestamps,
        created_at: existingProfile.created_at, // Preserve original created_at
      };
      
      const { data: updatedProfile, error: updateError } = await supabase
        .from('ria_profiles')
        .update(updateData)
        .eq('id', existingProfile.id)
        .select('*')
        .single();
      
      if (updateError) {
        throw new Error(`Error updating RIA profile: ${updateError.message}`);
      }
      
      result = updatedProfile;
    } else {
      // Insert new profile
      console.log('Creating new RIA profile');
      
      const insertData = {
        ...dataWithTimestamps,
        created_at: now, // New profile gets current timestamp
      };
      
      const { data: newProfile, error: insertError } = await supabase
        .from('ria_profiles')
        .insert(insertData)
        .select('*')
        .single();
      
      if (insertError) {
        throw new Error(`Error inserting RIA profile: ${insertError.message}`);
      }
      
      result = newProfile;
    }
    
    console.log(`Successfully upserted RIA profile with ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error('Error upserting to Supabase:', error);
    throw error;
  }
} 