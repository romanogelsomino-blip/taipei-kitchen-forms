# Supabase Setup Guide

**Last Updated:** 2026-06-30
**Purpose:** Provision Supabase project for Taipei Kitchen backend migration

---

## Overview

This guide covers the complete setup process for migrating Taipei Kitchen from Google Sheets to Supabase. The migration will be phased with dual-write validation before cutover.

**Timeline:** 10 minutes for initial setup, 3-6 months for full migration validation

---

## Prerequisites

- Supabase account (free tier sufficient for testing)
- Node.js 16+ installed
- Terminal access
- This project cloned locally

---

## Phase 1: Supabase Project Creation (5 minutes)

### 1.1 Create Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create account
3. Click "New Project"
4. Fill in details:
   - **Name:** `taipei-kitchen-production`
   - **Database Password:** Generate strong password (save in password manager)
   - **Region:** `West US (North California)` (closest to client)
   - **Pricing Plan:** Free (upgrade to Pro when ready for production load)
5. Click "Create new project"
6. Wait 2-3 minutes for provisioning

### 1.2 Get API Credentials

Once project is ready:

1. Navigate to Project Settings → API
2. Copy the following values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **Project API Key (anon, public)** - Safe for client-side use
   - **Project API Key (service_role, secret)** - Server-side only, never expose
3. Navigate to Project Settings → Database
4. Copy **Connection String (URI)**
5. Save all credentials securely

---

## Phase 2: Environment Configuration (2 minutes)

### 2.1 Create Environment File

Create `.env.supabase` in project root (gitignored):

```bash
# Supabase Configuration
# KEEP THIS FILE SECRET - DO NOT COMMIT TO GIT

SUPABASE_PROJECT_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres

# Migration Settings
MIGRATION_MODE=dual_write  # Options: dual_write, read_from_supabase, cutover
ENABLE_SHEETS_FALLBACK=true
```

### 2.2 Update .gitignore

Verify `.env.supabase` is gitignored:

```bash
# Should already be present in .gitignore
.env*
!.env.example
```

---

## Phase 3: Install Dependencies (1 minute)

```bash
npm install @supabase/supabase-js
```

This installs the official Supabase JavaScript client library.

---

## Phase 4: Initialize Database Schema (2 minutes)

See [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md) for complete schema definition.

**Apply schema via Supabase Dashboard:**

1. Go to SQL Editor in Supabase Dashboard
2. Copy schema from `SUPABASE_SCHEMA.md`
3. Paste into editor
4. Click "Run"
5. Verify all 11 tables created successfully

**Or apply via CLI:**

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-id

# Apply migrations (once created)
supabase db push
```

---

## Phase 5: Connection Testing

### 5.1 Create Test Script

Create `scripts/test-supabase-connection.js`:

```javascript
#!/usr/bin/env node
require('dotenv').config({ path: '.env.supabase' });
const { createClient } = require('@supabase/supabase-js');

