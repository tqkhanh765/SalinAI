# Product Requirements Document (PRD): SalinAI v2.0

## 1. Product Vision
SalinAI is an **autonomous Agentic AI system** designed to protect agriculture in the Mekong Delta from sudden salinity intrusion. It continuously monitors environmental data (soil salinity, moisture, and macro weather forecasts) and autonomously controls water valves to protect crops — while keeping farmers and buyers informed in real time.

---

## 2. Core Features (v2.0)

| # | Feature | Priority |
|---|---|---|
| 1 | Real-time sensor monitoring (salinity, moisture) via Firebase | P0 |
| 2 | AI-driven autonomous valve control using Gemini 2.5 Flash | P0 |
| 3 | Weather-integration for proactive, predictive valve control | P1 |
| 4 | RAG-based action history retrieval via MongoDB Atlas | P1 |
| 5 | Manual override with AI lock (MANUAL mode) | P0 |
| 6 | Automated Telegram / Email alerts to farmers & buyers | P1 |
| 7 | Natural-language chat interface on the Dashboard | P1 |
| 8 | Real-time Dashboard (charts, logs, valve status) | P0 |

---

## 3. Hackathon Constraints (CRITICAL)
- **NO Physical Hardware:** Use a React-based Web Simulator to mock ESP32 sensor data pushes to Firebase.
- **Time Constraint:** Prioritize the **core Agentic Loop** (P0 features) over aesthetics and P1 features.
- **Secrets Management:** All API keys (Gemini, OpenWeatherMap, Telegram, MongoDB) must be stored in `.env`, never hardcoded.

---

## 4. Core User Flows

### Flow A: Autonomous AI Control (AUTO mode)
1. User drags salinity/moisture sliders on the **Simulator Page** and clicks "Push Data".
2. Firebase Realtime DB updates instantly.
3. Backend **Event Filter** detects the change and checks if the anomaly threshold is exceeded.
4. **LangChain Agent** is triggered → fetches weather → performs RAG retrieval → reasons with **Gemini 2.5 Flash**.
5. If `salinity >= 2 ppt` or weather is risky, Gemini calls `execute_valve_control("CLOSED")`.
6. Valve command written to Firebase → Hardware relay closes → Dashboard UI updates.
7. Agent calls `send_alert` → Telegram notification sent to stakeholders.

### Flow B: Manual Override
1. User clicks "Manual Override" on the Dashboard → `control_mode` set to `MANUAL` in Firebase.
2. AI agent is locked out — all `execute_valve_control` calls are blocked.
3. User manually controls the valve via the Dashboard.
4. User clicks "Return to Auto" → `control_mode` set back to `AUTO`.

### Flow C: Chat Query
1. User types a natural-language question in the Dashboard chat panel (e.g., "Why did the valve close?").
2. Frontend POSTs to `POST /api/chat`.
3. LangChain agent uses RAG + context to generate a precise answer from Gemini.
4. Response is displayed in the chat panel.

---

## 5. AI Decision Rules (System Prompt Constraints)

The Gemini agent MUST follow these hard-coded rules:

| Condition | Required Action |
|---|---|
| `salinity >= 2 ppt` | Call `execute_valve_control("CLOSED")` |
| `salinity < 1 ppt` AND valve is CLOSED | Call `execute_valve_control("OPEN")` |
| Weather `is_risky == true` | Call `execute_valve_control("CLOSED")` proactively |
| `control_mode == "MANUAL"` | Skip all valve control. Log reasoning only. |
| Any action taken | Must provide a `reason` string |

---

## 6. Non-Functional Requirements
- **Latency:** Full loop (Simulator push → Dashboard update) MUST complete in < 3 seconds.
- **Reliability:** Event Filter must debounce duplicate triggers to prevent spam-invoking the LLM.
- **Observability:** All agent actions (including "NO_ACTION" with reasoning) must be logged to both Firebase `action_logs` and MongoDB.