# Development Tasks (Sprint Board)
# Deadline: April 19, 2026

## Team Assignment
| Member | Role | Focus Area |
|---|---|---|
| **Member A** | AI / Backend Engineer | Agentic loop: LangChain, Gemini, Tools, Prompt, Listener |
| **Member B** | Frontend Engineer | React UI: Simulator, Dashboard, Chat Panel |
| **Member C** | Full-Stack / Integration | Server routes, Firebase schema, testing, deployment |

## Priority Legend
- 🔴 **MVP — Must Ship** → Required to demonstrate the 4 agentic properties
- 🟡 **MVP — Should Ship** → Needed for a complete demo, but less critical
- ⚪ **Deferrable** → Build only if time allows after Apr 15

---

## Phase 1: Infrastructure & UI
> **Target: Apr 10–11** | Owner: B + C

- [x] **Task 1.1** 🔴 `[C]` Initialize Node.js Express server, configure CORS, connect `firebase-admin` SDK, add `GET /api/health` endpoint.
- [ ] **Task 1.2** 🔴 `[C]` Initialize Vite React app. Setup Firebase Client SDK. Setup all environment variables (`.env`, `.env.example`).
- [ ] **Task 1.3** 🔴 `[B]` Build `Simulator.jsx`:
  - Sliders for salinity & moisture with live value display.
  - "Push Data" button writes to Firebase `sensor_data`.
- [ ] **Task 1.4** 🔴 `[B]` Build `Dashboard.jsx`:
  - Live charts for salinity & moisture (reads from Firebase).
  - Valve status indicator (OPEN / CLOSED).
  - `ai_status.is_processing` loading indicator ("AI is thinking...").
  - Action log list (reads from Firebase `action_logs`, newest first).
  - Manual Override toggle button → writes `control_mode` to Firebase.

---

## Phase 2: Agentic Core & Real-time Loop
> **Target: Apr 12–14** | Owner: A (primary) + C (integration)
> ⚠️ This phase is the entire demo. All 4 agentic properties live here.

- [ ] **Task 2.1** 🔴 `[A]` Write `firebase-listener.js`:
  - Attach `.on("value")` to `sensor_data` in Firebase.
  - **Event Filter:** abort immediately if `control_mode === "MANUAL"`.
  - **Throttling:** debounce rapid events (min 10s between AI invocations).
  - On valid trigger: call `invokeAgent()` from `agent/langchain.js`.

- [ ] **Task 2.2** 🔴 `[A]` Write `agent/prompt.js` — System Prompt:
  - State the **goal** explicitly: *"Protect Mekong Delta crops from salinity intrusion."*
  - Inject dynamic context: `salinity`, `moisture`, `control_mode`, `weather`, last 3 action logs.
  - Force **multi-step reasoning** before any tool call (demonstrates Planning).
  - Hard rules: close if salinity ≥ 2 ppt, close if weather `is_risky`, never act in MANUAL mode.
  - Always output a `reason` string (demonstrates Goal-Driven + Feedback Loop).

- [ ] **Task 2.3** 🔴 `[A]` Write `agent/tools.js` — implement 2 tools:
  - `execute_valve_control(state, reason)`:
    - Double-checks `control_mode !== "MANUAL"` before writing to Firebase.
    - Writes `actuator.valve_state` + appends to `action_logs` in Firebase.
    - Updates `ai_status.last_reasoning` with the reason string.
  - `check_weather()` — **MOCKED for MVP**: returns `{ condition: "Clear", is_risky: false }`.
    - ⚠️ The agent MUST call this tool even if it's mocked — this demonstrates Planning.

- [ ] **Task 2.4** 🔴 `[A]` Write `agent/langchain.js` — wire up the full agent:
  - Initialize `ChatGoogleGenerativeAI` with `gemini-2.5-flash`.
  - Before invoking Gemini, **fetch last 3 `action_logs` from Firebase** and inject into prompt (demonstrates **Feedback Loop** without MongoDB).
  - Set `ai_status.is_processing = true` at start, `false` on completion/error.
  - Bind both tools, build `AgentExecutor`, export `invokeAgent(sensorData)`.

