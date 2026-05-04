const request = require('supertest');
const express = require('express');
process.env.GOOGLE_API_KEY = "mock_key";

// Mock external dependencies
jest.mock('../config/firebase', () => ({
    ref: jest.fn().mockReturnThis(),
    once: jest.fn().mockResolvedValue({ val: () => ({}) }),
    update: jest.fn().mockResolvedValue({}),
    push: jest.fn().mockResolvedValue({ key: 'mock_log_id' }),
    set: jest.fn().mockResolvedValue({})
}));

jest.mock('../config/mongodb', () => ({
    getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
            insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock_id' }),
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            toArray: jest.fn().mockResolvedValue([])
        })
    })
}));

const farmRoute = require('../routes/farm');
const healthRoute = require('../routes/health');

const app = express();
app.use(express.json());
app.use(healthRoute);
app.use(farmRoute);

describe('API Integration Tests', () => {
    
    test('GET /api/health returns 200 OK', async () => {
        const response = await request(app).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('OK');
        expect(response.body).toHaveProperty('firebase');
        expect(response.body).toHaveProperty('mongodb');
    });

    test('POST /api/ingest rate limits correctly', async () => {
        const payload = {
            salinity: 4.5,
            moisture: 42,
            crop_stage: "VEGETATIVE"
        };
        const res = await request(app).post('/api/ingest').send(payload);
        expect(res.status).toBe(200);
    });
});
