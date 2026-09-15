// Photos.gs — delivery photos in Drive and their links back to the delivery rows.

/**
 * Photo root folder for this environment — resolved BY ID ONLY.
 *
 * There is deliberately no name lookup and no folder creation. The previous
 * implementation resolved DriveApp.getFoldersByName() and called createFolder() on a
 * miss, which meant a wrong name — or an identity that could not see the folder —
 * silently produced a DUPLICATE and split photos across two locations. That is the
 * June 2026 incident.
 *
 * A bad or inaccessible PHOTO_FOLDER_ID now fails loudly. Fix the property or the
 * folder sharing; do not reintroduce a fallback.
 */
function getPhotoRootFolder() {
  const id = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!id) {
    throw new Error(
      'PHOTO_FOLDER_ID Script Property is not set on this Apps Script project. ' +
      'Set it under Project Settings > Script Properties before deploying.'
    );
  }
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error(
      'PHOTO_FOLDER_ID "' + id + '" is not accessible to the account this deployment ' +
      'runs as (executeAs: USER_DEPLOYING). Fix the property or the folder sharing. ' +
      'Refusing to fall back to a name lookup, which risks creating a duplicate folder. ' +
      'Underlying error: ' + e.toString()
    );
  }
}

/** Editor-only: run once so the deploying account grants the Drive scope. */
function authorizeDriveAccess() {
  const folder = getPhotoRootFolder();
  Logger.log('Photo folder resolved: "' + folder.getName() + '" (' + folder.getId() + ')');
  Logger.log('Drive access authorized successfully');
}

/**
 * Get or create the date-based subfolder in the photo folder.
 * Resolved through DriveTree: cached, validated, and created under the script lock, so two
 * concurrent uploads on a new day cannot create two folders.
 *
 * @param {Folder} rootFolder - The photo root folder (see getPhotoRootFolder)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Folder} The date subfolder
 */
function getOrCreateDateSubfolder(rootFolder, date) {
  return resolveChildFolder(rootFolder, date);
}

/** Write the before/after photos into the date subfolder. Returns their URLs and a count. */
function savePhotosToDrive(photos) {
  // Root resolved by ID only. No name lookup, no createFolder — see getPhotoRootFolder().
  const dateFolder = getOrCreateDateSubfolder(getPhotoRootFolder(), photos.date);
  const saved = { beforeUrl: null, afterUrl: null, savedCount: 0 };

  ['before', 'after'].forEach(which => {
    const photo = photos[which];
    if (!photo || !photo.data) return;
    const blob = Utilities.newBlob(
      Utilities.base64Decode(photo.data),
      photo.mimeType,
      `${photos.storeId}_${photos.date}_${which}.jpg`
    );
    saved[which + 'Url'] = dateFolder.createFile(blob).getUrl();
    saved.savedCount++;
  });

  return saved;
}

/**
 * Check for photo/URL drift - runs nightly to verify Drive photos match sheet URLs
 * Sends email alert if discrepancy > 5% over last 7 days
 */
