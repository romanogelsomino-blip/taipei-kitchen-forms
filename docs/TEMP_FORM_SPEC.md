# Temperature Check Form Specification

**Last Updated:** 2026-06-30
**Purpose:** HACCP-compliant temperature logging for Taipei Kitchen stores

---

## Executive Summary

This document specifies a new standalone temperature logging form for Taipei Kitchen to meet HACCP (Hazard Analysis Critical Control Points) compliance requirements. The form will be used by store employees to log equipment temperatures throughout the day.

**Key Goals:**
- Enable multiple daily temperature checks (not just during deliveries)
- Provide real-time violation alerts
- Create audit trail for health inspections
- Integrate with existing violation tracking system

**Status:** Requirements gathering phase - see "Open Questions" section

---

## Background & Context

### Current State

**Existing Temperature Logging:**
- Delivery form captures 4 temperature readings:
  1. Arrival Product Temp (product temperature when driver arrives)
  2. Store Cooler Temp (checked during delivery)
  3. Transit temperatures (departure, check1, check2 during transport)
- Temperature checks ONLY happen during deliveries (typically once per day)
- No temperature logging between deliveries
- No dedicated equipment temperature monitoring

**Existing Violation System:**
- Triggers email alerts when temp > 41°F (configurable threshold)
- Logs violations to "Violations Tracker" and "Alert Log" sheets
- Sends alerts to configured email recipients
- Status tracking (open → in_progress → resolved)

### Compliance Gap

**FDA Food Code Requirements:**
- Refrigerated foods must be kept at ≤41°F
- Temperatures must be monitored "with sufficient frequency" to ensure compliance
- Temperature logs must be maintained for health inspections
- **Gap:** Once-per-day logging during deliveries is insufficient

### Solution

**New Temperature Check Form:**
- Standalone form accessible on any device
- Used by store employees (not just drivers)
- Logs equipment temperatures multiple times per day
- Integrates with existing violation alert system
- Creates complete audit trail for inspections

---

## Open Questions (FOR CLIENT)

**IMPORTANT:** These questions must be answered before implementation begins.

### 1. Equipment to Monitor

**Question:** Which equipment needs temperature logging?

**Options:**
- [ ] Walk-in cooler (existing - already logged during deliveries)
- [ ] Reach-in refrigerators
- [ ] Freezers
- [ ] Display cases
- [ ] Hot holding equipment
- [ ] Cold holding equipment
- [ ] Other: _______________

**Recommendation:** Start with walk-in cooler + reach-in refrigerators (most critical)

---

### 2. Logging Frequency

**Question:** How often should temperatures be logged?

**Options:**
- [ ] Every 4 hours (FDA recommended minimum)
- [ ] Every 2 hours (more frequent monitoring)
- [ ] Opening, mid-shift, closing (3x per day)
- [ ] Custom schedule per store
- [ ] On-demand (no required frequency)

**Recommendation:** Opening + closing (2x per day minimum), plus on-demand for spot checks

---

### 3. Who Logs Temperatures

**Question:** Who is responsible for temperature checks?

**Options:**
- [ ] Store manager only
- [ ] Any employee on shift
- [ ] Designated "food safety lead" per store
- [ ] Requires specific role/permission

**Recommendation:** Any employee (low friction), but require employee name for accountability

---

### 4. Temperature Thresholds

**Question:** What are the acceptable temperature ranges per equipment type?

**Current delivery form uses:**
- Cooler: ≤41°F (HACCP critical control point)
- No specific thresholds for other equipment

**FDA Guidelines:**
- Cold food: ≤41°F
- Frozen food: ≤0°F
- Hot food: ≥135°F

**Recommendation:** Use FDA guidelines as defaults, allow per-store customization

---

### 5. Violation Response

**Question:** What happens when a temperature violation is detected?

**Options:**
- [ ] Email alert only (existing behavior)
- [ ] Require immediate corrective action on form (like delivery form)
- [ ] Block form submission until supervisor notified
- [ ] Log violation but allow submission
- [ ] Different response for different severity levels

**Recommendation:**
- Minor violations (41-45°F): Email alert + log
- Major violations (>45°F): Require corrective action + supervisor notification

