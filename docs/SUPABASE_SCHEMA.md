# Supabase Database Schema

**Last Updated:** 2026-06-30
**Purpose:** Complete database schema for Taipei Kitchen Supabase migration

---

## Overview

This schema maps the current Google Sheets data model to a normalized PostgreSQL database. It captures ALL data collected by forms, including 20+ fields currently NOT persisted to Sheets.

**Key Improvements over Sheets:**
- Normalized data (no repeated store/driver/dish names)
- Full HACCP compliance data retention
- Relational integrity with foreign keys
- Efficient querying with proper indexes
- Row-level security for multi-tenant scenarios

---

## Schema Diagram

```
stores ──┐
         ├──> deliveries ──┬──> delivery_items
drivers ─┘                 ├──> transit_temps
                           ├──> violations ───> corrective_actions
                           └──> photos

dishes ───────────────────────> delivery_items

config (standalone)
execution_log (audit trail)
```

---

## Table Definitions

### 1. `stores` - Store Master Data

```sql
CREATE TABLE stores (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT UNIQUE NOT NULL,  -- e.g., "6331", "6112"
  name TEXT NOT NULL,              -- e.g., "Taipei Kitchen Store 6331"
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stores_store_id ON stores(store_id);
CREATE INDEX idx_stores_active ON stores(active);

-- Current stores (from research):
-- 6331, 6112, plus others to be added
```

---

### 2. `drivers` - Driver Master Data

```sql
CREATE TABLE drivers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,  -- e.g., "Owen", "Brandon", "Dylan"
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drivers_name ON drivers(name);
CREATE INDEX idx_drivers_active ON drivers(active);

-- Current drivers (from research):
-- Owen, Brandon, Dylan, Romano, plus others
```

---

### 3. `dishes` - Dish Master Data

```sql
CREATE TABLE dishes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,  -- e.g., "Orange Chicken", "Beef & Broccoli"
  sku TEXT,
  category TEXT,              -- e.g., "Entree", "Side", "Appetizer"
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dishes_name ON dishes(name);
CREATE INDEX idx_dishes_active ON dishes(active);

-- Current dishes (13 by default):
-- Orange Chicken, Honey Walnut Shrimp, Mushroom Chicken, Beijing Beef,
-- Kung Pao Chicken, Black Pepper Angus Steak, Honey Sesame Chicken,
-- String Bean Chicken, Broccoli Beef, Sweet Fire Chicken, Beef & Broccoli,
-- Super Greens, Chow Mein
```

---

### 4. `deliveries` - Main Delivery Log

**Maps to:** Google Sheets "Delivery Log - Live" (currently 18 columns)

**NEW:** Captures 20+ additional fields currently discarded by form

```sql
CREATE TABLE deliveries (
  id BIGSERIAL PRIMARY KEY,

  -- Metadata
  submitted_at TIMESTAMPTZ NOT NULL,
  client_timestamp TIMESTAMPTZ,
  form_load_time TIMESTAMPTZ,
  timezone TEXT,
  timezone_offset INTEGER,

  -- Core delivery info
  date DATE NOT NULL,
  store_id BIGINT REFERENCES stores(id) ON DELETE RESTRICT,
  driver_id BIGINT REFERENCES drivers(id) ON DELETE RESTRICT,
  arrival_time TIME,
  received_by TEXT,

  -- Temperature readings
  arrival_product_temp DECIMAL(5,2),  -- Arrival Product Temp °F
  cooler_temp DECIMAL(5,2),            -- Store Cooler Temp °F
  cooler_condition TEXT,               -- Good/Fair/Poor/Not Checked

  -- Stocking info
  case_prefill_percent TEXT,  -- 0-25%, 25-50%, 50-75%, 75-100%

  -- Notes
  notes TEXT,

  -- Photo links (Google Drive URLs)
  before_photo_link TEXT,
  after_photo_link TEXT,

  -- Indexes for common queries
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_deliveries_date ON deliveries(date DESC);
CREATE INDEX idx_deliveries_store ON deliveries(store_id);
CREATE INDEX idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX idx_deliveries_submitted_at ON deliveries(submitted_at DESC);
CREATE INDEX idx_deliveries_cooler_temp ON deliveries(cooler_temp) WHERE cooler_temp > 41.0;

-- Comments
COMMENT ON COLUMN deliveries.arrival_product_temp IS 'Temperature of delivered product in Fahrenheit';
COMMENT ON COLUMN deliveries.cooler_temp IS 'Store cooler temperature in Fahrenheit (HACCP critical control point)';
COMMENT ON TABLE deliveries IS 'Main delivery log - one row per delivery visit';
```

