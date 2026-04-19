# System Architecture (v5.0 - Reactive Event-Driven Sync)

## 1. High-Level Architecture
SalinAI is a 3-layer reactive intelligence system designed for real-time salinity management.

1. **Layer 1: Perception (Reactive Sync)**: IoT sensors (ESP32) synchronizing telemetry directly to the Cloud Bus.
2. **Layer 2: Decision Intelligence (Agentic Core)**: Reactive processing using Multi-Agent RAG triggered by cloud events.
3. **Layer 3: Execution & UX**: Bilateral synchronization between Firebase actuators and user interfaces.

---

## 2. Runtime Layers

### Layer A: Perception & Data Bus (Firebase-Centric)

| Component | Technology | Responsibility |
|---|---|---|
| IoT Hardware (ESP32) | C++ (Arduino) | Synchronizes sensor data directly to `SalinAI/sensor_data` in Firebase RTDB. |
| Cloud Bus | Firebase RTDB | Serves as the single source of truth and event dispatcher. |
| AI Trigger Filter | Logic Layer | Compares deltas (Sal > 0.1 ppt, Mois > 1%) using internal history to decide if Agent should run. |
| Sensor Enrichment | Backend Services | Post-sync enrichment with Weather (Open-Meteo) and Tide data. |

### Layer B: Agentic Decision Core

| Component | Role | Intelligence Provider |
|---|---|---|
| **Researcher Agent** | Evidence Analysis | **SaoLa4-Small** (FPT Cloud) |
| **Orchestrator Agent** | Final Decision & Execution | **SaoLa4-Medium** (FPT Cloud) |
| **Embedding Engine** | RAG Vectorization | **Gemini** (`text-embedding-004`) |
| **Retrieval Module** | Vector Search | MongoDB Atlas Vector Search |

### Layer C: Interface and Execution

| Component | Technology | Responsibility |
|---|---|---|
| Real-time Dashboard | React (Vite) | Listens to Firebase for sub-second telemetry and AI trace updates. |
| Actuator Control | Firebase RTDB | State changes in `SalinAI/actuator/valve_state` are picked up by ESP32 polling. |

---

## 3. Data Flow (The Reactive Cycle)

1. **Edge Sync**: ESP32 reads sensors -> Pushes JSON directly to Firebase RTDB.
2. **Backend Watcher**: Node.js listener detects the update.
3. **Enrichment**: Watcher fetches weather/tide context and updates `SalinAI/sensor_enrichment`.
4. **Trigger Filter**: Backend checks if the change is significant enough to run the AI.
5. **Multi-Agent Reasoning**:
   - **Researcher** summarizes agricultural guidelines from MongoDB.
   - **Orchestrator** decides the action based on guidelines + weather + policy memory.
6. **Execution**: Decision is written to Firebase. ESP32 (in Eager Poll mode) executes the hardware action.

---

## 4. Key Performance Specs

- **Sensor Sync**: Every 40s (Demo mode) or on Delta change.
- **AI Latency**: ~3-7 seconds (Gemini/SaoLa reasoning time).
- **Communication Latency**: Sub-second (Firebase Realtime Bus).
- **Response Latency**: <15s (ESP32 Eager Polling).
