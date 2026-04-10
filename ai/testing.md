# Testing Strategy & Edge Cases (v2.0)

## 1. System Prompt Constraints (Core Autonomous Loop)

| Test Case | Input Conditions | Expected Agent Behavior |
|---|---|---|
| **TC-1: Safe — No Action** | Salinity = 1.0 ppt, Weather = Clear | MUST NOT call `execute_valve_control`. Log must contain "NO_ACTION" with reasoning "Safe". |
| **TC-2: Danger — High Salinity** | Salinity = 2.5 ppt, Weather = Clear | MUST call `execute_valve_control("CLOSED")` immediately. Reason must mention ppt threshold. |
| **TC-3: Danger — Weather Risk** | Salinity = 1.5 ppt, Weather = "Storm" (`is_risky: true`) | MUST call `execute_valve_control("CLOSED")` proactively. Reason must mention weather. |
| **TC-4: Recovery — Safe After Close** | Salinity = 0.8 ppt, Valve is CLOSED | MUST call `execute_valve_control("OPEN")`. Reason must mention salinity is below safe threshold. |
| **TC-5: Dual Danger** | Salinity = 3.0 ppt, Weather = "Storm" | MUST call `execute_valve_control("CLOSED")`. Reason must mention both factors. |

---

## 2. Manual Override (State Locking)

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-6: Override Blocks AI** | 1. Set `control_mode = MANUAL` via Dashboard. 2. Push salinity = 5.0 ppt. | Backend listener MUST detect `MANUAL` mode and abort before invoking LangChain. AI MUST NOT be triggered. Valve state MUST NOT change. |
| **TC-7: Throttle Re-fires After Return to AUTO** | 1. Set `MANUAL`, push anomaly. 2. Set `AUTO`. 3. Push anomaly again. | After returning to `AUTO`, the next sensor change MUST correctly trigger the AI agent. |

---

## 3. Event Filter & Throttling

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-8: No Spam Invocations** | Push 10 rapid sensor updates within 1 second (all same value). | LangChain agent MUST be invoked AT MOST once within the debounce window. |
| **TC-9: Cron Trigger** | Sensor data is stable for > cron interval (e.g., 5 min). | Agent MUST be triggered by the cron schedule to perform a status check, even without a data change event. |

---

## 4. Weather Integration

| Test Case | Input | Expected Result |
|---|---|---|
| **TC-10: API Failure Graceful Degradation** | OpenWeatherMap API returns 500 or timeout. | `check_weather` tool MUST return a safe default (`is_risky: false`). Agent MUST log the error but continue reasoning with available data. |
| **TC-11: Risky Weather Classification** | API returns `"Thunderstorm"` condition. | `is_risky` MUST be `true`. Agent MUST close the valve. |

---

## 5. RAG & MongoDB History

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-12: Log Written to MongoDB** | Trigger any agent action (including NO_ACTION). | Verify a document appears in the MongoDB `action_logs` collection with correct `actor`, `action`, `reason`, and `timestamp` fields. |
| **TC-13: RAG Context Injection** | Ask chat: "Why did the valve close at 14:00?". | Agent MUST retrieve the relevant past log from MongoDB via vector search and include it in its reasoning. Response MUST reference the correct timestamp/reason. |

---

## 6. REST API (Chat & Override)

| Test Case | Request | Expected Response |
|---|---|---|
| **TC-14: Chat — Factual Query** | `POST /api/chat` `{ "message": "What is the current salinity?" }` | `200 OK` with a reply containing the latest salinity value from Firebase context. |
| **TC-15: Chat — Empty Message** | `POST /api/chat` `{ "message": "" }` | `400 Bad Request` with an error message. |
| **TC-16: Override — Set MANUAL** | `POST /api/override` `{ "control_mode": "MANUAL" }` | `200 OK`. Firebase `actuator.control_mode` MUST be `"MANUAL"`. |
| **TC-17: Override — Invalid State** | `POST /api/override` `{ "valve_state": "BROKEN" }` | `400 Bad Request` with a validation error. |

---

## 7. Alert System

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-18: Telegram Alert Sent** | Trigger anomaly in AUTO mode (salinity = 3.0 ppt). | Verify Telegram message is received with valve state and reason within 5 seconds of the agent's decision. |
| **TC-19: No Duplicate Alerts** | Trigger same anomaly twice within the throttle window. | Only ONE Telegram message MUST be sent (de-duplicated by the throttle filter). |

---

## 8. Real-time Latency

| Test Case | Method | Target |
|---|---|---|
| **TC-20: End-to-End Latency (AUTO)** | Timestamp at Simulator "Push Data" click; timestamp at Dashboard valve UI update. | Round-trip MUST be < **3 seconds** under normal network conditions. |
| **TC-21: Chat Response Latency** | Timestamp at "Send" click in chat panel; timestamp at first character of AI reply. | Chat response MUST arrive in < **5 seconds**. |