---

### 5. `delivery_items` - Per-Dish Inventory

**Maps to:** Current sheet has one row per dish per delivery (flattened)

**NEW:** Normalized into separate table

```sql
CREATE TABLE delivery_items (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  dish_id BIGINT NOT NULL REFERENCES dishes(id) ON DELETE RESTRICT,

  -- Inventory counts
  qty_before INTEGER NOT NULL,        -- On shelf before restocking
  qty_added INTEGER NOT NULL,         -- Qty added to shelf
  qty_removed INTEGER NOT NULL,       -- Qty removed (expired/damaged)
  qty_after INTEGER NOT NULL,         -- Shelf total after (calculated)

  -- Removal reason
  removal_reason TEXT,                -- Out of date/Damaged/Quality issue/Other
  removal_reason_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX idx_delivery_items_dish ON delivery_items(dish_id);
CREATE INDEX idx_delivery_items_removed ON delivery_items(qty_removed) WHERE qty_removed > 0;

-- Constraint: qty_after should equal qty_before + qty_added - qty_removed
ALTER TABLE delivery_items ADD CONSTRAINT check_inventory_math
  CHECK (qty_after = qty_before + qty_added - qty_removed);

COMMENT ON TABLE delivery_items IS 'Per-dish inventory entries for each delivery';
```

---

### 6. `transit_temps` - Transit Temperature Log

**Maps to:** Form fields currently NOT persisted to Sheets (T-XXX feature)

**Critical:** HACCP compliance requires temperature monitoring during transit

```sql
CREATE TABLE transit_temps (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,

  -- Departure reading
  departure_temp DECIMAL(5,2),
  departure_time TIME,
  departure_location TEXT,  -- Legacy Park/Store 6112/Other

  -- Mid-route check 1
  check1_temp DECIMAL(5,2),
  check1_time TIME,
  check1_location TEXT,

  -- Mid-route check 2
  check2_temp DECIMAL(5,2),
  check2_time TIME,
  check2_location TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transit_temps_delivery ON transit_temps(delivery_id);
CREATE INDEX idx_transit_temps_violations ON transit_temps(departure_temp)
  WHERE departure_temp > 41.0 OR check1_temp > 41.0 OR check2_temp > 41.0;

COMMENT ON TABLE transit_temps IS 'Transit temperature checks (departure + up to 2 mid-route checks)';
COMMENT ON COLUMN transit_temps.departure_temp IS 'Product temperature at departure in Fahrenheit';
```

---

### 7. `violations` - HACCP Violations Tracker

**Maps to:** Google Sheets "Violations Tracker" + form data NOT persisted

```sql
CREATE TABLE violations (
  id BIGSERIAL PRIMARY KEY,
  violation_id TEXT UNIQUE NOT NULL,  -- e.g., "VIO-20260618-001"
  delivery_id BIGINT REFERENCES deliveries(id) ON DELETE SET NULL,

  -- Violation details
  violation_type TEXT NOT NULL,       -- temp_cooler, temp_arrival, temp_transit, etc.
  which_check TEXT,                   -- Departure/Check1/Check2/Arrival
  exceeded_temp DECIMAL(5,2),
  exceeded_time TIME,
  threshold DECIMAL(5,2) DEFAULT 41.0,

  -- Time above safe temperature
  time_above_safe_temp_minutes INTEGER,  -- Auto-calculated

  -- Location/context
  store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL,
  driver_id BIGINT REFERENCES drivers(id) ON DELETE SET NULL,

  -- Incident notes
  incident_notes TEXT,

  -- Status tracking
  status TEXT DEFAULT 'open',        -- open, in_progress, resolved
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,

  -- Alert tracking
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  alert_recipients TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_violations_delivery ON violations(delivery_id);
CREATE INDEX idx_violations_status ON violations(status) WHERE status != 'resolved';
CREATE INDEX idx_violations_date ON violations(created_at DESC);
CREATE INDEX idx_violations_store ON violations(store_id);

COMMENT ON TABLE violations IS 'HACCP temperature violations log';
COMMENT ON COLUMN violations.time_above_safe_temp_minutes IS 'Critical: FDA allows max 2 hours (120 minutes) above 41°F';
```

---

### 8. `corrective_actions` - Violation Corrective Actions

**Maps to:** Form fields currently NOT persisted to Sheets

