#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.test' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables in .env.test');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('🔍 Checking test database structure...');
  console.log('=====================================');
  
  try {
    // Check if profiles table exists and has data
    console.log('👤 Checking profiles table...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(5);
    
    if (profilesError) {
      console.warn(`⚠️  Profiles table error: ${profilesError.message}`);
    } else {
      console.log(`✅ Found ${profiles?.length || 0} profiles`);
      if (profiles && profiles.length > 0) {
        console.log(`   - Sample profile: ${profiles[0].email} (${profiles[0].id})`);
      }
    }
    
    // Check if events table exists and has data
    console.log('📊 Checking events table...');
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .limit(5);
    
    if (eventsError) {
      console.warn(`⚠️  Events table error: ${eventsError.message}`);
    } else {
      console.log(`✅ Found ${events?.length || 0} events`);
      if (events && events.length > 0) {
        console.log(`   - Sample event: ${events[0].type} on ${events[0].url}`);
      }
    }
    
    // Check if page_profiles table exists
    console.log('📄 Checking page_profiles table...');
    const { data: pageProfiles, error: pageProfilesError } = await supabase
      .from('page_profiles')
      .select('*')
      .limit(5);
    
    if (pageProfilesError) {
      console.warn(`⚠️  Page profiles table error: ${pageProfilesError.message}`);
    } else {
      console.log(`✅ Found ${pageProfiles?.length || 0} page profiles`);
    }
    
    // Check if frequent_subpaths view exists
    console.log('🔄 Checking frequent_subpaths view...');
    const { data: frequentPaths, error: frequentPathsError } = await supabase
      .from('frequent_subpaths')
      .select('*')
      .limit(5);
    
    if (frequentPathsError) {
      console.warn(`⚠️  Frequent subpaths view error: ${frequentPathsError.message}`);
    } else {
      console.log(`✅ Found ${frequentPaths?.length || 0} frequent subpaths`);
    }
    
    // Check table structure
    console.log('🏗️  Checking table structure...');
    
    // Try to get column info for events table
    const { data: eventsColumns, error: eventsColumnsError } = await supabase
      .from('events')
      .select('*')
      .limit(1);
    
    if (eventsColumnsError) {
      console.warn(`⚠️  Events columns check error: ${eventsColumnsError.message}`);
    } else if (eventsColumns && eventsColumns.length > 0) {
      const columns = Object.keys(eventsColumns[0]);
      console.log(`✅ Events table columns: ${columns.join(', ')}`);
    }
    
    console.log('');
    console.log('📋 Database Status Summary:');
    console.log('============================');
    console.log(`Profiles: ${profiles?.length || 0} records`);
    console.log(`Events: ${events?.length || 0} records`);
    console.log(`Page Profiles: ${pageProfiles?.length || 0} records`);
    console.log(`Frequent Subpaths: ${frequentPaths?.length || 0} records`);
    
    if (profiles && profiles.length > 0) {
      console.log('');
      console.log('🎯 Ready for testing!');
      console.log('Use existing user ID for tests:', profiles[0].id);
    } else {
      console.log('');
      console.log('⚠️  No profiles found. You may need to:');
      console.log('1. Create a user account in your app');
      console.log('2. Or apply database migrations first');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    process.exit(1);
  }
}

// Run the check
checkDatabase();
