#!/bin/bash
# Quick Test: New Decision Details API

API="http://localhost:3001"

echo "🧪 Testing /api/decision-details endpoint"
echo ""

# Fetch decision details
curl -s "$API/api/decision-details" | jq '.' | head -100

echo ""
echo "✅ If you see JSON with sensorMetrics, weatherMetrics, tideInfo, aiDecision → SUCCESS! 🎉"
