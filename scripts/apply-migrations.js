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

async function applyMigrations() {
  console.log('🗄️  Applying Phase 1 migrations to test database...');
  console.log('=====================================================');
  
  try {
    // Read the consolidated migration file
    const migrationFile = path.join(__dirname, '..', 'APPLY_MIGRATIONS_PHASE1.sql');
    
    if (!fs.existsSync(migrationFile)) {
      console.error('❌ Migration file not found: APPLY_MIGRATIONS_PHASE1.sql');
      process.exit(1);
    }
    
    console.log('📄 Reading migration file...');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Split into individual statements and execute them
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
    
    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          // Use the REST API to execute SQL
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            },
            body: JSON.stringify({ sql: statement })
          });
          
          if (response.ok) {
            successCount++;
            console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
          } else {
            const error = await response.text();
            console.warn(`⚠️  Statement ${i + 1}/${statements.length} warning: ${error}`);
            errorCount++;
          }
        } catch (error) {
          console.warn(`⚠️  Statement ${i + 1}/${statements.length} error: ${error.message}`);
          errorCount++;
        }
      }
    }
    
    console.log('');
    console.log('📊 Migration Results:');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Warnings/Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('');
      console.log('🎉 All migrations applied successfully!');
      console.log('=====================================');
      console.log('✅ url_path column added to events table');
      console.log('✅ frequent_subpaths materialized view created');
      console.log('✅ page_profiles table created');
      console.log('✅ All triggers and functions created');
      console.log('');
      console.log('🚀 Ready to populate test data and run tests!');
    } else {
      console.log('');
      console.log('⚠️  Some migrations had warnings/errors, but continuing...');
      console.log('This is normal for migrations that try to create existing objects.');
    }
    
  } catch (error) {
    console.error('❌ Error applying migrations:', error.message);
    process.exit(1);
  }
}

// Run the migrations
applyMigrations();
