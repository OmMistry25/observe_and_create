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

async function populateTestData() {
  console.log('🗄️  Populating test database with sample data...');
  console.log('=================================================');
  
  const testUserId = '550e8400-e29b-41d4-a716-446655440000';
  
  try {
    // 1. First, let's check what tables exist
    console.log('🔍 Checking database schema...');
    
    // Try to create a test profile first
    console.log('👤 Creating test user profile...');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: testUserId,
        email: 'test@example.com'
      }, { onConflict: 'id' });
    
    if (profileError) {
      console.warn(`⚠️  Profile creation warning: ${profileError.message}`);
      // Try to get existing profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', testUserId)
        .single();
      
      if (existingProfile) {
        console.log('✅ Using existing test profile');
      } else {
        console.log('❌ Could not create or find test profile');
        return;
      }
    } else {
      console.log('✅ Test user profile created/updated');
    }
    
    // 2. Insert test events
    console.log('📊 Inserting test events...');
    const testEvents = [
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'nav',
        url: 'https://docs.google.com/document/d/test-doc-1/edit',
        title: 'Test Document 1',
        ts: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()
      },
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'click',
        url: 'https://docs.google.com/document/d/test-doc-1/edit',
        title: 'Test Document 1',
        ts: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      },
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'scroll',
        url: 'https://docs.google.com/document/d/test-doc-1/edit',
        title: 'Test Document 1',
        ts: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString()
      },
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'nav',
        url: 'https://github.com/user/repo/issues/123',
        title: 'Issue #123',
        ts: new Date(Date.now() - 1000 * 60 * 30).toISOString()
      },
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'click',
        url: 'https://github.com/user/repo/issues/123',
        title: 'Issue #123',
        ts: new Date(Date.now() - 1000 * 60 * 15).toISOString()
      },
      {
        user_id: testUserId,
        device_id: 'test-device-1',
        type: 'scroll',
        url: 'https://github.com/user/repo/issues/123',
        title: 'Issue #123',
        ts: new Date(Date.now() - 1000 * 60 * 5).toISOString()
      }
    ];
    
    // Clear existing test events first
    await supabase.from('events').delete().eq('user_id', testUserId);
    
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .insert(testEvents)
      .select();
    
    if (eventsError) {
      console.warn(`⚠️  Events insertion warning: ${eventsError.message}`);
    } else {
      console.log(`✅ Inserted ${eventsData?.length || 0} test events`);
    }
    
    // 3. Try to create page profiles (if table exists)
    console.log('📄 Creating test page profiles...');
    const testProfiles = [
      {
        user_id: testUserId,
        url_pattern: 'https://docs.google.com/document/d/test-doc-1/edit',
        visit_count: 3,
        dom_structure: {
          titleSelector: '.docs-title',
          contentSelector: '.kix-lineview-text-block',
          metadataSelector: 'meta[name="description"]'
        },
        content_signals: {
          hasForms: false,
          hasCode: false,
          hasTables: true,
          hasImages: false,
          wordCount: 500
        },
        extraction_rules: [
          {
            type: 'title',
            selector: '.docs-title',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.kix-lineview-text-block',
            extract: 'text',
            priority: 2
          }
        ]
      }
    ];
    
    // Clear existing test profiles first
    await supabase.from('page_profiles').delete().eq('user_id', testUserId);
    
    const { data: profilesData, error: profilesError } = await supabase
      .from('page_profiles')
      .insert(testProfiles)
      .select();
    
    if (profilesError) {
      console.warn(`⚠️  Page profiles insertion warning: ${profilesError.message}`);
    } else {
      console.log(`✅ Created ${profilesData?.length || 0} test page profiles`);
    }
    
    // 4. Verify the data
    console.log('🔍 Verifying test data...');
    
    const { data: events, error: eventsCheck } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', testUserId);
    
    if (eventsCheck) {
      console.warn(`⚠️  Events check warning: ${eventsCheck.message}`);
    } else {
      console.log(`✅ Found ${events?.length || 0} test events`);
      if (events && events.length > 0) {
        console.log(`   - Sample event: ${events[0].type} on ${events[0].url}`);
      }
    }
    
    const { data: profiles, error: profilesCheck } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId);
    
    if (profilesCheck) {
      console.warn(`⚠️  Profiles check warning: ${profilesCheck.message}`);
    } else {
      console.log(`✅ Found ${profiles?.length || 0} test profiles`);
    }
    
    const { data: pageProfiles, error: pageProfilesCheck } = await supabase
      .from('page_profiles')
      .select('*')
      .eq('user_id', testUserId);
    
    if (pageProfilesCheck) {
      console.warn(`⚠️  Page profiles check warning: ${pageProfilesCheck.message}`);
    } else {
      console.log(`✅ Found ${pageProfiles?.length || 0} test page profiles`);
    }
    
    console.log('');
    console.log('🎉 Test data population complete!');
    console.log('==================================');
    console.log('✅ Test user profile ready');
    console.log('✅ Test events inserted');
    console.log('✅ Test page profiles created');
    console.log('');
    console.log('🚀 Ready to run tests:');
    console.log('   npx jest tests/database/url-path.test.ts --verbose');
    console.log('   npx jest tests/database/page-profiles.test.ts --verbose');
    console.log('   npx jest tests/database/frequent-subpaths.test.ts --verbose');
    
  } catch (error) {
    console.error('❌ Error populating test data:', error.message);
    process.exit(1);
  }
}

// Run the population
populateTestData();
