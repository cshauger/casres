#!/bin/bash
set -e

VERCEL_TOKEN=$(grep "^Vercel,API Token," /tmp/API_Keys_Inventory.csv | cut -d',' -f3)

# Create tarball of files
tar -czf casres.tar.gz index.html privacy.html terms.html api/ vercel.json

# Try to create project first
PROJECT_RESPONSE=$(curl -s -X POST "https://api.vercel.com/v9/projects" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "casres",
    "framework": null
  }')

echo "Project creation response: $PROJECT_RESPONSE"

