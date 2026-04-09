# Product Requirements Document (PRD): SalinAI MVP

## 1. Product Vision
SalinAI is an autonomous Agentic AI system designed to protect agriculture in the Mekong Delta from sudden salinity intrusion. It continuously monitors environmental data and autonomously triggers water valves to close/open based on real-time salinity levels and weather forecasts.

## 2. Hackathon Constraints (CRITICAL)
- **NO Physical Hardware:** We use a React-based Web Simulator to mock ESP32 sensor data.
- **NO Vector Database (RAG):** We skip MongoDB for this MVP. AI logic relies strictly on **Context Stuffing** (System Prompting).
- **Time Constraint:** Must be highly optimized and bug-free. Prioritize the core Agentic Loop over UI aesthetics.

## 3. Core User Flow
1. **Simulation:** User (acting as the sensor) drags a salinity slider on the Simulator Page and clicks "Push Data".
2. **Perception:** Firebase Realtime DB updates instantly.
3. **Reasoning:** Node.js Backend detects the change and triggers the LangChain Agent (Gemini 2.5 Flash).
4. **Action:** If salinity >= 2 ppt (parts per thousand) or bad weather is forecasted, Gemini uses Function Calling to change the valve state to "CLOSED".
5. **Feedback:** The Dashboard Page instantly reflects the new valve state and displays the AI's reasoning log.