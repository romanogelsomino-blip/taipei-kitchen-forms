# P2 Mobile Testing Checklist

## Required Devices

- **iPhone** (iOS 15+) - Safari browser
- **Android** (Android 10+) - Chrome browser

## Test URL

https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

---

## P2.1: Multi-Select Filters

### Test Steps
1. Open dashboard on mobile device
2. Navigate to "Deliveries" panel
3. Tap "Store (Multi-Select)" dropdown
4. Select multiple stores (e.g., Giant Hampden + Giant Laurel)
5. Verify checkboxes work correctly
6. Tap "Day of Week" dropdown
7. Select multiple days (e.g., Monday + Tuesday + Wednesday)
8. Verify filters apply correctly
9. Check "Clear All Filters" resets both multi-selects

### Expected Behavior
✅ Dropdowns open in mobile-friendly format
✅ Checkboxes are tappable (not too small)
✅ Selected items show in button text
✅ Filters persist when rotating device
✅ No horizontal scrolling required

---

## P2.2: Case Fullness Analytics

### Test Steps
1. Navigate to "Deliveries" panel
2. Scroll to "Case Fullness" multi-select filter
3. Select multiple fullness levels (e.g., 0-25% + 75-100%)
4. Verify filter applies
5. Scroll to delivery records table
6. Confirm "Case Fullness" column is visible
7. Scroll to metrics cards
8. Verify "Avg Case Fullness" card displays correctly

### Expected Behavior
✅ Case fullness filter works same as other multi-selects
✅ Table scrolls horizontally if needed (pinch-zoom works)
✅ Metrics card text is readable without zooming
✅ Per-store breakdown fits on screen or wraps gracefully

---

## P2.3: HACCP Violation Drill-Down Modal

### Test Steps
1. Navigate to "Food Safety" panel
2. Select a week with violations in "Week Ending" date picker
3. Tap a violation count (non-zero number)
4. Verify modal opens
5. Check modal content is readable
6. Scroll within modal if needed
7. Tap "Close" button
8. Verify modal closes
9. Tap outside modal to close (click-outside behavior)
10. Tap "Export to PDF" button
11. Verify print dialog opens

### Expected Behavior
✅ Modal opens centered on screen
✅ Modal content doesn't overflow viewport
✅ Table within modal scrolls horizontally if needed
✅ Close button is easily tappable (not too small)
✅ Click-outside-to-close works on mobile
✅ Print dialog shows correct content
✅ Modal is responsive to device rotation

---

## P2.4: HACCP Violation Alerts

### Test Steps - Alert Banner
1. Navigate to dashboard home (Overview panel)
2. If violations exist (last 7 days), verify banner shows
3. Tap "View Violations" button
4. Verify navigates to Food Safety panel
5. Go back to Overview
6. Tap "✕" close button on banner
7. Verify banner dismisses
8. Refresh page within 1 hour
9. Verify banner stays dismissed

### Expected Behavior (Banner)
✅ Banner displays at top of content area
✅ Text is readable without zooming
✅ Buttons are tappable (not too small)
✅ Banner stacks elements vertically on narrow screens
✅ Animation is smooth
✅ Dismissal persists across page refreshes

### Test Steps - Violations Queue
1. Navigate to "Food Safety" panel
2. Scroll to "Recent Violations Queue"
3. Verify violation cards display correctly
4. Check violation details are readable
5. Tap "View Details" button
6. Verify modal opens with violation info
7. Try disabled buttons ("Mark Resolved", "Add Note")
8. Verify tooltip shows on tap/long-press
9. Tap "Refresh" button
10. Verify queue updates

### Expected Behavior (Queue)
✅ Violation cards stack vertically
✅ Card content doesn't overflow
✅ Buttons are tappable
✅ Disabled buttons show visual feedback + tooltip
✅ "View Details" opens modal correctly
✅ Refresh button works
✅ Queue scrolls within panel

### Test Steps - Settings Panel
1. Navigate to "Settings" panel
2. Scroll to "HACCP Violation Alerts" section
3. Tap into email textarea
4. Type multiple email addresses (one per line)
5. Verify keyboard behavior
6. Toggle "Enable Alert Emails" checkbox
7. Tap "Save Alert Settings" button
8. Verify success alert shows

### Expected Behavior (Settings)
✅ Textarea is large enough for comfortable typing
✅ Checkbox is tappable
✅ Save button is prominent and tappable
✅ Alert message is readable
✅ No layout shifts when keyboard appears
✅ Section scrolls if needed

---

## General Mobile Testing

### Navigation
✅ Side navigation menu works on mobile
✅ Mobile bottom navigation (if present) works
✅ Panel transitions are smooth
✅ No flickering or jank

### Performance
✅ Dashboard loads within 3 seconds on LTE
✅ Scrolling is smooth (60fps)
✅ No memory leaks (dashboard can stay open for 30+ minutes)
✅ Auto-refresh doesn't cause performance degradation

### Touch Interactions
✅ All buttons are at least 44x44px (iOS guideline)
✅ No accidental taps on adjacent elements
✅ Tap feedback is immediate
✅ Long-press doesn't trigger unwanted context menus

### Responsiveness
✅ Layout adapts to portrait orientation
✅ Layout adapts to landscape orientation
✅ Safe areas respected (notch, rounded corners, home indicator)
✅ Text remains readable without zooming
✅ No horizontal scrolling except in tables

### Dark Mode
✅ Dashboard respects system dark mode setting
✅ Manual theme toggle works (Settings panel)
✅ All P2 features display correctly in dark mode
✅ No unreadable text in dark mode
✅ Modal, banner, and queue work in dark mode

---

## Known Limitations

### Status Tracking
- "Mark Resolved" and "Add Note" buttons are intentionally disabled
- Tooltip shows: "Requires backend integration"
- Phase 2 feature documented in P2_4_STATUS_TRACKING_PHASE2.md

### Browser Compatibility
- Tested on Safari (iOS) and Chrome (Android)
- Other mobile browsers (Firefox, Samsung Internet) not officially supported
- Progressive Web App (PWA) features not implemented

---

## Bug Reporting

If any issues are found during mobile testing:

1. Note the exact device and OS version
2. Note the browser and version
3. Screenshot the issue if visual
4. Describe steps to reproduce
5. Report via dashboard bug report button OR email team

---

## Sign-Off

- [ ] Tested on iPhone Safari - Date: _____ Tester: _____
- [ ] Tested on Android Chrome - Date: _____ Tester: _____
- [ ] All P2 features work correctly on mobile
- [ ] No blocking issues found
- [ ] Ready for production deployment

**Notes**:
