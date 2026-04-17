/**
 * Outcome evaluation service.
 * Records predicted outcomes for each action, then scores those predictions later to measure long-term decision quality.
 */

const { getDb } = require("../../config/mongodb");
const fbdb = require("../../config/firebase");

const AUTO_FEEDBACK_SOURCE = "auto_outcome_evaluator";
const AUTO_REWARD_PASS_THRESHOLD = Number(process.env.AUTO_REWARD_PASS_THRESHOLD || "0.35");
const OUTCOME_EVAL_BATCH_SIZE = Math.max(10, parseInt(process.env.OUTCOME_EVAL_BATCH_SIZE || "80", 10));
const OUTCOME_RECHECK_INTERVAL_HOURS = Math.max(1, parseInt(process.env.OUTCOME_RECHECK_INTERVAL_HOURS || "6", 10));
const OUTCOME_MIN_ACTION_AGE_HOURS = Math.max(0, parseInt(process.env.OUTCOME_MIN_ACTION_AGE_HOURS || "1", 10));

const DEFAULT_STAGE_PROFILE = {
    moistureTarget: { min: 40, max: 80, ideal: 60 },
    salinityMaxSafe: 6.0,
    salinityDeltaTolerance: 0.5,
    weights: {
        moisture: 0.7,
        salinity: 0.3,
    },
};

const CROP_STAGE_PROFILES = {
    GERMINATION: {
        moistureTarget: { min: 55, max: 85, ideal: 70 },
        salinityMaxSafe: 4.0,
        salinityDeltaTolerance: 0.3,
        weights: { moisture: 0.8, salinity: 0.2 },
    },
    VEGETATIVE: {
        moistureTarget: { min: 45, max: 80, ideal: 62 },
        salinityMaxSafe: 5.0,
        salinityDeltaTolerance: 0.4,
        weights: { moisture: 0.75, salinity: 0.25 },
    },
    FLOWERING: {
        moistureTarget: { min: 50, max: 82, ideal: 66 },
        salinityMaxSafe: 4.5,
        salinityDeltaTolerance: 0.35,
        weights: { moisture: 0.78, salinity: 0.22 },
    },
    REPRODUCTIVE: {
        moistureTarget: { min: 48, max: 80, ideal: 64 },
        salinityMaxSafe: 4.8,
        salinityDeltaTolerance: 0.35,
        weights: { moisture: 0.76, salinity: 0.24 },
    },
    MATURITY: {
        moistureTarget: { min: 35, max: 70, ideal: 52 },
        salinityMaxSafe: 5.5,
        salinityDeltaTolerance: 0.5,
        weights: { moisture: 0.65, salinity: 0.35 },
    },
};

function getStageProfile(stage) {
    const key = String(stage || "").trim().toUpperCase();
    return CROP_STAGE_PROFILES[key] || DEFAULT_STAGE_PROFILE;
}

/**
 * Store an action together with its expected outcome so it can be evaluated later.
 */
async function logActionWithPrediction(action) {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return;

        const now = new Date();

        const enrichedAction = {
            ...action,
            timestamp: action.timestamp || now.toISOString(),
            prediction: {
                expected_moisture: calculateExpectedMoisture(action.state, action.sensor_snapshot),
                expected_salinity_trend: calculateExpectedSalinity(action.state, action.sensor_snapshot),
                expected_outcome: action.state === "CLOSED" ? "moisture_stable_or_increase" : "moisture_decrease_or_stable",
                
                // Will be filled in 24+ hours
                actual_moisture: null,
                actual_salinity: null,
                actual_outcome: null,
                reward: null,
                evaluated_at: null,
            },
            created_at: now,
            createdAt: now,
        };

        await mongoDb.collection("action_logs").insertOne(enrichedAction);
        return enrichedAction;

    } catch (err) {
        console.error('[Outcome] Failed to log action:', err.message);
    }
}

/**
 * Evaluate old actions against delayed outcomes.
 * Delay window is configurable via OUTCOME_MIN_ACTION_AGE_HOURS.
 */
async function evaluateOutcomes({ minActionAgeHours = OUTCOME_MIN_ACTION_AGE_HOURS } = {}) {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return { evaluated: 0, rewards: [] };

        // Find un-evaluated actions that are old enough for a reliable outcome check
        const minimumAge = Math.max(0, Number(minActionAgeHours || 0));
        const oneDayAgo = new Date(Date.now() - minimumAge * 60 * 60 * 1000);
        
        const recheckBefore = new Date(Date.now() - OUTCOME_RECHECK_INTERVAL_HOURS * 60 * 60 * 1000);

        const pendingFilter = {
            $or: [
                { "prediction.reward": null },
                { "prediction.reward": { $exists: false } },
            ],
        };

        const oldActions = await mongoDb.collection("action_logs")
            .find({
                $and: [
                    pendingFilter,
                    {
                        $or: [
                            { created_at: { $lt: oneDayAgo } },
                            { createdAt: { $lt: oneDayAgo } },
                            { timestamp: { $lt: oneDayAgo.toISOString() } },
                        ],
                    },
                    {
                        $or: [
                            { "prediction.last_check_at": { $exists: false } },
                            { "prediction.last_check_at": { $lt: recheckBefore } },
                        ],
                    },
                ],
            })
            .limit(OUTCOME_EVAL_BATCH_SIZE)
            .toArray();

        const totalPending = await mongoDb.collection("action_logs").countDocuments(pendingFilter);
        const awaitingWindow = Math.max(0, totalPending - oldActions.length);
        console.log(`[Outcome] Found ${oldActions.length} actions to evaluate (awaiting window: ${awaitingWindow}, delay=${minimumAge}h)`);

        const results = [];

        for (const action of oldActions) {
            try {
                // Get sensor data at that time
                const actionTime = action.created_at || action.createdAt || (action.timestamp ? new Date(action.timestamp) : null);
                const actionTimeValue = actionTime instanceof Date ? actionTime : new Date(actionTime);
                if (!actionTimeValue || Number.isNaN(actionTimeValue.getTime())) {
                    console.log(`[Outcome] Skipping ${action._id} because action time is missing or invalid`);
                    continue;
                }
                const sensorAfterDelay = await getSensorDataNearTime(new Date(actionTimeValue.getTime() + minimumAge * 60 * 60 * 1000));

                if (!sensorAfterDelay) {
                    console.log(`[Outcome] No sensor data found for evaluation of ${action._id}`);
                    await mongoDb.collection("action_logs").updateOne(
                        { _id: action._id },
                        {
                            $set: {
                                "prediction.last_check_at": new Date(),
                            },
                            $inc: {
                                "prediction.check_attempts": 1,
                            },
                        }
                    );
                    continue;
                }

                // Compare prediction vs actual
                const reward = calculateReward(
                    action.prediction,
                    sensorAfterDelay,
                    action.sensor_snapshot
                );

                // Update action with outcome
                await mongoDb.collection("action_logs").updateOne(
                    { _id: action._id },
                    {
                        $set: {
                            "prediction.actual_moisture": sensorAfterDelay.moisture,
                            "prediction.actual_salinity": sensorAfterDelay.salinity,
                            "prediction.reward": reward,
                            "prediction.evaluated_at": new Date(),
                            "prediction.last_check_at": new Date(),
                        }
                    }
                );

                // Update guideline success rate
                if (action.retrieval?.source_ids?.length > 0) {
                    await updateGuidelineSuccessRate(action.retrieval.source_ids[0], reward);
                }

                results.push({
                    action_id: action._id,
                    action: action.action,
                    reward,
                    source_ids: action.retrieval?.source_ids || [],
                    reason: action.reason || "",
                    sensor_snapshot: action.sensor_snapshot || {},
                    actual_sensor: {
                        salinity: sensorAfterDelay.salinity,
                        moisture: sensorAfterDelay.moisture,
                    },
                    evaluated_at: new Date(),
                });

            } catch (err) {
                console.error(`[Outcome] Error evaluating ${action._id}:`, err.message);
            }
        }

        return { evaluated: results.length, rewards: results };

    } catch (err) {
        console.error('[Outcome] Evaluation error:', err.message);
        return { evaluated: 0, rewards: [], error: err.message };
    }
}

