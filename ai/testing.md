# Testing Strategy & Edge Cases

When implementing features, ensure the following test cases pass:

## 1. System Prompt Constraints
- **Test Case 1 (Safe):** Salinity = 1.0 ppt. AI MUST NOT trigger the valve close tool. Log should say "Safe".
- **Test Case 2 (Danger - Salinity):** Salinity = 2.5 ppt. AI MUST instantly trigger `execute_valve_control` with "CLOSED".
- **Test Case 3 (Danger - Weather):** Salinity = 1.5 ppt, but `check_weather` returns "Storm". AI MUST trigger `execute_valve_control` with "CLOSED" (proactive defense).

## 2. Manual Override (State Locking)
- **Condition:** User clicks "Manual Override" on Dashboard -> `control_mode` set to "MANUAL".
- **Test:** Push salinity to 5.0 ppt via Simulator.
- **Expected Result:** Backend listener MUST ignore the change. The AI MUST NOT be triggered. The valve MUST NOT change state automatically.

## 3. Real-time Latency
- The full loop from Simulator push to Dashboard UI update MUST be completed in under 3 seconds. Avoid unnecessary `await` delays or infinite polling loops.