```sql
CREATE TABLE corrective_actions (
  id BIGSERIAL PRIMARY KEY,
  violation_id BIGINT NOT NULL REFERENCES violations(id) ON DELETE CASCADE,

  -- Action taken
  action_type TEXT NOT NULL,  -- cooler, discard, continued, supervisor
  action_time TIME NOT NULL,

  -- Recovery details (if action_type = 'cooler')
  recovery_location TEXT,      -- Store Cooler/Store Freezer/Vehicle Cooler/Other
  recovered_time TIME,
  recovered_temp DECIMAL(5,2),
  recovery_successful BOOLEAN,

  -- Discard details (if action_type = 'discard')
  discard_time TIME,
  discard_qty INTEGER,
  discard_items TEXT,           -- List of discarded products
  discard_reason TEXT,          -- FDA-compliant reason

  -- Supervisor notification
  supervisor_notified TEXT,     -- Yes-phone/Yes-text/Yes-person/Not yet/No
  supervisor_name TEXT,
  supervisor_notify_time TIME,

  -- Notes
  action_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_corrective_actions_violation ON corrective_actions(violation_id);
CREATE INDEX idx_corrective_actions_type ON corrective_actions(action_type);

-- Constraint: recovered_temp must be <= 41°F if recovery_successful = true
ALTER TABLE corrective_actions ADD CONSTRAINT check_recovery_temp
  CHECK (
    recovery_successful = false OR
    recovered_temp IS NULL OR
    recovered_temp <= 41.0
  );

COMMENT ON TABLE corrective_actions IS 'Corrective actions taken in response to HACCP violations';
```

---

### 9. `photos` - Photo Metadata

**Maps to:** Google Drive photo links in sheet + form metadata

```sql
CREATE TABLE photos (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,

  -- Photo type
  photo_type TEXT NOT NULL,     -- before, after

  -- Google Drive info
  drive_file_id TEXT,
  drive_link TEXT,

  -- Upload metadata
  original_filename TEXT,
  original_size_bytes INTEGER,
  compressed_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',

  -- Timestamps
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_photos_delivery ON photos(delivery_id);
CREATE INDEX idx_photos_type ON photos(photo_type);
CREATE INDEX idx_photos_uploaded ON photos(uploaded_at DESC);

COMMENT ON TABLE photos IS 'Photo upload metadata and Google Drive links';
```

---

### 10. `config` - System Configuration

**Maps to:** Google Sheets "Config" sheet

```sql
CREATE TABLE config (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  data_type TEXT DEFAULT 'string',  -- string, number, boolean, json
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Indexes
CREATE INDEX idx_config_key ON config(key);

-- Seed configuration
INSERT INTO config (key, value, description, data_type) VALUES
  ('violation_alert_emails', 'email1@example.com,email2@example.com', 'Comma-separated list of email recipients for HACCP violation alerts', 'string'),
  ('enable_violation_alerts', 'true', 'Enable/disable HACCP violation email alerts', 'boolean'),
  ('temp_threshold', '41.0', 'Temperature threshold in Fahrenheit for HACCP violations', 'number'),
  ('time_threshold_minutes', '120', 'Maximum time above safe temperature (FDA: 2 hours)', 'number'),
  ('migration_mode', 'dual_write', 'Migration mode: dual_write, read_from_supabase, cutover', 'string'),
  ('enable_sheets_fallback', 'true', 'Enable fallback to Google Sheets on Supabase errors', 'boolean');

COMMENT ON TABLE config IS 'System configuration key-value store';
```

---

### 11. `execution_log` - Audit Trail

**Maps to:** Google Sheets "Execution Log" sheet

```sql
CREATE TABLE execution_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Request info
  form_type TEXT,               -- delivery, photos_only, temperature, etc.
  action TEXT,                  -- doPost, queryDeliveries, etc.

  -- Result
  status TEXT NOT NULL,         -- success, error
  error_message TEXT,
  error_stack TEXT,

  -- Performance
  duration_ms INTEGER,

  -- Context
  row_count INTEGER,
  photo_size_kb INTEGER,
  user_agent TEXT,
  ip_address TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (for log analysis)
CREATE INDEX idx_execution_log_timestamp ON execution_log(timestamp DESC);
CREATE INDEX idx_execution_log_status ON execution_log(status) WHERE status = 'error';
CREATE INDEX idx_execution_log_form_type ON execution_log(form_type);

-- Partition by month (optional, for high-volume production)
-- CREATE TABLE execution_log_2026_07 PARTITION OF execution_log
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

COMMENT ON TABLE execution_log IS 'Audit trail of all form submissions and API calls';
```

---

## Data Migration Strategy

### Phase 1: Historical Data Import

