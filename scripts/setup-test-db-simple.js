#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.test' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables in .env.test');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupTestDatabase() {
  console.log('🗄️  Setting up test database...');
  console.log('=====================================');
  
  try {
    // 1. Create test user profile
    console.log('👤 Creating test user profile...');
    const testUserId = '550e8400-e29b-41d4-a716-446655440000';
    
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: testUserId,
        email: 'test@example.com'
      });
    
    if (profileError) {
      console.warn(`⚠️  Profile creation warning: ${profileError.message}`);
    } else {
      console.log('✅ Test user profile created');
    }
    
    // 2. Insert some test events
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
    
    const { error: eventsError } = await supabase
      .from('events')
      .insert(testEvents);
    
    if (eventsError) {
      console.warn(`⚠️  Events insertion warning: ${eventsError.message}`);
    } else {
      console.log('✅ Test events inserted');
    }
    
    // 3. Create some test page profiles
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
      },
      {
        user_id: testUserId,
        url_pattern: 'https://github.com/user/repo/issues/123',
        visit_count: 3,
        dom_structure: {
          titleSelector: '.js-issue-title',
          contentSelector: '.comment-body',
          metadataSelector: null
        },
        content_signals: {
          hasForms: true,
          hasCode: true,
          hasTables: false,
          hasImages: false,
          wordCount: 200
        },
        extraction_rules: [
          {
            type: 'title',
            selector: '.js-issue-title',
            extract: 'text',
            priority: 1
          },
          {
            type: 'content',
            selector: '.comment-body',
            extract: 'text',
            priority: 2
          }
        ]
      }
    ];
    
    const { error: profilesError } = await supabase
      .from('page_profiles')
      .insert(testProfiles);
    
    if (profilesError) {
      console.warn(`⚠️  Page profiles insertion warning: ${profilesError.message}`);
    } else {
      console.log('✅ Test page profiles created');
    }
    
    // 4. Verify setup
    console.log('🔍 Verifying database setup...');
    
    const { data: events, error: eventsCheck } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', testUserId);
    
    if (eventsCheck) {
      console.warn(`⚠️  Events check warning: ${eventsCheck.message}`);
    } else {
      console.log(`✅ Found ${events?.length || 0} test events`);
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
    console.log('🎉 Test database setup complete!');
    console.log('=====================================');
    console.log('✅ Test user profile created');
    console.log('✅ Test events inserted');
    console.log('✅ Test page profiles created');
    console.log('');
    console.log('🚀 Ready to run tests:');
    console.log('   npx jest tests/database/ --verbose');
    console.log('   npx jest tests/extension/ --verbose');
    console.log('   npx jest tests/api/ --verbose');
    console.log('   npx jest tests/e2e/ --verbose');
    
  } catch (error) {
    console.error('❌ Error setting up test database:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupTestDatabase();
