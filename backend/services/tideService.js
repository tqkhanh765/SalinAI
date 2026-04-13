/**
 * Tide Service - Infers tidal conditions from sensor data
 * 
 * Since Mekong Delta doesn't have real-time tide stations easily accessible,
 * we use water level trend + weather patterns to infer tide direction
 * 
 * Future: Integrate with NOAA or Vietnam hydrology station APIs
 */

const NodeCache = require('node-cache');
const fbdb = require("../config/firebase");

const cache = new NodeCache({ stdTTL: 600 }); // 10 min cache
const CACHE_KEY = 'tide_data';

/**
 * Infer tide status from water level trend + weather
 * @param {number} currentWaterLevel - Current river water level (meters)
 * @param {Object} weather - Weather data with rainfall, humidity
 * @returns {Promise<Object>} { tide_status, tide_direction, confidence, predicted_peak_time }
 */
async function inferTideStatus(currentWaterLevel, weather = {}) {
    try {
        // Get historical water level data (last few readings)
        const historicalRef = fbdb.ref("sensor_data_history").limitToLast(5);
        const snapshot = await historicalRef.once("value");
        const history = snapshot.val() || [];

        // Calculate water level trend
        const levels = history
            .filter(item => item && item.river_water_level)
            .map(item => item.river_water_level);

        let trendDirection = "STABLE";
        let confidence = 0.5;

        if (levels.length >= 2) {
            const recentLevel = levels[levels.length - 1];
            const olderLevel = levels[0];
            const delta = recentLevel - olderLevel;

            if (delta > 0.05) {
                trendDirection = "RISING";
                confidence = Math.min(0.95, 0.5 + (delta / 0.5));
            } else if (delta < -0.05) {
                trendDirection = "FALLING";
                confidence = Math.min(0.95, 0.5 + (Math.abs(delta) / 0.5));
            }
        }

        // Factor in weather: Heavy rain = higher tide potential
        const rainfall = weather.rainfall_24h || 0;
        if (rainfall > 30 && trendDirection === "RISING") {
            confidence = Math.min(0.99, confidence + 0.1);
        }

        // Mekong Delta typical tide cycle: 2 high tides, 2 low tides per day
        // High tides typically around 6:00, 18:00
        const now = new Date();
        const hours = now.getHours();
        const peakTimes = [6, 18]; // Approximate
        const nearPeak = peakTimes.some(t => Math.abs(hours - t) < 2);

        const tideData = {
            tide_status: trendDirection === "RISING" ? "RISING" : "FALLING",
            tide_direction: trendDirection,
            current_level: currentWaterLevel,
            confidence_score: Math.round(confidence * 100) / 100,
            near_peak_tide: nearPeak,
            source: "INFERRED_FROM_TREND_AND_WEATHER",
            timestamp: new Date().toISOString(),
        };

        cache.set(CACHE_KEY, tideData);
        return tideData;

    } catch (err) {
        console.error('[Tide] Inference error:', err.message);
        return getDefaultTide();
    }
}

/**
 * Default tide (fallback)
 */
function getDefaultTide() {
    return {
        tide_status: "FALLING",
        tide_direction: "STABLE",
        current_level: 1.2,
        confidence_score: 0.3,
        near_peak_tide: false,
        source: "DEFAULT",
        timestamp: new Date().toISOString(),
    };
}

/**
 * Get cached tide or infer new one
 */
async function getTideData(waterLevel, weather) {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
        console.log('[Tide] Using cached data');
        return cached;
    }

    return await inferTideStatus(waterLevel, weather);
}

module.exports = {
    inferTideStatus,
    getTideData,
    getDefaultTide,
};
