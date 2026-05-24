#!/bin/bash
# Deploy Code.gs to production (no ID replacement needed - already has production ID)

cp .clasp.production.json .clasp.json
clasp push

echo "✅ Deployed to production"
