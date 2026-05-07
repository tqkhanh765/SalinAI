# SalinAI: Climate-Resilient Agriculture Agent
**Version:** 6.0 — Proactive, Interactive & Self-Learning  
**Stage:** Product Finals (Post-Demo Upgrade)

---

## 🌾 The Problem

The Mekong Delta faces critical salinity intrusion threats that are intensifying due to climate change. Traditional manual monitoring is:
- **Delayed** — farmers check water manually, often discovering damage too late.
- **Reactive** — no warning before a saline front arrives.
- **Non-personalized** — one-size-fits-all irrigation schedules ignore crop stage, soil type, and river tide patterns.

---

## 💡 The Solution: SalinAI v6.0

SalinAI is an **Agentic, Proactive, and Self-Learning irrigation intelligence system** that protects crops by fusing real-time IoT sensor data, expert agricultural knowledge bases, multi-day weather forecasts, and iterative human feedback into a continuously improving decision engine.

> **Core philosophy shift (v5 → v6):** From *"reacting to what happened"* to *"planning for what will happen"*.

---

## 🚀 Product Vision: 5 Upgrade Epics

### EPIC 1 — Advanced RAG & Complex Scenario Intelligence
**Problem:** The v5 Researcher Agent used raw variable strings (e.g., `salinity=3.5`) as RAG queries — brittle and semantically poor.

**v6 Solution:**
- **Query Rewriter:** Researcher generates natural-language Vietnamese search queries from context (e.g., *"Ngưỡng mặn an toàn cho lúa giai đoạn trổ bông khi triều đang lên"*) instead of raw values.
- **Self-RAG Loop:** Researcher evaluates document relevance scores. If a retrieved chunk is irrelevant (score < threshold), it auto-rewrites the query and retries (max 2 attempts) before falling back to mandatory retrieval.
- **Complex Scenario Coverage:** Dedicated test cases and prompt engineering for edge cases:
  - 🔴 **"Double Disaster":** High Salinity (>4 ppt) + Extreme Drought (moisture <35%) simultaneously.
  - 🟡 **"Sweet Water Trap":** Safe salinity *now*, but heavy rain forecasted within 2 hours (risk: sudden saline surge from runoff).

---

### EPIC 2 — Human-in-the-Loop (RLHF) & Evaluator Agent
**Problem:** The AI repeats mistakes because farmer feedback was not deeply analyzed — only stored as a binary `correct/incorrect` verdict.

**v6 Solution:**
- **UI Feedback Buttons:** Each Action Log card shows 👍 / 👎 buttons. Clicking 👎 opens a modal prompting the farmer for a free-text reason.
- **`Evaluator Agent` (New):** When negative feedback is submitted, a dedicated LLM agent (not the Orchestrator) analyzes the mistake, extracts the lesson, and saves a structured *"Lesson Learned"* document to MongoDB's `lessons_learned` collection.
- **Memory Injection:** The Orchestrator fetches the top-N most recent and relevant Lessons before making each decision, injecting them into the system prompt as `[RLHF_MEMORY]`.

---

### EPIC 3 — Proactive Forecasting (Predictive AI)
**Problem:** The system only reacts to current sensor readings. It cannot warn farmers about risks *before* they happen.

**v6 Solution:**
- **Daily Forecast Cronjob:** Runs at 05:00 AM (Vietnam time). Fetches a 3–5 day weather and tidal forecast.
- **Proactive Irrigation Plan:** The AI generates a forward-looking advisory, e.g.:
  > *"Dự báo: Mặn tăng mạnh sáng mai do triều cường + gió Đông. Khuyến nghị: Trữ nước ngọt tối nay, đóng van từ 06:00–14:00 ngày mai."*
- **Dashboard Display:** A new "📅 Kế Hoạch Tưới 3 Ngày" panel on the Farmer Dashboard shows this plan with color-coded risk levels (Low / Medium / High) per day.

---

