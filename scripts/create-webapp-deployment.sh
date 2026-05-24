#!/bin/bash
# Create Web App deployment via Apps Script API
# Usage: bash scripts/create-webapp-deployment.sh <staging|production>

ENV=$1
if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  echo "Usage: bash scripts/create-webapp-deployment.sh <staging|production>"
  exit 1
fi

# Get script ID
if [ "$ENV" = "staging" ]; then
  SCRIPT_ID="1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP"
else
  SCRIPT_ID="1WoLDGj8t2u23SXBT2XaZFCUg60hdvy4G2REXxqEPaqHuUudmFoyqJjbU"
fi

# Get OAuth token from .clasprc.json
ACCESS_TOKEN=$(cat ~/.clasprc.json | jq -r '.token.access_token')

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Error: No access token found in ~/.clasprc.json"
  exit 1
fi

echo "Step 1: Creating version for $ENV (script: $SCRIPT_ID)..."

# Create a new version first
VERSION_RESPONSE=$(curl -s -X POST \
  "https://script.googleapis.com/v1/projects/$SCRIPT_ID/versions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Admin automation - auto-versioned"
  }')

echo "$VERSION_RESPONSE" | jq '.'

# Extract version number
VERSION_NUMBER=$(echo "$VERSION_RESPONSE" | jq -r '.versionNumber // empty')

if [ -z "$VERSION_NUMBER" ]; then
  echo "Error: Failed to create version"
  echo "Response: $VERSION_RESPONSE"
  exit 1
fi

echo ""
echo "✅ Created version $VERSION_NUMBER"
echo "Step 2: Creating Web App deployment..."

# Create deployment using the new version
# Note: webapp entryPoints are defined in appsscript.json, not in the API request
RESPONSE=$(curl -s -X POST \
  "https://script.googleapis.com/v1/projects/$SCRIPT_ID/deployments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"versionNumber\": $VERSION_NUMBER,
    \"description\": \"Admin automation - auto-deployed\"
  }")

echo "$RESPONSE" | jq '.'

# Extract deployment ID and construct Web App URL
DEPLOYMENT_ID=$(echo "$RESPONSE" | jq -r '.deploymentId // empty')

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Error: Failed to create deployment"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "✅ Success!"
echo "Deployment ID: $DEPLOYMENT_ID"
echo "Web App URL: https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
echo ""
echo "Update .env.$ENV with:"
echo "WEB_APP_URL=https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
