# Development Tasks (Hackathon Sprint)

## Phase 1: Infrastructure & UI 
- [ ] **Task 1.1:** Initialize Node.js Express server, setup CORS, and configure `firebase-admin` service account. Add `/api/health` endpoint.
- [ ] **Task 1.2:** Initialize Vite React app with Tailwind CSS. Setup Firebase Client SDK.
- [ ] **Task 1.3:** Build `Simulator.jsx` (Sliders for salinity/moisture, Push button) and `Dashboard.jsx` (Charts, Valve UI, Log list). Connect UI to read/write from Firebase.

## Phase 2: Agentic Core & Real-time Loop
- [ ] **Task 2.1:** In Backend, write `firebase-listener.js` to trigger a function whenever `sensor_data` changes. Implement early return if `control_mode === "MANUAL"`.
- [ ] **Task 2.2:** Setup LangChain and Gemini 2.5 Flash. Define the rigorous System Prompt injecting rules (Close valve if salinity >= 2 ppt or bad weather).
- [ ] **Task 2.3:** Implement `execute_valve_control` tool. Connect the listener trigger to the LangChain invoke method.
- [ ] **Task 2.4:** Test end-to-end real-time loop. Drag slider -> Backend triggers AI -> AI updates Firebase -> Dashboard UI updates instantly.

## Phase 3: Final Polish
- [ ] **Task 3.1:** Handle edge cases (Ensure AI responds with valid JSON tool calls, prevent hallucinated text).
- [ ] **Task 3.2:** Prettify Dashboard action logs (typing effect, status colors).