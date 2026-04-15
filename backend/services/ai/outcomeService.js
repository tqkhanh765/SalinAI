/**
 * Outcome Service - Reviews decisions 24+ hours after action
 * 
 * Flow:
 * 1. Agent makes decision → logs prediction (expected moisture, salinity trend)
 * 2. 24 hours later → Compare actual vs predicted
 * 3. Calculate reward (+1 success, -1 failure)
 * 4. Update guideline success rate
 * 5. Inform next agent decisions
 */

const { getDb } = require("../../config/mongodb");
const fbdb = require("../../config/firebase");

/**
 * Log action with predictions for later evaluation
 * Called by orchestrator after valve control
 */
async function logActionWithPrediction(action) {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return;

        const enrichedAction = {
            ...action,
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
            created_at: new Date(),
        };

        await mongoDb.collection("action_logs").insertOne(enrichedAction);
        return enrichedAction;

    } catch (err) {
        console.error('[Outcome] Failed to log action:', err.message);
    }
}

/**
 * Evaluate old actions (24+ hours old) against actual outcomes
 * Should be called periodically (e.g., every 6 hours)
 */
async function evaluateOutcomes() {
    try {
        const mongoDb = getDb();
        if (!mongoDb) return { evaluated: 0, rewards: [] };

        // Find un-evaluated actions that are 24+ hours old
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const oldActions = await mongoDb.collection("action_logs")
            .find({
                created_at: { $lt: oneDayAgo },
                "prediction.reward": null  // Not yet evaluated
            })
            .toArray();

        console.log(`[Outcome] Found ${oldActions.length} actions to evaluate`);

        const results = [];

        for (const action of oldActions) {
            try {
                // Get sensor data at that time
                const actionTime = action.created_at;
                const sensor24hAfter = await getSensorDataNearTime(new Date(actionTime.getTime() + 24 * 60 * 60 * 1000));

                if (!sensor24hAfter) {
                    console.log(`[Outcome] No sensor data found for evaluation of ${action._id}`);
                    continue;
                }

                // Compare prediction vs actual
                const reward = calculateReward(
                    action.prediction,
                    sensor24hAfter,
                    action.sensor_snapshot
                );

                // Update action with outcome
                await mongoDb.collection("action_logs").updateOne(
                    { _id: action._id },
                    {
                        $set: {
                            "prediction.actual_moisture": sensor24hAfter.moisture,
                            "prediction.actual_salinity": sensor24hAfter.salinity,
                            "prediction.reward": reward,
                            "prediction.evaluated_at": new Date(),
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

        const data = await mongoDb.collection("sensor_logs")
            .findOne({
                timestamp: { $gte: before, $lte: after }
            });

        return data;

    } catch (err) {
        return null;
    }
}

/**
 * Calculate reward: +1 for success, -1 for failure, 0 for neutral
 */
function calculateReward(prediction, actual, initial) {
    let reward = 0;

    // Moisture target: 40-80% is healthy
    const targetMoistureMin = 40;
    const targetMoistureMax = 80;
    
    const moistureInRange = actual.moisture >= targetMoistureMin && actual.moisture <= targetMoistureMax;
    const moistureWorsened = Math.abs(actual.moisture - 60) > Math.abs(initial.moisture - 60) + 10;

    if (moistureInRange && !moistureWorsened) {
        reward += 1;  // ✅ Moisture is healthy
    } else if (moistureWorsened) {
        reward -= 1;  // ❌ Action made it worse
    }

    // Salinity trend: Should not increase unexpectedly
    const salinityIncreased = actual.salinity > initial.salinity + 0.5;
    if (!salinityIncreased) {
        reward += 0.5;  // ✅ Salinity stable or decreased
    } else {
        reward -= 0.5;  // ⚠️ Salinity increased
    }

    // Normalize to -1, 0, +1
    return Math.max(-1, Math.min(1, reward));
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
    calculateReward,
    getSensorDataNearTime,
};
