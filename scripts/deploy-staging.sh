#!/bin/bash
# Deploy Code.gs to staging with staging sheet ID

STAGING_SHEET_ID="1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E"
PRODUCTION_SHEET_ID="1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI"

# Backup original Code.gs
cp apps_script/Code.gs apps_script/Code.gs.backup

# Replace production ID with staging ID
sed -i.bak "s/${PRODUCTION_SHEET_ID}/${STAGING_SHEET_ID}/g" apps_script/Code.gs

# Deploy to staging
cp .clasp.staging.json .clasp.json
clasp push

# Restore original Code.gs
mv apps_script/Code.gs.backup apps_script/Code.gs
rm apps_script/Code.gs.bak

echo "✅ Deployed to staging with sheet ID: ${STAGING_SHEET_ID}"