function checkPhotoDrift() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ALERT_EMAIL = 'tech-support@kalispellconsulting.com';
  const DRIFT_THRESHOLD = 0.05; // 5%
  const DAYS_TO_CHECK = 7;

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Delivery Log - Live');

    if (!sheet) {
      Logger.log('[Photo Drift Check] Delivery Log sheet not found');
      return;
    }

    // Calculate date range (last 7 days)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - DAYS_TO_CHECK);
    startDate.setHours(0, 0, 0, 0);

    // Count Drive photos by date
    let drivePhotoCounts = {};

    {
      const rootFolder = getPhotoRootFolder();

      // Helper: Count photos in a folder
      const countPhotosInFolder = (folder) => {
        const files = folder.getFiles();
        while (files.hasNext()) {
          const file = files.next();
          const fileName = file.getName();
          // Parse date from filename: {storeId}_{date}_before.jpg or {storeId}_{date}_after.jpg
          const match = fileName.match(/\d+_(\d{4}-\d{2}-\d{2})_(before|after)\.jpg/);
          if (match) {
            const fileDate = match[1];
            const fileDateObj = new Date(fileDate);
            if (fileDateObj >= startDate && fileDateObj <= now) {
              drivePhotoCounts[fileDate] = (drivePhotoCounts[fileDate] || 0) + 1;
            }
          }
        }
      };

      // Count photos in root folder (backwards compatibility)
      countPhotosInFolder(rootFolder);

      // Count photos in date subfolders (new organization)
      const subfolders = rootFolder.getFolders();
      while (subfolders.hasNext()) {
        const subfolder = subfolders.next();
        const subfolderName = subfolder.getName();
        // Only process YYYY-MM-DD date subfolders
        if (/^\d{4}-\d{2}-\d{2}$/.test(subfolderName)) {
          countPhotosInFolder(subfolder);
        }
      }
    }

    // Count non-empty photo URL cells by date in sheet
    const data = sheet.getDataRange().getValues();
    let sheetUrlCounts = {};

    for (let i = 1; i < data.length; i++) { // Skip header row
      const row = data[i];
      const rowDate = row[2]; // Col C – Date
      const beforePhotoUrl = row[16]; // Col Q (index 16) – Before Photo Link (FIXED: was row[18])
      const afterPhotoUrl = row[17];  // Col R (index 17) – After Photo Link (FIXED: was row[19])

      // Normalize date
      let rowDateStr = '';
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        rowDateStr = String(rowDate);
      }

      const rowDateObj = new Date(rowDateStr);
      if (rowDateObj >= startDate && rowDateObj <= now) {
        // Count non-empty photo URLs
        let urlCount = 0;
        if (beforePhotoUrl && String(beforePhotoUrl).trim() !== '') urlCount++;
        if (afterPhotoUrl && String(afterPhotoUrl).trim() !== '') urlCount++;

        if (urlCount > 0) {
          sheetUrlCounts[rowDateStr] = (sheetUrlCounts[rowDateStr] || 0) + urlCount;
        }
      }
    }

    // Compare counts and detect drift
    let totalDrivePhotos = Object.values(drivePhotoCounts).reduce((sum, count) => sum + count, 0);
    let totalSheetUrls = Object.values(sheetUrlCounts).reduce((sum, count) => sum + count, 0);
    let driftDetails = [];
    let hasDrift = false;

    // Check each date
    const allDates = new Set([...Object.keys(drivePhotoCounts), ...Object.keys(sheetUrlCounts)]);
    allDates.forEach(date => {
      const driveCount = drivePhotoCounts[date] || 0;
      const sheetCount = sheetUrlCounts[date] || 0;
      if (driveCount !== sheetCount) {
        const diff = Math.abs(driveCount - sheetCount);
        const driftPercent = driveCount > 0 ? (diff / driveCount) * 100 : 100;
        driftDetails.push(`  ${date}: ${driveCount} photos in Drive, ${sheetCount} URLs in sheet (${driftPercent.toFixed(1)}% drift)`);
      }
    });

    // Calculate overall drift
    const overallDrift = totalDrivePhotos > 0 ? Math.abs(totalDrivePhotos - totalSheetUrls) / totalDrivePhotos : 0;
    hasDrift = overallDrift > DRIFT_THRESHOLD;

    if (hasDrift || driftDetails.length > 0) {
      // Send alert email
      const subject = `⚠️ Taipei Kitchen Photo/URL Drift Detected (${(overallDrift * 100).toFixed(1)}%)`;
      const body = `Photo upload monitoring has detected a discrepancy between Drive photos and sheet URLs.

SUMMARY (Last ${DAYS_TO_CHECK} Days):
- Total photos in Drive: ${totalDrivePhotos}
- Total URLs in sheet: ${totalSheetUrls}
- Difference: ${Math.abs(totalDrivePhotos - totalSheetUrls)}
- Drift percentage: ${(overallDrift * 100).toFixed(1)}%
- Threshold: ${(DRIFT_THRESHOLD * 100).toFixed(0)}%

DAILY BREAKDOWN:
${driftDetails.length > 0 ? driftDetails.join('\n') : '  (All dates match)'}

POSSIBLE CAUSES:
- Sheet update failures (check Apps Script execution logs for errors)
- Orphaned photos (no matching delivery row)
- Multiple deliveries to same store/driver/date
- Photo submissions before delivery submissions

ACTION REQUIRED:
1. Check Apps Script execution logs for [PHOTO UPLOAD] warnings/errors
2. Review Delivery Log columns Q/R for missing URLs
3. Check the Drive folder for orphaned photos

Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}
Drive Folder: https://drive.google.com/drive/folders/${PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID')}

This check ran at ${now.toISOString()}`;

      MailApp.sendEmail({
        to: ALERT_EMAIL,
        subject: subject,
        body: body
      });

      Logger.log(`[Photo Drift Check] Alert sent: ${(overallDrift * 100).toFixed(1)}% drift detected`);
    } else {
      Logger.log(`[Photo Drift Check] No drift detected. ${totalDrivePhotos} photos match ${totalSheetUrls} URLs`);
    }

  } catch (error) {
    Logger.log(`[Photo Drift Check] ERROR: ${error.toString()}`);
    // Send error notification
    MailApp.sendEmail({
      to: ALERT_EMAIL,
      subject: 'Taipei Kitchen Photo Drift Check Failed',
      body: `The nightly photo drift check encountered an error:\n\n${error.toString()}\n\nPlease investigate.`
    });
  }
}
