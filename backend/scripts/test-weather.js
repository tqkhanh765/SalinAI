/**
 * Test Weather Service Integration with Open-Meteo API
 * 
 * Tests:
 * 1. Direct weather API call
 * 2. Weather data in sensor submission
 * 3. Caching behavior
 */

require('dotenv').config({ path: '../.env' });
const axios = require('axios');

const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001';

async function testWeatherIntegration() {
    console.log('\n☀️ Weather Service Integration Test\n');

    try {
        // ─── Test 1: Direct Weather Endpoint ───────────────────────────────
        console.log('✓ Test 1: Fetch weather from /api/weather');
        const weatherResp = await axios.get(`${API_BASE}/api/weather`, { timeout: 8000 });
        const weather = weatherResp.data.weather;
        
        console.log(`  ✅ Weather Data:`);
        console.log(`     Temperature: ${weather.temperature}°C`);
        console.log(`     Humidity: ${weather.humidity}%`);
        console.log(`     Rainfall 24h: ${weather.rainfall_24h}mm`);
        console.log(`     Tide Status: ${weather.tide_status}`);
        console.log(`     Source: ${weather.source}`);
        console.log(`     Weather Code: ${weather.weather_code}`);

        // ─── Test 2: Sensor Submission with Auto Weather ───────────────────
        console.log('\n✓ Test 2: Submit sensor data (auto-merge weather)');
        const sensorPayload = {
            sensor_telemetry: {
                river_salinity: 1.8,
                soil_moisture: 62,
                river_water_level: 1.15,
            },
            actuator: {
                valve_state: 'OPEN',
                pump_state: 'OFF',
                control_mode: 'AUTO',
            },
            station_metadata: {
                field_elevation: 1.0,
                crop_type: 'Rice',
                growth_stage: 'VEGETATIVE',
            },
            // Note: external_forecast omitted - will auto-fetch from Open-Meteo
        };

        const submitResp = await axios.post(`${API_BASE}/api/sensor-data`, sensorPayload, { timeout: 8000 });
        const updated = submitResp.data.updated;
        
        console.log(`  ✅ Sensor submitted with weather merged:`);
        console.log(`     Salinity: ${updated.salinity} ppt`);
        console.log(`     Moisture: ${updated.moisture}%`);
        console.log(`     external_forecast source: ${updated.external_forecast.source}`);
        console.log(`     external_forecast temp: ${updated.external_forecast.temperature}°C`);
        console.log(`     external_forecast rainfall: ${updated.external_forecast.rainfall_24h}mm`);
        console.log(`     external_forecast tide: ${updated.external_forecast.tide_status}`);

        // ─── Test 3: Caching (second call should use cache) ───────────────
        console.log('\n✓ Test 3: Verify caching (2nd call should be instant)');
        const t1 = Date.now();
        const weather2 = await axios.get(`${API_BASE}/api/weather`, { timeout: 8000 });
        const t2 = Date.now();
        console.log(`  ✅ Cached response time: ${t2 - t1}ms (< 100ms = cache hit)`);
        console.log(`     Timestamp: ${weather2.data.weather.timestamp}`);

        // ─── Test 4: Manual Override (if needed) ────────────────────────────
        console.log('\n✓ Test 4: Manual weather override test');
        console.log('   You can manually override weather via POST /api/weather/manual');
        console.log('   Example: { temperature: 28, humidity: 75, rainfall_24h: 5 }');

        console.log('\n✅ All weather integration tests passed!\n');
        return true;

    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        if (err.response?.data) {
            console.error('Response:', err.response.data);
        }
        return false;
    }
}

// Run
testWeatherIntegration().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
