# Function Coverage Checklist (Backend)

Goal: verify each important function has real effect and is not dead code.

## A) Controllers
- [ ] `farmController.getFarmState` <- route `/api/farm-state`
- [ ] `farmController.streamFarmState` <- route `/api/farm-stream`
- [ ] `farmController.ingestData` <- route `/api/ingest`
- [ ] `farmController.updateControlMode` <- route `/api/control-mode`
- [ ] `farmController.overrideActuator` <- route `/api/override`
- [ ] `farmController.updateCropStage` <- route `/api/crop-stage`
- [ ] `farmController.submitDecisionFeedback` <- route `/api/decision-feedback`
- [ ] `farmController.getAgentPolicySummary` <- route `/api/policy-summary`

## B) AI Core Chain
- [ ] `langchain.runAgent` is called from ingest controller
- [ ] `retrievalService.executeRAGTool` is called in mandatory retrieval step
- [ ] `agentOrchestration.finalizeAction` is called after orchestration output
- [ ] `outcomeService.logActionWithPrediction` is called in finalizeAction
- [ ] `outcomeService.runAutonomousLearningCycle` is called in finalizeAction and scheduler

## C) Trigger / Ingestion
- [ ] `farmAiTriggerService.decideAiTrigger` controls AI trigger behavior
- [ ] `farmIngestValidationService.validateIngestPayload` rejects hardware default/error values
- [ ] `farmSensorIngestionService.ingestSensorPayload` writes Firebase + history
- [ ] `farmHistoryService.persistSensorHistoryPoint` stores historical points

## D) Feedback and Learning
- [ ] `outcomeService.evaluateOutcomes` updates `prediction.reward` and evaluated fields
- [ ] `outcomeService.upsertAutoFeedbackFromOutcome` prevents duplicate auto feedback
- [ ] `policyLearningService.saveDecisionFeedback` writes manual feedback
- [ ] `policyLearningService.refreshPolicySummary` runs after new feedback

## E) How to mark PASS/FAIL
Mark PASS only if:
1. There is at least one runtime path from endpoint/scheduler to function.
2. Side effect is visible in Firebase/MongoDB/log.
3. Negative path behaves correctly (invalid input, no-op, dedupe).

## F) Candidate Unused Review (manual)
For each exported function with no direct route call:
- classify as helper/internal
- verify it is referenced by at least one service
- if no reference and no framework hook: flag candidate-unused
