#!/usr/bin/env node

/**
 * Diagnostic script to analyze waste data date formats and filtering issues
 */

const https = require('https');
const http = require('http');

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz-vCMH3fPb3oM5eGwb4-hQt2C0iDtRtPhSJnjdN854heINYjoiPVf37tvpigR2X2x7jQ/exec';

function normalizeDate(dateInput) {
  if (!dateInput) return '';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
  } catch {
    return '';
  }
}

function fetchWithRedirects(url, callback) {
  const protocol = url.startsWith('https') ? https : http;

  protocol.get(url, (res) => {
    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log(`Following redirect to: ${res.headers.location.substring(0, 80)}...`);
      fetchWithRedirects(res.headers.location, callback);
      return;
    }

    callback(res);
  }).on('error', (err) => {
    console.error('Error fetching data:', err.message);
  });
}

function analyzeWasteData() {
  fetchWithRedirects(WEB_APP_URL, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const waste = json.waste || [];

        console.log('═══════════════════════════════════════════════════════════');
        console.log('WASTE DATA DIAGNOSTIC REPORT');
        console.log('═══════════════════════════════════════════════════════════\n');

        console.log(`Total waste records: ${waste.length}\n`);

        // Analyze date formats
        const dateFormats = {};
        const invalidDates = [];
        const validDates = [];

        waste.forEach((w, index) => {
          const rawDate = w.date;
          const normalized = normalizeDate(rawDate);

          if (!normalized) {
            invalidDates.push({ index, rawDate, removed: w.removed, reason: w.reason });
          } else {
            validDates.push(normalized);
            const format = typeof rawDate;
            dateFormats[format] = (dateFormats[format] || 0) + 1;
          }
        });

        console.log('DATE FORMAT BREAKDOWN:');
        console.log(JSON.stringify(dateFormats, null, 2));
        console.log();

        console.log(`Valid dates: ${validDates.length}`);
        console.log(`Invalid dates: ${invalidDates.length}\n`);

        if (invalidDates.length > 0) {
          console.log('SAMPLE INVALID DATES (first 10):');
          invalidDates.slice(0, 10).forEach(d => {
            console.log(`  [${d.index}] Raw: "${d.rawDate}" | Removed: ${d.removed} | Reason: ${d.reason}`);
          });
          console.log();
        }

        // Analyze date distribution
        const today = new Date();
        const ranges = {
          '7days': 0,
          '30days': 0,
          '90days': 0,
          'all': waste.length
        };

        validDates.forEach(dateStr => {
          const date = new Date(dateStr);
          const daysAgo = Math.floor((today - date) / (1000 * 60 * 60 * 24));

          if (daysAgo <= 7) ranges['7days']++;
          if (daysAgo <= 30) ranges['30days']++;
          if (daysAgo <= 90) ranges['90days']++;
        });

        console.log('DATE DISTRIBUTION (valid dates only):');
        console.log(`  Last 7 days:  ${ranges['7days']} events`);
        console.log(`  Last 30 days: ${ranges['30days']} events`);
        console.log(`  Last 90 days: ${ranges['90days']} events`);
        console.log(`  All time:     ${ranges['all']} events\n`);

        // Calculate total waste per range
        const wasteByRange = {
          '7days': 0,
          '30days': 0,
          '90days': 0,
          'all': 0
        };

        waste.forEach(w => {
          const normalized = normalizeDate(w.date);
          const removed = parseInt(w.removed) || 0;
          wasteByRange['all'] += removed;

          if (normalized) {
            const date = new Date(normalized);
            const daysAgo = Math.floor((today - date) / (1000 * 60 * 60 * 24));

            if (daysAgo <= 7) wasteByRange['7days'] += removed;
            if (daysAgo <= 30) wasteByRange['30days'] += removed;
            if (daysAgo <= 90) wasteByRange['90days'] += removed;
          }
        });

        console.log('TOTAL WASTE BY RANGE:');
        console.log(`  Last 7 days:  ${wasteByRange['7days']} units`);
        console.log(`  Last 30 days: ${wasteByRange['30days']} units`);
        console.log(`  Last 90 days: ${wasteByRange['90days']} units`);
        console.log(`  All time:     ${wasteByRange['all']} units\n`);

        // Sample raw dates
        console.log('SAMPLE RAW DATES (first 20):');
        waste.slice(0, 20).forEach((w, i) => {
          console.log(`  [${i}] Raw: "${w.date}" | Normalized: "${normalizeDate(w.date)}" | Removed: ${w.removed}`);
        });
        console.log();

        // Sample recent normalized dates
        const recentDates = validDates
          .sort((a, b) => b.localeCompare(a))
          .slice(0, 10);

        console.log('MOST RECENT NORMALIZED DATES (top 10):');
        recentDates.forEach(d => console.log(`  ${d}`));
        console.log();

        // Sample oldest normalized dates
        const oldestDates = validDates
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 10);

        console.log('OLDEST NORMALIZED DATES (top 10):');
        oldestDates.forEach(d => console.log(`  ${d}`));
        console.log();

        console.log('═══════════════════════════════════════════════════════════');

      } catch (err) {
        console.error('Error parsing response:', err.message);
        console.log('Raw response:', data.substring(0, 500));
      }
    });

  });
}

analyzeWasteData();
