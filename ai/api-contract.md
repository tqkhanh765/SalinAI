# API Contract & Data Schema (v2.2)

## 1. Firebase Realtime Database Schema
All services must keep the realtime database aligned with this structure:

```json
{
  "sensor_data": {
    "salinity": 1.5,
    "moisture": 70,
    "timestamp": "2026-04-11T15:00:00Z"
  },
  "actuator": {
    "valve_state": "OPEN",
    "control_mode": "AUTO"
  },
  "ai_status": {
    "is_processing": false,
    "last_reasoning": "Salinity is within safe range. No action needed."
  },
  "action_logs": {
    "-NxyZ123456789": {
      "timestamp": "2026-04-11T15:00:00Z",
      "actor": "AI",
      "action": "NO_ACTION",
      "reason": "Safe conditions. No valve change required.",
      "source": "langchain"
    }
  }
}
```

---

## 2. MongoDB RAG Document Schema
MongoDB is the long-term memory and retrieval layer for the AI pipeline.

### `action_logs` collection
```json
{
  "_id": "ObjectId",
  "firebase_key": "-NxyZ123456789",
  "timestamp": "2026-04-11T15:00:00Z",
  "actor": "AI",
  "action": "CLOSED",
  "reason": "Salinity exceeded 2 ppt.",
  "salinity": 2.8,
  "moisture": 61,
  "control_mode": "AUTO",
  "tags": ["salinity", "valve", "safety"],
  "embedding": [0.12, 0.04, 0.88]
}
```

The exact embedding format can change later, but the stored record must always preserve the original action, reason, and context fields for retrieval.

---

## 3. Backend REST API Endpoints

### `GET /api/health`
Confirms the server is alive and Firebase is connected.

**Response `200 OK`:**
```json
{
  "status": "OK",
  "timestamp": "2026-04-11T15:00:00Z",
  "firebase": "CONNECTED",
  "mongodb": "CONNECTED"
}
```

### `POST /api/override`
Allows the dashboard to manually set valve state and control mode.

**Request Body:**
```json
{
  "valve_state": "OPEN",
  "control_mode": "MANUAL"
}
```

**Response `200 OK`:**
```json
{
  "status": "OK",
  "updated": {
    "valve_state": "OPEN",
    "control_mode": "MANUAL"
  }
}
```

---

## 4. Internal AI Flow Contracts
These contracts are for LangChain runtime steps and backend orchestration, not public UI chat.

### `context_ingest`
Builds the current state payload.

**Input:**
```json
{
  "sensor_data": {
    "salinity": 1.5,
    "moisture": 70
  },
  "actuator": {
    "valve_state": "OPEN",
    "control_mode": "AUTO"
  }
}
```

**Output:**
```json
{
  "salinity": 1.5,
  "moisture": 70,
  "valve_state": "OPEN",
  "control_mode": "AUTO",
  "weather": {
    "condition": "Clear",
    "is_risky": false
  }
}
```

### `rag_retrieve`
Queries MongoDB for the most relevant past actions and guidance.

**Input:**
```json
{
  "query": "Current salinity spike with closed valve",
  "top_k": 3
}
```

**Output:**
```json
{
  "results": [
    {
      "timestamp": "2026-04-10T14:00:00Z",
      "action": "CLOSED",
      "reason": "Salinity reached 3.2 ppt.",
      "similarity": 0.91
    }
  ]
}
```

### `safety_validate`
Checks the proposed action against hard rules.

**Input:**
```json
{
  "proposed_action": "CLOSED",
  "control_mode": "AUTO",
  "salinity": 2.8
}
```

**Output:**
```json
{
  "approved": true,
  "final_action": "CLOSED",
  "reason": "Salinity exceeded the threshold and MANUAL mode is not active."
}
```

---

## 5. Notes on Scope
- No chat endpoint is part of the active contract.
- No alert or notification API is part of the active contract.
- RAG and persistence should be designed so they can be reused later if chat is reintroduced.
- LangFlow is not part of the runtime contract; it is only a visualization layer for the same pipeline.