function suggestCorrectedAction({ sensor_snapshot = {}, actual_sensor = {} } = {}) {
    const currentMoisture = Number(sensor_snapshot?.moisture || 0);
    const currentSalinity = Number(sensor_snapshot?.salinity || 0);
    const afterMoisture = Number(actual_sensor?.moisture || currentMoisture);
    const stageProfile = getStageProfile(sensor_snapshot?.crop_stage);
    const moistureMin = stageProfile.moistureTarget.min;
    const salinityMaxSafe = stageProfile.salinityMaxSafe;

    if (afterMoisture < moistureMin && currentSalinity <= salinityMaxSafe) {
        return "OPEN";
    }

    if (currentSalinity > salinityMaxSafe) {
        return "CLOSED";
    }

    return currentMoisture < moistureMin ? "OPEN" : "NO_ACTION";
}

async function upsertAutoFeedbackFromOutcome(result) {
    const mongoDb = getDb();
    if (!mongoDb) return { inserted: false, skipped: true, reason: "mongodb_offline" };

    const actionLogId = String(result?.action_id || "");
    if (!actionLogId) return { inserted: false, skipped: true, reason: "missing_action_id" };

    const existing = await mongoDb.collection("decision_feedback").findOne({
        action_log_id: actionLogId,
        feedback_source: AUTO_FEEDBACK_SOURCE,
    });

    if (existing) {
        return { inserted: false, skipped: true, reason: "already_exists" };
    }

    const reward = Number(result?.reward || 0);
    const verdict = reward >= AUTO_REWARD_PASS_THRESHOLD ? "correct" : "incorrect";
    const correctedAction = verdict === "incorrect" ? suggestCorrectedAction(result) : null;

    const feedbackDoc = {
        action_log_id: actionLogId,
        verdict,
        notes: `Auto-evaluated after delayed outcome check (reward=${reward.toFixed(2)}).`,
        corrected_action: correctedAction,
        action: result?.action ? String(result.action).toUpperCase() : null,
        reason: String(result?.reason || "").trim(),
        sensor_snapshot: result?.sensor_snapshot || {},
        source_ids: Array.isArray(result?.source_ids) ? result.source_ids : [],
        feedback_source: AUTO_FEEDBACK_SOURCE,
        auto_evaluation: {
            reward,
            threshold: AUTO_REWARD_PASS_THRESHOLD,
            actual_sensor: result?.actual_sensor || {},
            evaluated_at: result?.evaluated_at || new Date(),
        },
        created_at: new Date(),
    };

    await mongoDb.collection("decision_feedback").insertOne(feedbackDoc);
    return { inserted: true, skipped: false };
}

async function runAutonomousLearningCycle(options = {}) {
    const outcomeResult = await evaluateOutcomes(options);
    const rewards = Array.isArray(outcomeResult?.rewards) ? outcomeResult.rewards : [];

    let inserted = 0;
    let skipped = 0;

    for (const rewardItem of rewards) {
        const status = await upsertAutoFeedbackFromOutcome(rewardItem);
        if (status.inserted) inserted += 1;
        if (status.skipped) skipped += 1;
    }

    if (inserted > 0) {
        const { refreshPolicySummary } = require("./policyLearningService");
        await refreshPolicySummary();
    }

    try {
        const currentLoopSnapshot = (await fbdb.ref("ai_status/feedback_loop").once("value")).val() || {};
        const feedbackState = {
            status: outcomeResult.evaluated > 0 ? "EVALUATED" : "PENDING_OUTCOME",
            last_cycle_at: new Date().toISOString(),
            evaluated: Number(outcomeResult?.evaluated || 0),
            feedback_inserted: inserted,
            feedback_skipped: skipped,
            min_action_age_hours: Number(options?.minActionAgeHours ?? OUTCOME_MIN_ACTION_AGE_HOURS),
        };

        await fbdb.ref("ai_status").update({
            feedback_loop: {
                ...currentLoopSnapshot,
                ...feedbackState,
            },
        });
    } catch (err) {
        console.error('[Outcome] Failed to publish feedback loop state:', err.message);
    }

    return {
        evaluated: Number(outcomeResult?.evaluated || 0),
        feedbackInserted: inserted,
        feedbackSkipped: skipped,
    };
}