### EPIC 4 — AI Streaming UX (Real-Time Token Streaming)
**Problem:** AI reasoning takes 3–10 seconds. The user sees a static spinner — poor experience and no trust signal.

**v6 Solution:**
- **SSE Token Streaming:** The backend streams LangChain output tokens via Server-Sent Events (SSE) to the frontend as they are generated.
- **Typewriter UI:** The streaming reasoning panel renders the `[LUẬN GIẢI CỦA AI]` text character-by-character, exactly like ChatGPT — creating a sense of live, transparent reasoning.
- **Phase Indicators:** Stream is divided into labeled phases: `[🔍 Researcher đang phân tích...]` → `[📋 Tổng hợp bằng chứng...]` → `[⚙️ Orchestrator đang quyết định...]` → `[✅ Hoàn tất]`.

---

### EPIC 5 — Dynamic Nature Animations (Immersive UI/UX)
**Problem:** The dashboard feels static and disconnected from the physical farm environment.

**v6 Solution:**
- **Valve Flow Animation:** When valve is `OPEN`, an animated SVG water-flow graphic pulses along the irrigation canal visualization.
- **Weather Background Layers:** Subtle CSS ambient animations driven by real `weather_code`: rain droplets for Heavy Rain, warm glow + sun rays for Sunny, fast-moving clouds for Windy.
- **Crop Growth SVG Transitions:** In the Simulator page, the crop stage indicator smoothly morphs between illustrated stages (🌱 Seedling → 🌿 Vegetative → 🌾 Flowering → 🌾 Harvest) with a 700ms SVG path transition.

---

## 🔴 Known Bugs & Issues (To Fix Alongside Epics)

| Priority | Bug | Location | Impact |
|---|---|---|---|
| 🔴 Critical | ESP32 uses `millis()` as timestamp instead of ISO datetime | `sketch.ino:115` | Sensor history queries are broken |
| 🔴 Critical | `GERMINATION` crop stage exists in Dashboard UI but is rejected by backend | `farmPayloadMapper.js:5` | 400 error when user selects Germination |
| 🔴 Critical | `success_rate` for guidelines is always set to `0`, never computed | `outcomeService.js:425` | Guideline ranking non-functional |
| 🟡 Medium | `recoverySal !== undefined` should be `!= null` (Firebase returns null) | `farmAiTriggerService.js:42` | Recovery trigger misfires |
| 🟡 Medium | ESP32 hardcodes `crop_stage: VEGETATIVE` on every push | `sketch.ino:113` | Overrides user crop stage selection |
| 🟡 Medium | SSE stream has no reconnection logic | `useRealtimeFarmState.js` | Dashboard loses realtime after network drop |
| 🟡 Medium | Leaflet map code commented out but still bundled | `FarmerDashboard.jsx:700` | Unnecessary bundle size |
| 🟢 Minor | `require()` inside function body | `langchain.js:321` | Minor performance issue |
| 🟢 Minor | Mixed Vietnamese/English comments in backend | Multiple files | Code professionalism |

---

## 👥 Targeted Users

| User | Primary Use Case |
|---|---|
| **Small-scale Rice Farmers** | Precise, AI-guided irrigation gate management |
| **Aquaculture Pond Managers** | Real-time salinity threshold alerts |
| **Provincial AgriTech Officers** | Field deployment, policy testing, data collection |
| **Agri-Research Scientists** | Feedback annotation, outcome evaluation, model improvement |

---

## 📊 Success Metrics (Product Finals)

| Metric | Target |
|---|---|
| AI Decision Accuracy (RLHF-evaluated) | ≥ 80% correct verdicts |
| Proactive Alert Lead Time | ≥ 12 hours before salinity event |
| Self-RAG Retry Success Rate | ≥ 70% resolve on 1st retry |
| Streaming First Token Latency | < 2 seconds |
| UI Engagement (Feedback Rate) | ≥ 30% of action logs receive feedback |

---

*SalinAI v6.0 — From Reactive Monitoring to Proactive Climate Intelligence.*