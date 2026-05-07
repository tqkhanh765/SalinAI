# Testing Strategy & Edge Cases (v2.2)

## 1. Core Decision Rules

| Test Case | Input Conditions | Expected Behavior |
|---|---|---|
| **TC-1: Safe - No Action** | Salinity = 1.0 ppt, control mode = AUTO | The system must not change the valve. It should write a NO_ACTION log with a clear reason. |
| **TC-2: High Salinity** | Salinity = 2.5 ppt, control mode = AUTO | The system must move the valve to CLOSED and explain that the threshold was exceeded. |
| **TC-3: Recovery** | Salinity = 0.8 ppt, valve = CLOSED, control mode = AUTO | The system must open the valve if no other risk is present. |
| **TC-4: Dual Risk** | Salinity = 3.0 ppt, risky weather context, control mode = AUTO | The system must favor CLOSED and record both reasons in the log. |

---

## 2. Manual Override

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-5: Override Blocks AI** | Set `control_mode = MANUAL`, then push a high-salinity reading. | The listener must stop before orchestration starts. No autonomous valve change should happen. |
| **TC-6: Return to AUTO Restores Flow** | Switch from MANUAL back to AUTO, then push a new anomaly. | The next valid event must trigger the orchestration flow normally. |

---

## 3. Listener and Throttling

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-7: Duplicate Event Suppression** | Push the same sensor reading several times in a short window. | The system must invoke the flow at most once during the debounce window. |
| **TC-8: Stable-State Check** | Keep the system idle for the configured interval. | The periodic check, if enabled, should not spam repeated actions. |

---

## 4. RAG and MongoDB

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-9: Action Written to MongoDB** | Trigger any AI decision, including NO_ACTION. | A matching record must appear in the MongoDB action log collection with the right context fields. |
| **TC-10: Retrieval Finds Similar Past Case** | Query the system with a salinity spike similar to a previously logged event. | The RAG step must surface the most relevant old action and include it in the reasoning context. |
| **TC-11: Retrieval Failure Fallback** | Simulate MongoDB being unavailable. | The system must still produce a safe decision using the live sensor state and log the retrieval error. |

---

## 5. LangFlow Visualization

| Test Case | Steps | Expected Result |
|---|---|---|
| **TC-12: Ingestion Substep** | Feed sensor data into the ingestion node. | The substep must normalize the payload and pass a structured current-state object forward. |
| **TC-13: Safety Substep** | Force a proposed action while `control_mode = MANUAL`. | The safety node must block the action and return a safe fallback decision. |
| **TC-14: Persistence Substep** | Complete a full flow that ends in a decision. | The persistence node must write the final decision trail to Firebase and MongoDB. |
| **TC-15: LangFlow Diagram Match** | Compare the UI pipeline diagram against the documented runtime flow. | The visualization must match the LangChain-controlled sequence and labels. |

---

## 6. API and Dashboard

| Test Case | Request or Action | Expected Response |
|---|---|---|
| **TC-16: Health Check** | `GET /api/health` | Return `200 OK` with Firebase and MongoDB connection status. |
| **TC-17: Override Validation** | `POST /api/override` with an invalid valve state | Return `400 Bad Request` and do not update Firebase. |
| **TC-18: Dashboard Reflection** | Trigger a valid autonomous action | The dashboard must show the new valve state, latest reasoning, and the newest log entry. |

---

## 7. Latency and Reliability

| Test Case | Method | Target |
|---|---|---|
| **TC-19: End-to-End Latency** | Measure from sensor push to dashboard update | Keep the core path under 3 seconds under normal conditions. |
| **TC-20: Safe Fallback Under Error** | Inject a model or retrieval failure | The system must log the failure and avoid unsafe valve changes. |