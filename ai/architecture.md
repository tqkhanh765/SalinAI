# System Architecture (v3.0 - AI Agentic + RAG Pipeline)

## 1. High-Level Architecture
SalinAI is built as a three-layer, event-driven AI Agentic system. Firebase remains the real-time command bus, while RAG is mandatory and uses only MongoDB Atlas Vector Search.

### Layer 1: Perception (Data Ingestion)

| Component | Technology | Description |
|---|---|---|
| IoT Sensor Mockup | ESP32 / React Simulator | Writes salinity, moisture, and crop_stage into Firebase sensor_data |
| Weather Feed | OpenWeatherMap API | Provides macro weather risk context |

### Layer 2: AI Agentic Core (Backend on Render)

| Component | Technology | Description |
|---|---|---|
| Event Filter + Throttle | Firebase listener middleware | Prevents spam invocation and enforces minimum trigger interval |
| Orchestrator | LangChain.js | Coordinates retrieval, prompt assembly, and tool execution |
| Embedding Generator | Gemini embedding model (via LangChain integration) | Converts multi-factor query state into vector representation |
| Vector Database | MongoDB Atlas Vector Search | Retrieves agricultural guideline chunks filtered by crop_stage and context |
| Reasoning Model | Gemini 2.5 Flash | Produces decision and tool arguments based on retrieved context |

### Layer 3: Execution + Interfaces

| Component | Technology | Description |
|---|---|---|
| Command Bus | Firebase Realtime DB | Stores valve_state, control_mode, AI status, and action logs |
| Actuator | Valve Relay | Executes OPEN or CLOSED state |
| Frontend | React (Vite) | Dashboard, simulator, and AI Agentic visual pages |
| Notifications | Telegram Bot / SMTP | Delivers anomaly or action alerts |

## 2. Mandatory RAG Decision Flow
The production decision chain must always follow this sequence:

1. Listener receives new sensor payload from Firebase.
2. Backend composes multi-factor retrieval query with salinity, moisture, crop_stage, weather_risk, and recent action summary.
3. Embedding generator creates the query vector.
4. LangChain retriever executes MongoDB Atlas Vector Search on agricultural guideline corpus.
5. Retriever returns top-k guideline chunks with scores and metadata.
6. System prompt for Gemini 2.5 Flash is assembled with:
   - Hard safety rules.
   - Real-time factors (salinity, moisture, crop_stage, weather, control_mode).
   - Retrieved guideline context from MongoDB.
7. Gemini reasons and decides tool call or NO_ACTION.
8. Tool executor rechecks control_mode before writing actuator updates.
9. Result is logged to Firebase and MongoDB action logs.

Fallback rule: if retrieval returns no document above threshold, the chain continues with hard safety rules only and logs retrieval_miss=true.

## 3. Langflow Visual Specification (Canonical)
Langflow is the required visual representation for the AI Agentic pipeline. The visual canvas must mirror backend runtime behavior.

### 3.1 Langflow Nodes

| Node ID | Node Type | Input | Output |
|---|---|---|---|
| N1 | Firebase Trigger Node | sensor_data update | sensor_event |
| N2 | Event Filter Node | sensor_event | filtered_event |
| N3 | Weather Context Node | filtered_event | enriched_event |
| N4 | Query Builder Node | enriched_event | retrieval_query_text |
| N5 | Embedding Node | retrieval_query_text | query_vector |
| N6 | MongoDB Atlas Vector Search Node | query_vector + crop_stage filter | retrieved_guidelines |
| N7 | Prompt Builder Node | enriched_event + retrieved_guidelines | system_prompt |
| N8 | Gemini 2.5 Flash Node | system_prompt + tool schemas | model_decision |
| N9 | Tool Router Node | model_decision | tool_execution_result |
| N10 | Log Sink Node | tool_execution_result | firebase_log + mongo_log |

### 3.2 Langflow Edges

| Edge | From | To | Purpose |
|---|---|---|---|
| E1 | N1 | N2 | Initial trigger handoff |
| E2 | N2 | N3 | Pass valid events only |
| E3 | N3 | N4 | Build retrieval query from multi-factor state |
| E4 | N4 | N5 | Generate embedding |
| E5 | N5 | N6 | Execute vector retrieval |
| E6 | N3 + N6 | N7 | Merge live context and retrieved context |
| E7 | N7 | N8 | Run Gemini reasoning |
| E8 | N8 | N9 | Execute tool decision safely |
| E9 | N9 | N10 | Persist outcome and observability metadata |

## 4. Control Mode State Machine

```text
AUTO   -- user sets MANUAL --> MANUAL
MANUAL -- user sets AUTO   --> AUTO

AUTO:   AI Agentic pipeline may execute valve writes.
MANUAL: AI Agentic pipeline may reason, but actuator write tools are blocked.
```

## 5. End-to-End Data Flow

| Step | Description |
|---|---|
| 1 | Sensor payload with salinity, moisture, crop_stage arrives in Firebase |
| 2 | Listener applies throttle and control checks |
| 3 | Backend enriches with weather context |
| 4 | Retrieval query string is built from multi-factor state |
| 5 | Query embedding is generated |
| 6 | MongoDB Atlas Vector Search returns top-k guideline chunks |
| 7 | Retrieved context is injected into Gemini 2.5 Flash system prompt |
| 8 | Gemini emits action decision + reason |
| 9 | Tool layer enforces MANUAL lock and writes safe state |
| 10 | Action and retrieval metadata are persisted for audit and future RAG |

## 6. Repository Mapping

```text
/SalinAI
 ├── /ai
 │    ├── architecture.md
 │    ├── api-contract.md
 │    ├── product.md
 │    ├── task.md
 │    └── testing.md
 ├── /backend
 │    ├── /agent
 │    │    ├── langchain.js      # Retrieval chain + model invocation
 │    │    ├── prompt.js         # Prompt template with retrieved context injection
 │    │    └── tools.js          # Safe tool execution contracts
 │    ├── /listeners
 │    │    └── firebase-listener.js
 │    ├── /config
 │    │    ├── firebase.js
 │    │    └── mongodb.js        # Atlas connection + vector index helpers
 │    └── server.js
 ├── /frontend
 └── /hardware
```

## 7. Technology Summary

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React.js (Vite) | Vercel |
| Backend AI Agentic Core | Node.js, Express, LangChain.js | Render |
| LLM | Gemini 2.5 Flash | Google AI Studio |
| Embeddings | Gemini embeddings via LangChain | Google AI Studio |
| Realtime Bus | Firebase Realtime DB | Firebase |
| Vector Database | MongoDB Atlas Vector Search | MongoDB Atlas |
| Notification | Telegram Bot API / SMTP | External APIs |
| Weather | OpenWeatherMap API | External API |
