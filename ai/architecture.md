# System Architecture (v2.0 — Agentic AI Pipeline)

## 1. High-Level Architecture
The system is structured into **three layers** using an Event-Driven, Agentic-Loop pattern over Firebase Realtime DB as the central message bus.

---

### Layer 1: Perception (Data Ingestion)
Responsible for feeding raw environmental data into the system.

| Component | Technology | Description |
|---|---|---|
| IoT Sensor Mockup | ESP32 / React Simulator | Pushes `salinity` & `moisture` data to Firebase |
| Weather Feed | OpenWeatherMap API | Fetched by the backend agent for macro climate context |

---

### Layer 2: The Agentic Core (Backend on Render)
The Node.js backend is the brain of the system. It hosts the full agentic loop.

| Component | Technology | Description |
|---|---|---|
| Event Filter & Throttling | Custom middleware | Debounces Firebase change events; only triggers AI on anomalies or cron schedule |
| Agentic Orchestrator | LangChain.js | Manages the reasoning loop, tool dispatch, and conversation memory |
| LLM | Gemini 2.5 Flash (Google AI Studio) | Performs reasoning, planning, and function calling |
| Vector Store & History | MongoDB Atlas (Vector Search) | Enables RAG retrieval of past actions and domain knowledge; also stores action logs |

**Agentic Loop Flow:**
```
Firebase change → Event Filter → LangChain.js
    ↕ (Reasoning)     ↕ (RAG)        ↕
  Gemini 2.5 Flash   MongoDB Atlas   Tools (Function Calling)
```

---

### Layer 3: Execution & Action
Where decisions are materialized into real-world effects.

| Component | Technology | Description |
|---|---|---|
| Command Bus | Firebase Realtime DB | Carries valve commands & control mode state to the hardware |
| Hardware / Actuator | Water Valve / Relay | Receives OPEN/CLOSED commands from Firebase |
| Frontend Dashboard | ReactJS (Vercel) | Reads Firebase for real-time UI updates; sends manual overrides & chat queries |
| Notification System | Telegram Bot / SMTP Email | Agent auto-sends alerts to farmers and buyers |

---

## 2. Control Mode State Machine
The `actuator.control_mode` field in Firebase governs autonomy:

```
AUTO  ──(User sets MANUAL)──▶  MANUAL
MANUAL ──(User sets AUTO)───▶  AUTO

- In AUTO mode:  The AI agent CAN write to actuator.valve_state.
- In MANUAL mode: The AI agent is BLOCKED. No autonomous command is written.
                  User overrides via the Dashboard instead.
```

---

## 3. Data Flow (Step-by-Step)

| Step | Description |
|---|---|
| 1 | ESP32 / Simulator pushes `salinity` & `moisture` to Firebase |
| 2 | Backend fetches macro weather data from OpenWeatherMap |
| 3a | Firebase Realtime Listener detects `sensor_data` change |
| 3b | Event Filter decides whether to trigger AI (anomaly or cron) |
| 4 | LangChain invokes Gemini 2.5 Flash for reasoning |
| 5 | Agent retrieves relevant historical context via MongoDB RAG |
| 6 | Agent selects action via Function Calling; checks `control_mode` |
| 7 | If `control_mode == AUTO`, writes valve command to Firebase |
| 8 | Physical relay responds to Firebase command |
| 9 | Dashboard UI updates chart, valve status, and action log |
| 10 | Agent sends alert via Telegram / Email to stakeholders |
| 11a | User sends chat query → REST / WebSocket → LangChain responds |
| 11b | User sets MANUAL override → Firebase `control_mode` updated |

---

## 4. Directory Structure (Monorepo)
```text
/SalinAI
 ├── /ai                    # Documentation & planning (this folder)
 │    ├── architecture.md   # This file
 │    ├── api-contract.md   # Firebase schema & REST/WebSocket contracts
 │    ├── product.md        # PRD & product vision
 │    ├── task.md           # Sprint task board
 │    └── testing.md        # Test cases & edge cases
 ├── /backend               # Node.js, Express, LangChain (hosted on Render)
 │    ├── /agent
 │    │    ├── langchain.js  # Agent init, invoke, memory management
 │    │    ├── prompt.js     # System prompt (rules, context template)
 │    │    └── tools.js      # Tool definitions: valve control, weather, alerts
 │    ├── /listeners
 │    │    └── firebase-listener.js  # Realtime DB change handler + throttling
 │    ├── /config
 │    │    └── firebase.js   # Firebase Admin SDK singleton
 │    └── server.js          # Express entry point + REST/WebSocket routes
 ├── /frontend               # ReactJS (hosted on Vercel)
 │    ├── /src/pages         # Dashboard.jsx, Simulator.jsx
 │    └── /src/lib           # firebase.js (client SDK)
 └── /hardware               # ESP32 firmware / mockup scripts
```

---

## 5. Technology Stack Summary

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React.js (Vite) | Vercel |
| Backend / Agentic Core | Node.js, Express, LangChain.js | Render |
| LLM | Gemini 2.5 Flash | Google AI Studio |
| Realtime DB / Message Bus | Firebase Realtime DB | Firebase |
| Vector Store & Logs | MongoDB Atlas | MongoDB Cloud |
| Notifications | Telegram Bot API / SMTP | External APIs |
| Weather Data | OpenWeatherMap API | External API |
