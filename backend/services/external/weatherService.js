/**
 * Weather Service - Open-Meteo API Integration
 * 
 * Features:
 * - Free API (no API key needed)
 * - Hourly forecasts (precipitation, temperature, humidity)
 * - Daily forecasts (rainfall sum)
 * - Current conditions
 * - 5-minute caching
 * - Auto-fallback to defaults
 * 
 * API: https://open-meteo.com
 */

const https = require('https');
const NodeCache = require('node-cache');

// Cache for 5 minutes (300 seconds)
const cache = new NodeCache({ stdTTL: 300 });
const CACHE_KEY = 'weather_data';

const STATION_LAT = parseFloat(process.env.STATION_LAT || 10.18);
const STATION_LON = parseFloat(process.env.STATION_LON || 105.48);
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

/**
 * Fetch weather from Open-Meteo API
 * @returns {Promise<Object>} { temperature, rainfall_24h, humidity, tide_status }
 */
async function fetchWeatherData() {
    // Check cache first
    const cached = cache.get(CACHE_KEY);
    if (cached) {
        console.log('[Weather] Using cached data');
        return cached;
    }

    try {
        const data = await fetchOpenMeteoData();
        const processed = processWeatherResponse(data);
        
        // Cache it
        cache.set(CACHE_KEY, processed);
        console.log(`[Weather] Fetched: temp=${processed.temperature}°C, rain_24h=${processed.rainfall_24h}mm, humidity=${processed.humidity}%`);
        
        return processed;

    } catch (err) {
        console.error('[Weather] Fetch error:', err.message);
        const error = new Error(`Open-Meteo unavailable: ${err.message}`);
        error.status = 503;
        error.payload = {
            error: 'External Data Unavailable',
            details: 'Live weather data is unavailable from Open-Meteo.',
            provider: 'OPEN_METEO',
        };
        throw error;
    }
}

/**
 * Fetch from Open-Meteo HTTPS API
 */
function fetchOpenMeteoData() {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            latitude: STATION_LAT,
            longitude: STATION_LON,
            current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code',
            hourly: 'precipitation_probability,precipitation,temperature_2m',
            daily: 'precipitation_sum,weather_code',
            timezone: TIMEZONE,
            forecast_days: 3
        });

        const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

        https.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON from Open-Meteo'));
                }
            });
        }).on('error', reject).setTimeout(5000, function() {
            this.destroy();
            reject(new Error('Open-Meteo request timeout'));
        });
    });
}

/**
 * Process Open-Meteo response
 */
function processWeatherResponse(data) {
    try {
        const current = data.current || {};
        const hourly = data.hourly || {};
        const daily = data.daily || {};

        // Current conditions
        const temperature = Math.round(current.temperature_2m || 32);
        const humidity = Math.round(current.relative_humidity_2m || 60);
        const weatherCode = current.weather_code || 0;
        const weather = mapWeatherCodeToText(weatherCode);

        // Next 24h rainfall (sum of hourly precipitation for next 24 values)
        let rainfall_24h = 0;
        if (hourly.precipitation && Array.isArray(hourly.precipitation)) {
            // Take first 24 hourly values
            rainfall_24h = hourly.precipitation.slice(0, 24).reduce((sum, val) => sum + (val || 0), 0);
            rainfall_24h = Math.round(rainfall_24h * 10) / 10; // 1 decimal place
        }

        // Infer tide status from weather code + precipitation
        const tideStatus = inferTideStatus(weatherCode, rainfall_24h, current.precipitation);

        return {
            temperature,
            humidity,
            rainfall_24h,
            weather,
            tide_status: tideStatus,
            weather_code: weatherCode,
            source: 'OPEN_METEO',
            timestamp: new Date().toISOString(),
        };

    } catch (err) {
        console.error('[Weather] Processing error:', err.message);
        throw err;
    }
}

function mapWeatherCodeToText(weatherCode) {
    if (weatherCode === 0) return 'Clear';
    if ([1, 2, 3].includes(weatherCode)) return 'Cloudy';
    if ([45, 48].includes(weatherCode)) return 'Fog';
    if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return 'Rain';
    if (weatherCode >= 95) return 'Thunderstorm';
    return 'Unknown';
}

/**
 * Map WMO Weather Code to tide status
 * https://www.open-meteo.com/en/docs
 * 
 * 0 = Clear, 1-3 = Cloudy, 45-48 = Foggy
 * 51-67 = Drizzle, 80-82 = Rain showers, 85-86 = Snow showers
 * 71-77, 80-82 = Rain, 95-99 = Thunderstorm
 */
function inferTideStatus(weatherCode, rainfall_24h, currentPrecip) {
    // Thunderstorm or heavy rain = rising tide (storm surge)
    if (weatherCode >= 95 || (weatherCode >= 80 && rainfall_24h > 10)) {
        return 'RISING';  // Storm tide
    }

    // Moderate/light rain = some water influx
    if (weatherCode >= 51 || rainfall_24h > 2) {
        return 'RISING';  // More freshwater
    }

    // Clear/calm weather with no rain = receding
    if (weatherCode === 0 && rainfall_24h < 0.5) {
        return 'FALLING';  // Tide going out
    }

    // Default to shifting
    return 'FALLING';
}

/**
 * Default weather (fallback)
 */
function getDefaultWeather() {
    return {
        temperature: 32,
        humidity: 60,
        rainfall_24h: 0,
        tide_status: 'FALLING',
        weather_code: 0,
        source: 'DEFAULT',
        timestamp: new Date().toISOString(),
    };
}

/**
 * Manual weather override (for testing/simulation)
 */
function setManualWeather(overrides = {}) {
    const manual = { ...getDefaultWeather(), ...overrides, source: 'MANUAL' };
    cache.set(CACHE_KEY, manual);
    console.log('[Weather] Manual override set:', manual);
    return manual;
}

module.exports = {
    fetchWeatherData,
    getDefaultWeather,
    setManualWeather,
};