- [ ] **Task 2.5** 🔴 `[C]` Register the Firebase listener in `server.js` on startup.
- [ ] **Task 2.6** 🔴 `[C + A]` End-to-end integration test:
  - Simulator push → listener fires → AI reasons (check `last_reasoning`) → valve changes → Dashboard updates.
  - Target: round-trip < 3 seconds.
  - Verify MANUAL mode completely blocks AI.

---

## Phase 3: RAG & History (MongoDB Atlas)
> ⚪ **Deferrable — Target: Apr 16–17 IF time allows**
> *The Feedback Loop can be demonstrated using Firebase `action_logs` alone. Do this only after Phase 2 is solid.*

- [ ] **Task 3.1** ⚪ `[C]` Configure MongoDB Atlas connection in `/config/mongodb.js`. Add `MONGODB_URI` to `.env`.
- [ ] **Task 3.2** ⚪ `[C]` Define document schema for action logs (mirror Firebase structure).
- [ ] **Task 3.3** ⚪ `[A]` After every agent action, dual-write the log to both Firebase and MongoDB.
- [ ] **Task 3.4** ⚪ `[A]` Enable MongoDB Atlas Vector Search. Use action logs as the document corpus.
- [ ] **Task 3.5** ⚪ `[A]` Integrate RAG into `langchain.js` — retrieve top-3 relevant past actions via vector similarity before invoking Gemini (replaces the Firebase last-3 approach).

---

## Phase 4: Chat Interface & REST Endpoints
> ⚪ **Deferrable — Target: Apr 16–17 IF time allows**

- [ ] **Task 4.1** ⚪ `[C]` Implement `POST /api/chat` in `server.js`. Route request `message` to LangChain agent. Return AI text reply.
- [ ] **Task 4.2** ⚪ `[C]` Implement `POST /api/override` in `server.js`. Validate body and write `valve_state` / `control_mode` to Firebase.
- [ ] **Task 4.3** ⚪ `[B]` Build Chat Panel in `Dashboard.jsx`:
  - Text input + send button + scrollable message thread.
  - Show loading state while `is_processing` is true.
  - Display AI replies in styled bubbles.

---

## Phase 5: Alerts & Notifications
> ⚪ **Deferrable — Target: Apr 17–18 IF time allows**

- [ ] **Task 5.1** ⚪ `[C]` Add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (or `SMTP_*`) to `.env`.
- [ ] **Task 5.2** ⚪ `[A]` Implement `send_alert(channel, message)` tool in `agent/tools.js` using `node-telegram-bot-api` or `nodemailer`.
- [ ] **Task 5.3** ⚪ `[C]` Test: trigger anomaly → verify Telegram message received within 5 seconds.

---

## Phase 6: Final Polish & Edge Cases
> **Target: Apr 18–19** | Owner: All

- [ ] **Task 6.1** 🟡 `[A]` Handle invalid/hallucinated LLM tool calls — wrap all tool executors in try/catch; write a `NO_ACTION` log on failure.
- [ ] **Task 6.2** 🟡 `[B]` Prettify Dashboard: color-coded log entries (🔴 CLOSED / 🟢 OPEN / ⚫ NO_ACTION).
- [ ] **Task 6.3** 🟡 `[B]` Add `ai_status.last_reasoning` display to Dashboard (the AI's thought process — this is your #1 demo talking point).
- [ ] **Task 6.4** ⚪ `[A]` Replace mocked `check_weather` with real OpenWeatherMap API call. Add `OPENWEATHERMAP_API_KEY` to `.env`.
- [ ] **Task 6.5** 🟡 `[C]` Final latency test: confirm < 3s round-trip. Deploy backend to Render, frontend to Vercel.

---

## Sprint Timeline

```
Apr 10–11  →  Phase 1  (B + C): Firebase schema + Simulator + Dashboard skeleton
Apr 12–14  →  Phase 2  (A + C): Full agentic loop — ALL 4 properties must work
Apr 15     →  Buffer: Bug fix, manual override testing, latency check
Apr 16–17  →  Phases 3/4/5 (if time allows — pick the most impressive one)
Apr 18–19  →  Phase 6: Polish + deploy + demo rehearsal
```