async function testConnection() {
  const supabase = createClient(
    process.env.SUPABASE_PROJECT_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Testing Supabase connection...');

  try {
    // Test 1: Health check
    const { data, error } = await supabase
      .from('deliveries')
      .select('count')
      .limit(1);

    if (error) throw error;

    console.log('✅ Connection successful');
    console.log('✅ Database accessible');
    console.log('✅ Deliveries table exists');

    // Test 2: Insert test record
    const { data: insertData, error: insertError } = await supabase
      .from('deliveries')
      .insert([{
        date: new Date().toISOString(),
        driver: 'TEST',
        store_id: 9999,
        arrival_time: '12:00:00',
        cooler_temp: 38.0,
        submitted_at: new Date().toISOString()
      }])
      .select();

    if (insertError) throw insertError;

    console.log('✅ Write test successful');

    // Test 3: Delete test record
    const { error: deleteError } = await supabase
      .from('deliveries')
      .delete()
      .eq('store_id', 9999);

    if (deleteError) throw deleteError;

    console.log('✅ Delete test successful');
    console.log('\n🎉 All tests passed! Supabase is ready.');

  } catch (err) {
    console.error('❌ Connection test failed:', err.message);
    process.exit(1);
  }
}

testConnection();
```

### 5.2 Run Test

```bash
node scripts/test-supabase-connection.js
```

Expected output:
```
Testing Supabase connection...
✅ Connection successful
✅ Database accessible
✅ Deliveries table exists
✅ Write test successful
✅ Delete test successful

🎉 All tests passed! Supabase is ready.
```

---

## Phase 6: Row-Level Security (RLS) Setup

**Critical:** Enable RLS before exposing to production.

### 6.1 Enable RLS on All Tables

Go to Authentication → Policies in Supabase Dashboard, then for each table:

```sql
-- Enable RLS
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_temps ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_log ENABLE ROW LEVEL SECURITY;
```

### 6.2 Create Policies

**For now (development), allow service_role full access:**

```sql
-- Service role bypass (only for testing)
CREATE POLICY "Service role bypass" ON deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Repeat for all tables
```

**For production, implement proper auth:**

```sql
-- Example: Only authenticated users can read deliveries
CREATE POLICY "Authenticated users read deliveries" ON deliveries
  FOR SELECT
  TO authenticated
  USING (true);

-- Example: Only service role can write
CREATE POLICY "Service role write" ON deliveries
  FOR INSERT
  TO service_role
  WITH CHECK (true);
```

See [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security) for advanced patterns.

---

## Phase 7: Migration Strategy

### 7.1 Dual-Write Period (Months 1-3)

- Forms write to BOTH Google Sheets AND Supabase
- Read from Sheets (current behavior)
- Compare data integrity daily
- Fix any discrepancies
- Goal: 99.9% data consistency for 2 weeks

### 7.2 Dual-Read Period (Month 4)

- Forms write to both systems
- Dashboard reads from Supabase with Sheets fallback
- Monitor performance and errors
- Goal: Zero production incidents for 2 weeks

### 7.3 Cutover (Month 5-6)

- Disable Sheets writes (read-only archive)
- All reads from Supabase
- Keep Sheets as backup for 6 months
- Final historical data migration

---

## Phase 8: Monitoring & Alerts

### 8.1 Enable Supabase Monitoring

1. Navigate to Project Settings → Database
2. Enable "Pause project after 1 week of inactivity" = OFF
3. Set up email alerts for:
   - High database usage (>80%)
   - Failed connections
   - Long-running queries

### 8.2 Application-Level Monitoring

Add to `apps_script/Code.gs`:

```javascript
function logSupabaseHealth() {
  // Daily cron job to check Supabase health
  // Compare row counts between Sheets and Supabase
  // Alert if discrepancy > 1%
}
```

---

## Troubleshooting

### Connection Refused
- Check firewall settings
- Verify project is not paused (free tier pauses after 1 week inactivity)
- Confirm connection string is correct

### Authentication Errors
- Verify API keys are correct
- Check RLS policies allow your operation
- Use service_role key for admin operations

### Slow Queries
- Add indexes (see SUPABASE_SCHEMA.md)
- Enable query analysis: Dashboard → Database → Query Performance
- Consider upgrading to Pro plan for connection pooling

### Data Integrity Issues
- Run daily reconciliation script
- Check execution_log for failed writes
- Verify both systems received the data

---

## Security Checklist

- [ ] API keys stored in gitignored `.env.supabase` file
- [ ] Service role key NEVER exposed to client-side code
- [ ] RLS enabled on all tables
- [ ] RLS policies tested and verified
- [ ] Connection string uses SSL (sslmode=require)
- [ ] Database password is strong (16+ characters)
- [ ] Regular backups enabled (automatic on Pro plan)
- [ ] Team members use individual accounts (not shared credentials)

---

## Cost Estimates

**Free Tier:**
- 500 MB database storage
- 1 GB file storage
- 2 GB bandwidth
- Up to 50,000 monthly active users
- Sufficient for Phase 1-2 testing

**Pro Plan ($25/month):**
- 8 GB database storage
- 100 GB file storage
- 250 GB bandwidth
- Daily backups (7 days retention)
- Required for production launch

---

## Next Steps

1. ✅ Complete this setup guide
2. ✅ Review [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)
3. ✅ Create test records in Supabase
4. ⏳ Implement dual-write in form handlers
5. ⏳ Create data reconciliation script
6. ⏳ Build Supabase-backed admin dashboard
7. ⏳ Run 2-week validation period
8. ⏳ Plan cutover date

---

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row-Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Migration Best Practices](https://supabase.com/docs/guides/migrations)
- [Postgres Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)

---

## Questions?

Contact: leandertoney@gmail.com (project owner)