---

### 6. Photo Requirements

**Question:** Should photos be required or optional?

**Options:**
- [ ] Required for all checks (high friction, high documentation)
- [ ] Required only for violations
- [ ] Optional for all checks
- [ ] Not supported (temperature only)

**Recommendation:** Optional for all, required for violations >45°F

---

### 7. Data Storage

**Question:** Where should temperature check data be stored?

**Options:**
- [ ] New "Temperature Log" sheet tab (quick to implement)
- [ ] Supabase database (better for migration, requires setup)
- [ ] Both (dual-write during migration)

**Recommendation:** Start with Supabase to prove the pattern, add Sheets fallback later

---

## Functional Requirements

### FR-1: Store Selection
- User selects store from dropdown (same as delivery form)
- Store list pulled from master data (Config or Supabase `stores` table)
- Validate store ID is active

### FR-2: Equipment Type Selection
- User selects equipment type from dropdown
- Options: Walk-in Cooler, Reach-in Refrigerator, Freezer, Display Case, Other
- If "Other", require free-text description

### FR-3: Temperature Input
- Numeric input field (decimal, 1 decimal place)
- Unit: Fahrenheit (°F)
- Range validation: -20°F to 200°F (reasonable bounds)
- Real-time visual feedback:
  - Green: Within safe range
  - Yellow: Warning range (38-41°F for cold, 130-135°F for hot)
  - Red: Violation (>41°F for cold, <135°F for hot)

### FR-4: Employee Name
- Required text field
- Same employee who performed the check
- No dropdown (avoid maintaining employee list)
- Used for accountability and audit trail

### FR-5: Date & Time
- Auto-populated with current date and time
- Display in user's local timezone
- Store both client timestamp and server timestamp
- Prevent backdating (T-027 timestamp locking, if desired)

### FR-6: Notes (Optional)
- Free-text field
- For context: "Cooler door left open", "Recent restock", etc.
- Max length: 500 characters

### FR-7: Photo Upload (Optional)
- Single photo upload
- Same compression as delivery form (max 1600x1600, 85% quality)
- Upload to Google Drive with naming: `{storeId}_{date}_{equipmentType}_temp.jpg`
- Required if temperature violates threshold (>41°F)

### FR-8: Violation Detection
- Check temperature against threshold on form submit
- If violation detected:
  - Send email alert (reuse existing violation alert system)
  - Log to `violations` table (or "Violations Tracker" sheet)
  - Require photo if >45°F
  - Optionally require corrective action notes

### FR-9: Form Submission
- Write to Supabase `temperature_checks` table (or new sheet tab)
- Return success/error message to user
- On success: Clear form, show confirmation, allow immediate next check
- On error: Show error message, preserve form data for retry

### FR-10: Mobile Responsive
- Optimized for phone/tablet (most store employees use mobile)
- Large touch targets (44x44px minimum)
- Number input triggers numeric keyboard
- Works offline with submission queue (future enhancement)

---

## Non-Functional Requirements

### NFR-1: Performance
- Form loads in <2 seconds on 3G connection
- Photo compression completes in <5 seconds
- Form submission completes in <10 seconds

### NFR-2: Usability
- No training required (intuitive for non-technical users)
- Completion time <60 seconds (without violation)
- Accessible via URL (no app install required)

### NFR-3: Reliability
- 99.9% uptime (leverage Supabase/Google infrastructure)
- Data never lost (retry logic on failure)
- Graceful degradation if photo upload fails

### NFR-4: Security
- HTTPS only
- No authentication required (open form, like delivery form)
- Admin token required for backend writes (prevent abuse)

### NFR-5: Compliance
- HACCP audit trail requirements
- Timestamps locked (prevent tampering)
- All fields logged (no data loss)

---

## Data Schema

### Supabase Table: `temperature_checks`

