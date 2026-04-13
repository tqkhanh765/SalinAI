# API Contract and Data Schema (v3.0 - AI Agentic + RAG)

## 1. Firebase Realtime Database Schema (Runtime Bus)
All services must write and read this structure exactly.

```json
{
  "sensor_telemetry": {
    "river_salinity": 1.5,
    "soil_moisture": 70.0,
    "river_water_level": 1.2
  },
  "actuator": {
    "valve_state": "OPEN",
    "pump_state": "OFF",
    "control_mode": "AUTO"
  },
  "station_metadata": {
    "field_elevation": 1.0,
    "crop_type": "RICE",
    "growth_stage": "VEGETATIVE"
  },
  "external_forecast": {
    "tide_status": "RISING",
    "rainfall_24h": 15.5,
    "temperature": 32.0
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
```

### 1.1 Field Rules
- sensor_telemetry.river_salinity is required.
- sensor_telemetry.soil_moisture is required.
- sensor_telemetry.river_water_level is optional.
- station_metadata.growth_stage enum: SEEDLING, VEGETATIVE, FLOWERING, FRUITING, HARVEST.
- actuator.control_mode enum: AUTO, MANUAL.
- actuator.pump_state enum: ON, OFF.
- action_logs.actor enum: AI_AGENTIC, USER.
- action_logs.action enum: OPEN, CLOSED, NO_ACTION.

## 2. MongoDB Atlas Collections and Vector Contracts

### 2.1 guideline_documents (RAG Corpus)

```json
{
  "_id": "guide-rice-veg-014",
  "title": "Rice irrigation guideline for vegetative stage",
  "content": "When salinity risk rises above threshold, close intake valve...",
  "crop_type": "RICE",
  "crop_stage": "VEGETATIVE",
  "region": "MEKONG_DELTA",
  "risk_tags": ["salinity", "storm"],
  "source_ref": "local-agri-bulletin-2026-04",
  "revision": "2026.04",
  "embedding": [0.001, -0.313, 0.928]
}
```

### 2.2 action_logs (AI Agentic Trace Store)

```json
{
  "timestamp": "2026-04-12T09:00:01Z",
  "actor": "AI_AGENTIC",
  "action": "CLOSED",
  "reason": "...",
  "sensor_snapshot": {
    "salinity": 3.2,
    "moisture": 61,
    "crop_stage": "VEGETATIVE"
  },
  "retrieval": {
    "query_text": "salinity high vegetative stage storm risk",
    "top_k": 3,
    "min_score": 0.72,
    "source_ids": ["guide-rice-veg-014"],
    "scores": [0.91]
  }
}
```

### 2.3 Vector Search Index Contract
- Database: salinai
- Collection: guideline_documents
- Index type: Atlas Vector Search
- Path: embedding
- Dimensions: EMBEDDING_DIM (must match embedding model output)
- Similarity: cosine

## 3. Retrieval Chain Contract (LangChain)

### 3.1 Retrieval Request

```json
{
  "query_text": "salinity=3.2 moisture=61 crop_stage=VEGETATIVE weather_risk=true",
  "top_k": 3,
  "min_score": 0.72,
  "filters": {
    "crop_stage": "VEGETATIVE",
    "region": "MEKONG_DELTA"
  }
}
```

### 3.2 Retrieval Response

```json
{
  "documents": [
    {
      "source_id": "guide-rice-veg-014",
      "score": 0.91,
      "content": "When salinity risk rises above threshold...",
      "metadata": {
        "crop_stage": "VEGETATIVE",
        "source_ref": "local-agri-bulletin-2026-04"
      }
    }
  ],
  "retrieval_miss": false
}
```

### 3.3 Prompt Injection Rule
Gemini 2.5 Flash system prompt must include:
- Hard safety policies.
- Current sensor_data and crop_stage.
- Retrieved agricultural guideline snippets with source ids.

If retrieval_miss is true, model must continue with hard rules and explicitly mention no high-confidence guideline was retrieved.

## 4. Backend REST API Endpoints

### GET /api/health
Checks backend, Firebase, and MongoDB availability.

Response 200:

```json
{
  "status": "OK",
  "timestamp": "2026-04-12T09:00:00Z",
  "firebase": "CONNECTED",
  "mongodb": "CONNECTED"
}
```

### POST /api/chat
Routes user message through the AI Agentic retrieval chain.

Request body:

```json
{
  "message": "Why was the valve closed this morning?",
  "crop_stage": "VEGETATIVE"
}
```

Response 200:

```json
{
  "reply": "Valve was closed because salinity reached 3.2 ppt and guideline guide-rice-veg-014 recommends closure at this crop stage.",
  "timestamp": "2026-04-12T09:00:02Z",
  "retrieval": {
    "hit_count": 3,
    "source_ids": ["guide-rice-veg-014", "guide-rice-veg-022"],
    "retrieval_miss": false
  }
}
```

Response 500:

```json
{
  "error": "AI Agentic chain invocation failed",
  "details": "..."
}
```

### POST /api/override
Manual valve and mode override endpoint.

Request body:

```json
{
  "valve_state": "OPEN",
  "control_mode": "MANUAL"
}
```

Response 200:

```json
{
  "status": "OK",
  "updated": {
    "valve_state": "OPEN",
    "control_mode": "MANUAL"
  }
}
```

## 5. Tool Contracts (LangChain Tool Calling)

### execute_valve_control
Writes valve state only when control_mode is AUTO.

Input schema:

```json
{
  "state": "CLOSED",
  "reason": "Salinity exceeded threshold for crop stage VEGETATIVE.",
  "source_ids": ["guide-rice-veg-014"]
}
```

Required behavior:
- Re-read control_mode before write.
- Block and return NO_ACTION when control_mode is MANUAL.

### check_weather
Returns weather condition and risk signal.

Output:

```json
{
  "condition": "Storm",
  "is_risky": true,
  "description": "Heavy rain expected in 2 hours"
}
```

### send_alert
Sends Telegram or email alerts.

Input schema:

```json
{
  "channel": "TELEGRAM",
  "message": "SalinAI alert: valve CLOSED due to high salinity",
  "priority": "HIGH"
}
```

## 6. Planned WebSocket Events (v3.1)

| Event | Direction | Payload |
|---|---|---|
| chat:message | Client -> Server | {"message":"string","crop_stage":"enum"} |
| chat:reply | Server -> Client | {"reply":"string","retrieval":{"source_ids":[]}} |
| agentic:status | Server -> Client | {"is_processing":true,"phase":"retrieval|reasoning|tool"} |