/**
 * Get sensor data closest to a specific time
 */
async function getSensorDataNearTime(targetTime) {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return null;

        // Find sensor data within 2 hours of target time
        const before = new Date(targetTime.getTime() - 2 * 60 * 60 * 1000);
        const after = new Date(targetTime.getTime() + 2 * 60 * 60 * 1000);

        const data = await mongoDb.collection("sensor_history")
            .find({
                timestamp: { $gte: before.toISOString(), $lte: after.toISOString() }
            })
            .sort({ timestamp: 1 })
            .limit(1)
            .toArray();

        return data[0] || null;

    } catch (err) {
        return null;
    }
}

/**
 * Calculate reward: +1 for success, -1 for failure, 0 for neutral
 */
function calculateReward(prediction, actual, initial) {
    const stage = initial?.crop_stage || initial?.stage || "UNKNOWN";
    const profile = getStageProfile(stage);
    const { moistureTarget, salinityDeltaTolerance, salinityMaxSafe, weights } = profile;

    let moistureScore = 0;
    const moistureInRange = actual.moisture >= moistureTarget.min && actual.moisture <= moistureTarget.max;
    const moistureDistanceBefore = Math.abs(Number(initial.moisture || moistureTarget.ideal) - moistureTarget.ideal);
    const moistureDistanceAfter = Math.abs(Number(actual.moisture || moistureTarget.ideal) - moistureTarget.ideal);

    if (moistureInRange) {
        moistureScore += 1;
    }

    if (moistureDistanceAfter < moistureDistanceBefore) {
        moistureScore += 0.5;
    } else if (moistureDistanceAfter > moistureDistanceBefore + 5) {
        moistureScore -= 0.8;
    }

    let salinityScore = 0;
    const salinityDelta = Number(actual.salinity || 0) - Number(initial.salinity || 0);
    const salinityStayedSafe = Number(actual.salinity || 0) <= salinityMaxSafe;

    if (salinityStayedSafe) {
        salinityScore += 0.7;
    } else {
        salinityScore -= 0.7;
    }

    if (salinityDelta <= salinityDeltaTolerance) {
        salinityScore += 0.3;
    } else {
        salinityScore -= 0.5;
    }

    const rawReward = moistureScore * weights.moisture + salinityScore * weights.salinity;
    return Math.max(-1, Math.min(1, Number(rawReward.toFixed(3))));
}

/**
 * Update guideline success rate in MongoDB
 */
async function updateGuidelineSuccessRate(sourceId, reward) {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return;

        // Increment total uses and success count
        const increment = reward > 0 ? 1 : 0;
        
        await mongoDb.collection("guideline_documents").updateOne(
            { _id: sourceId },
            {
                $inc: {
                    total_uses: 1,
                    successful_uses: increment,
                },
                $set: {
                    success_rate: 0, // Will be calculated in query
                    last_evaluated: new Date(),
                }
            }
        );

        console.log(`[Outcome] Updated ${sourceId}: reward=${reward}`);

    } catch (err) {
        console.error(`[Outcome] Failed to update guideline ${sourceId}:`, err.message);
    }
}

/**
 * Expected moisture after action
 */
function calculateExpectedMoisture(valveState, sensor) {
    const current = sensor?.moisture || 60;
    
    if (valveState === "CLOSED") {
        // Expect moisture to stay or increase (no irrigation)
        return Math.min(100, current + 5);
    } else {
        // Expect moisture to decrease (irrigation happening)
        return Math.max(0, current - 10);
    }
}

/**
 * Expected salinity trend after action
 */
function calculateExpectedSalinity(valveState, sensor) {
    const current = sensor?.salinity || 1.5;
    
    if (valveState === "CLOSED") {
        // Expect salinity to stabilize or increase (no fresh water)
        return current + 0.2;
    } else {
        // Expect salinity to decrease (fresh water intake)
        return Math.max(0, current - 0.3);
    }
}

module.exports = {
    logActionWithPrediction,
    evaluateOutcomes,
    runAutonomousLearningCycle,
    calculateReward,
    getSensorDataNearTime,
};