```sql
CREATE TABLE temperature_checks (
  id BIGSERIAL PRIMARY KEY,

  -- Context
  store_id BIGINT REFERENCES stores(id) ON DELETE RESTRICT,
  equipment_type TEXT NOT NULL,
  equipment_name TEXT,  -- Optional custom name

  -- Temperature reading
  temperature DECIMAL(5,2) NOT NULL,
  temp_unit TEXT DEFAULT 'F',

  -- Who & When
  employee_name TEXT NOT NULL,
  check_date DATE NOT NULL,
  check_time TIME NOT NULL,
  client_timestamp TIMESTAMPTZ NOT NULL,
  timezone TEXT,

  -- Notes & Photos
  notes TEXT,
  photo_link TEXT,

  -- Violation tracking
  is_violation BOOLEAN DEFAULT false,
  violation_id BIGINT REFERENCES violations(id) ON DELETE SET NULL,

  -- Metadata
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_temp_checks_store ON temperature_checks(store_id);
CREATE INDEX idx_temp_checks_date ON temperature_checks(check_date DESC);
CREATE INDEX idx_temp_checks_violations ON temperature_checks(is_violation) WHERE is_violation = true;
```

**Estimated rows:** 2-6 per store per day = 60-180 rows/day across 30 stores = ~65K rows/year

---

## User Interface Mockup

### Mobile View (Wireframe)

```
┌─────────────────────────────────────┐
│  📊 Taipei Kitchen                   │
│  Temperature Check                   │
├─────────────────────────────────────┤
│                                      │
│  Store *                             │
│  [▼ Select Store          ]          │
│                                      │
│  Equipment Type *                    │
│  [▼ Walk-in Cooler        ]          │
│                                      │
│  Temperature (°F) *                  │
│  [ 38.5                   ]          │
│  ✅ Within safe range                │
│                                      │
│  Employee Name *                     │
│  [ John Smith             ]          │
│                                      │
│  Date & Time                         │
│  [ 2026-06-30  2:45 PM    ] (auto)   │
│                                      │
│  Notes (optional)                    │
│  [                         ]         │
│  [                         ]         │
│                                      │
│  Photo (optional)                    │
│  [ 📷 Take Photo          ]          │
│                                      │
│  [    Submit Temperature Check    ]  │
│                                      │
└─────────────────────────────────────┘
```

### Violation State (>41°F)

```
┌─────────────────────────────────────┐
│  ⚠️  TEMPERATURE VIOLATION           │
├─────────────────────────────────────┤
│  Temperature: 44.2°F                 │
│  Threshold: 41.0°F                   │
│  Exceeded by: 3.2°F                  │
│                                      │
│  ❌ Photo REQUIRED                   │
│  [ 📷 Take Photo          ]          │
│                                      │
│  Corrective Action Notes *           │
│  [                         ]         │
│  [                         ]         │
│                                      │
│  ⚠️ Supervisor will be notified      │
│                                      │
│  [    Submit Violation Report    ]   │
│                                      │
└─────────────────────────────────────┘
```

---

## Integration Points

### 1. Existing Violation Alert System

**File:** `apps_script/Code.gs` (lines 1037+)

**Function:** `onViolationDetected(delivery)`

**Changes needed:**
- Generalize to accept `temperature_check` object (not just delivery)
- Add `violation_type: 'temp_check'` to differentiate from delivery violations
- Reuse email template with updated context

### 2. Dashboard Integration

**File:** `dashboard/index.html` + `dashboard/app.js`

**Current:** Shows delivery violations only

**Enhancement:** Add "Temperature Checks" panel showing:
- Recent temperature checks (last 24 hours)
- Active violations
- Temperature trends per store

### 3. Admin Query Endpoint

**New endpoint:** `?action=queryTemperatureChecks`

**Parameters:** `store`, `date`, `equipment`, `employee`, `violations_only`

**Purpose:** Same observability as `queryDeliveries` endpoint

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)
- [ ] Create HTML form (`taipei_temperature_form.html`)
- [ ] Basic fields (store, equipment, temp, employee, notes)
- [ ] Write to Supabase `temperature_checks` table
- [ ] Violation detection (basic: >41°F = alert)
- [ ] Email alerts (reuse existing system)
- [ ] Deploy to GitHub Pages

**Deliverable:** Working form with basic violation alerts

### Phase 2: Photos & Enhanced Validation (Week 3)
- [ ] Add photo upload (reuse delivery form logic)
- [ ] Required photo for violations >45°F
- [ ] Equipment-specific thresholds
- [ ] Better mobile UX