**One-time bulk import from Google Sheets to Supabase:**

1. Export "Delivery Log - Live" sheet to CSV
2. Parse and normalize data:
   - Extract unique stores → `stores` table
   - Extract unique drivers → `drivers` table
   - Extract unique dishes → `dishes` table
3. Import deliveries with foreign key references
4. Split delivery items into `delivery_items` table
5. Migrate violation tracker data
6. Migrate alert log data
7. Migrate config data
8. Migrate execution log

**Script:** `scripts/migrate-sheets-to-supabase.js` (to be created)

### Phase 2: Dual-Write Period

Forms write to BOTH systems simultaneously:

```javascript
async function submitDelivery(payload) {
  const sheetsResult = await writeToSheets(payload);
  const supabaseResult = await writeToSupabase(payload);

  // Log discrepancies
  if (sheetsResult.status === 'ok' && supabaseResult.status === 'error') {
    console.error('Supabase write failed, Sheets succeeded');
  }

  return sheetsResult;  // Continue using Sheets as source of truth
}
```

### Phase 3: Validation

Daily reconciliation script compares row counts and data integrity:

```sql
-- Compare delivery counts
SELECT COUNT(*) FROM deliveries WHERE date = '2026-06-30';
-- vs Google Sheets query
```

### Phase 4: Cutover

Switch to Supabase as primary, Sheets as read-only backup.

---

## Indexes Summary

**Critical indexes for performance:**

1. `deliveries.date` (DESC) - Most common query filter
2. `deliveries.store_id` - Frequent filter
3. `deliveries.cooler_temp` - HACCP violation detection
4. `delivery_items.delivery_id` - Join performance
5. `violations.status` - Open violations dashboard
6. `execution_log.timestamp` (DESC) - Recent logs

**Total estimated index overhead:** ~15% of table size (acceptable)

---

## Row-Level Security (RLS) Policies

**Initial setup (development):**

```sql
-- Allow service_role full access
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role bypass" ON deliveries FOR ALL TO service_role USING (true);

-- Repeat for all tables
```

**Production policies (multi-tenant future):**

```sql
-- Example: Users can only see their store's deliveries
CREATE POLICY "Users see own store" ON deliveries
  FOR SELECT
  TO authenticated
  USING (store_id IN (
    SELECT store_id FROM user_stores WHERE user_id = auth.uid()
  ));
```

---

## Storage Estimates

**Assumptions:**
- 100 deliveries/day
- 13 dishes per delivery (avg)
- 365 days/year

**Table Size Estimates (Year 1):**

| Table | Rows/Year | Est. Size |
|-------|-----------|-----------|
| deliveries | 36,500 | 15 MB |
| delivery_items | 474,500 | 100 MB |
| transit_temps | 36,500 | 8 MB |
| violations | 3,650 | 3 MB |
| corrective_actions | 3,650 | 2 MB |
| photos | 73,000 | 5 MB |
| stores | 50 | <1 MB |
| drivers | 20 | <1 MB |
| dishes | 50 | <1 MB |
| config | 20 | <1 MB |
| execution_log | 100,000 | 25 MB |
| **TOTAL** | | **~160 MB/year** |

**With indexes:** ~185 MB/year

**Free tier (500 MB)** sufficient for 2+ years.

---

## Comparison: Sheets vs Supabase

| Feature | Google Sheets | Supabase |
|---------|---------------|----------|
| **Data Structure** | Flat (one row per dish) | Normalized (relational) |
| **Query Performance** | Slow (full scan) | Fast (indexed) |
| **Data Integrity** | Manual | Enforced (foreign keys, constraints) |
| **HACCP Data Capture** | Partial (18 fields) | Complete (38+ fields) |
| **Concurrent Writes** | Limited | Excellent |
| **API** | Apps Script only | REST, GraphQL, realtime subscriptions |
| **Cost** | Free | Free tier → $25/mo Pro |
| **Scalability** | 10M cells limit | Scales to TB+ |
| **Backups** | Manual | Automated (Pro plan) |

---

## Schema Validation Queries

**After applying schema, verify with:**

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check foreign key relationships
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';

-- Check indexes
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

## Next Steps

1. ✅ Review this schema
2. ✅ Apply to Supabase project via SQL Editor
3. ⏳ Create seed data for stores, drivers, dishes
4. ⏳ Test inserts with sample delivery data
5. ⏳ Build data migration script
6. ⏳ Implement dual-write in form handlers
7. ⏳ Create reconciliation script

---

## Questions?

Contact: leandertoney@gmail.com (project owner)
