/**
 * Performance Dashboard Route
 * 
 * GET /api/performance - View guideline success rates
 * GET /api/performance/report - Detailed outcome evaluation report
 */

const express = require("express");
const router = express.Router();
const { getDb } = require("../config/mongodb");
const { evaluateOutcomes } = require("../services/outcomeService");

/**
 * GET /api/performance
 * Returns success rates for all guidelines
 */
router.get("/api/performance", async (req, res) => {
    try {
        const mongoDb = getDb();
        if (!mongoDb) {
            return res.status(503).json({ error: "MongoDB unavailable" });
        }

        const guidelines = await mongoDb.collection("guideline_documents")
            .find({})
            .project({
                _id: 1,
                title: 1,
                crop_stage: 1,
                total_uses: 1,
                successful_uses: 1,
                success_rate: 1,
                last_evaluated: 1,
            })
            .toArray();

        // Calculate success rates
        const performance = guidelines.map(g => ({
            _id: g._id,
            title: g.title,
            crop_stage: g.crop_stage,
            total_uses: g.total_uses || 0,
            successful_uses: g.successful_uses || 0,
            success_rate: g.total_uses ? ((g.successful_uses / g.total_uses * 100).toFixed(1) + "%") : "N/A",
            last_evaluated: g.last_evaluated || "Never",
            status: getPerformanceStatus(g.successful_uses, g.total_uses),
        }));

        res.status(200).json({
            timestamp: new Date().toISOString(),
            total_guidelines: performance.length,
            performance,
        });

    } catch (err) {
        console.error("[Performance API] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/performance/report
 * Run evaluation and return recent outcomes
 */
router.get("/api/performance/report", async (req, res) => {
    try {
        // First, evaluate any pending 24+ hour old actions
        const evaluation = await evaluateOutcomes();

        const mongoDb = getDb();
        if (!mongoDb) {
            return res.status(503).json({ error: "MongoDB unavailable" });
        }

        // Get recent evaluated actions
        const recentActions = await mongoDb.collection("action_logs")
            .find({ "prediction.reward": { $ne: null } })
            .sort({ "prediction.evaluated_at": -1 })
            .limit(20)
            .project({
                action: 1,
                action_state: 1,
                reason: 1,
                created_at: 1,
                "prediction.expected_outcome": 1,
                "prediction.actual_outcome": 1,
                "prediction.reward": 1,
                "prediction.evaluated_at": 1,
                "retrieval.source_ids": 1,
            })
            .toArray();

        res.status(200).json({
            timestamp: new Date().toISOString(),
            evaluation_result: evaluation,
            recent_outcomes: recentActions,
        });

    } catch (err) {
        console.error("[Performance Report] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Helper: Determine performance status based on success rate
 */
function getPerformanceStatus(successful, total) {
    if (total === 0) return "NEVER_USED";
    const rate = successful / total;
    if (rate >= 0.8) return "EXCELLENT";
    if (rate >= 0.6) return "GOOD";
    if (rate >= 0.4) return "FAIR";
    return "POOR";
}

module.exports = router;
