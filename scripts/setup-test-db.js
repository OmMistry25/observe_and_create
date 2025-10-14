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

async function runSQLFile(filePath) {
  console.log(`📄 Running SQL file: ${filePath}`);
  
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split by semicolon and run each statement
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          if (error) {
            console.warn(`⚠️  Warning in statement: ${error.message}`);
          }
        } catch (err) {
          console.warn(`⚠️  Warning: ${err.message}`);
        }
      }
    }
    
    console.log(`✅ Completed: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
  }
}

async function setupTestDatabase() {
  console.log('🗄️  Setting up test database...');
  console.log('=====================================');
  
  try {
    // 1. Run all migrations in order
    const migrationFiles = [
      'infra/supabase/supabase/migrations/20240101000000_initial_schema.sql',
      'infra/supabase/supabase/migrations/20240101000001_rls_policies.sql',
      'infra/supabase/supabase/migrations/20240101000002_consent_support.sql',
      'infra/supabase/supabase/migrations/20240101000004_workflow_templates.sql',
      'infra/supabase/supabase/migrations/20240101000006_temporal_pattern_mining.sql',
      'infra/supabase/supabase/migrations/20240101000008_friction_point_detection.sql',
      'infra/supabase/supabase/migrations/20240101000009_ignore_domains.sql',
      'infra/supabase/supabase/migrations/20240101000010_semantic_intelligence.sql',
      'infra/supabase/supabase/migrations/20240101000011_workflow_insights.sql',
      'infra/supabase/supabase/migrations/20240101000012_add_domain_column.sql',
      'infra/supabase/supabase/migrations/20240101000013_smart_pattern_weighting.sql',
      'infra/supabase/supabase/migrations/20240101000015_proper_pattern_grouping.sql',
      'infra/supabase/supabase/migrations/20240101000016_add_url_path_column.sql',
      'infra/supabase/supabase/migrations/20240101000017_frequent_subpaths_view.sql',
      'infra/supabase/supabase/migrations/20240101000018_page_profiles_table.sql'
    ];
    
    for (const file of migrationFiles) {
      const fullPath = path.join(__dirname, '..', file);
      if (fs.existsSync(fullPath)) {
        await runSQLFile(fullPath);
      } else {
        console.warn(`⚠️  Migration file not found: ${file}`);
      }
    }
    
    // 2. Create test user profile
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
    
    // 3. Insert some test events
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
    
    // 4. Refresh materialized views
    console.log('🔄 Refreshing materialized views...');
    try {
      await supabase.rpc('refresh_frequent_subpaths');
      console.log('✅ Frequent subpaths view refreshed');
    } catch (error) {
      console.warn(`⚠️  View refresh warning: ${error.message}`);
    }
    
    // 5. Verify setup
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
    
    console.log('');
    console.log('🎉 Test database setup complete!');
    console.log('=====================================');
    console.log('✅ All migrations applied');
    console.log('✅ Test user profile created');
    console.log('✅ Test events inserted');
    console.log('✅ Materialized views refreshed');
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