**Deliverable:** Production-ready form

### Phase 3: Dashboard Integration (Week 4)
- [ ] Add temperature checks panel to dashboard
- [ ] Temperature trend charts
- [ ] Admin query endpoint
- [ ] Execution logging

**Deliverable:** Full observability

### Phase 4: Advanced Features (Future)
- [ ] Offline support with submission queue
- [ ] Scheduled reminders (e.g., "Time for 2pm temp check")
- [ ] Multi-temperature entry (batch mode)
- [ ] Temperature graphs per equipment
- [ ] Predictive alerts (trending toward violation)

---

## Testing Plan

### Manual Testing Checklist

- [ ] Submit temp check with all required fields (happy path)
- [ ] Submit with missing required field (should show validation error)
- [ ] Submit with temp 38°F (within range, green indicator)
- [ ] Submit with temp 44°F (violation, red indicator, alert sent)
- [ ] Submit with photo (photo uploads to Drive, link saved)
- [ ] Submit without photo when not required (should succeed)
- [ ] Test on iPhone Safari, Android Chrome, desktop Chrome
- [ ] Verify email alert received with correct details
- [ ] Verify data written to Supabase correctly
- [ ] Test with invalid store ID (should reject)

### Automated Testing

```javascript
// Test temperature validation logic
test('Temperature 44°F should trigger violation', () => {
  const result = checkTemperatureViolation(44.0, 'cooler');
  expect(result.isViolation).toBe(true);
  expect(result.severity).toBe('minor');
});

test('Temperature 50°F should require photo', () => {
  const result = checkTemperatureViolation(50.0, 'cooler');
  expect(result.isViolation).toBe(true);
  expect(result.requiresPhoto).toBe(true);
  expect(result.severity).toBe('major');
});
```

---

## Success Metrics

### Adoption Metrics
- **Target:** 80% of stores use form within first week
- **Measure:** Unique store IDs in `temperature_checks` table

### Compliance Metrics
- **Target:** 2+ temp checks per store per day (opening + closing)
- **Measure:** Avg checks per store per day

### Violation Detection
- **Target:** 100% of violations >41°F trigger email alerts
- **Measure:** Count of violations vs alert log entries

### Data Quality
- **Target:** <1% missing photo when required
- **Measure:** Count of violations >45°F without photo link

---

## FAQ

### Q: Why a separate form instead of adding to delivery form?
**A:** Delivery form is driver-focused (once per day). Temperature checks are store employee-focused (multiple times per day). Separate form provides:
- Lower friction (fewer fields)
- Clearer purpose
- Easier adoption
- Different data model

### Q: Why Supabase instead of Google Sheets?
**A:**
- Proves Supabase pattern for future migration
- Better for high-frequency writes (multiple checks per day per store)
- Easier to query for dashboard/reports
- No risk of Sheets API rate limits

### Q: What if Supabase is down?
**A:**
- Phase 1: Show error message, ask user to retry
- Phase 2: Add Sheets fallback (dual-write)
- Phase 3: Add offline queue (service worker)

### Q: Can we require temperature checks on a schedule?
**A:** Not in Phase 1 (no authentication to track who should check). Future enhancement: scheduled reminders via SMS/email.

### Q: What about equipment calibration tracking?
**A:** Out of scope for Phase 1. Future enhancement: add "Equipment" master table with calibration dates, maintenance logs, etc.

---

## Next Steps

1. ✅ Review this spec with Romano and Owen
2. ⏳ Answer all "Open Questions" above
3. ⏳ Create Supabase `temperature_checks` table
4. ⏳ Build HTML form (reuse delivery form as template)
5. ⏳ Test with 2-3 stores (pilot program)
6. ⏳ Roll out to all stores
7. ⏳ Monitor adoption and violations

---

## Related Documentation

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase provisioning
- [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md) - Database schema
- [HANDOFF.md](./HANDOFF.md) - Food safety summary
- [CLAUDE.md](../CLAUDE.md) - Project conventions

---

## Questions?

Contact: leandertoney@gmail.com (project owner)

**To begin implementation:** Answer the 7 open questions above, then proceed to Phase 1.
