# API Contract and Data Schema (v3.0 - AI Agentic + RAG)

## 1. Firebase Realtime Database Schema (Runtime Bus)
All services must write and read this structure exactly.

```json
{
  "sensor_data": {
    "salinity": 1.5,
    "moisture": 70.0,
    "crop_stage": "VEGETATIVE",
    "timestamp": "2026-04-12T09:00:00Z"
  },
  "actuator": {
    "valve_state": "OPEN",
    "control_mode": "AUTO"
    "valve_state": "OPEN",
    "control_mode": "AUTO"
  },
  "ai_status": {
    "is_processing": false,
    "last_reasoning": "No action required.",
    "alert_sent": false,
    "last_retrieval_hit_count": 3,
    "last_retrieval_source_ids": ["guide-rice-veg-014", "guide-rice-veg-022"]
  },
  "action_logs": {
    "-NxyZ123456789": {
      "timestamp": "2026-04-12T09:00:01Z",
      "actor": "AI_AGENTIC",
      "action": "CLOSED",
      "reason": "Salinity exceeded threshold and retrieved guideline recommends closure.",
      "retrieval": {
        "hit_count": 3,
        "source_ids": ["guide-rice-veg-014", "guide-rice-veg-022"],
        "retrieval_miss": false
      }
    }
  }
}