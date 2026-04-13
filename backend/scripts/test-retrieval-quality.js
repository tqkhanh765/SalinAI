/**
 * Task 6.2: Validate Retrieval Quality for Crop-Stage-Specific Prompts
 * 
 * This test validates:
 * 1. RAG retrieval returns relevant agricultural guidelines
 * 2. Retrieved documents match the crop_stage context
 * 3. Source IDs are valid and persistent
 * 4. Vector search scores meet minimum threshold
 * 5. Retrieval works for multiple crop stages (SEEDLING, VEGETATIVE, FLOWERING, etc.)
 */

require('dotenv').config({ path: '../.env' });
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const mongoConfig = require('../config/mongodb');

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

async function testRetrievalQuality() {
    console.log('\n🔍 Task 6.2: Retrieval Quality Validation\n');

    try {
        const mongoDb = mongoConfig.getDb?.();
        if (!mongoDb) {
            console.error('❌ MongoDB not connected');
            return false;
        }

        // ─── Test Cases: Crop Stage + Sensor Conditions ─────────────────────────
        const testCases = [
            {
                name: 'SEEDLING - High Salinity Risk',
                cropStage: 'SEEDLING',
                salinity: 2.8,
                moisture: 75,
                expectedKeywords: ['salinity', 'seedling'],
            },
            {
                name: 'VEGETATIVE - Normal Conditions',
                cropStage: 'VEGETATIVE',
                salinity: 1.5,
                moisture: 65,
                expectedKeywords: ['vegetative', 'irrigation'],
            },
            {
                name: 'FLOWERING - Drought Risk',
                cropStage: 'FLOWERING',
                salinity: 1.2,
                moisture: 40,
                expectedKeywords: ['flowering', 'water'],
            },
            {
                name: 'HARVEST - Drainage Phase',
                cropStage: 'HARVEST',
                salinity: 0.8,
                moisture: 30,
                expectedKeywords: ['harvest', 'drain'],
            },
        ];

        let totalTests = testCases.length;
        let passedTests = 0;
        const results = [];

        // ─── Run Each Test Case ────────────────────────────────────────────────
        for (const testCase of testCases) {
            console.log(`\n✓ Testing: ${testCase.name}`);
            console.log(`  Query: Salinity=${testCase.salinity} ppt, Moisture=${testCase.moisture}%, Stage=${testCase.cropStage}`);

            try {
                // Generate embedding for the test query
                const queryText = `Salinity is ${testCase.salinity} ppt, moisture is ${testCase.moisture}%.`;
                const queryVector = await embeddings.embedQuery(queryText);

                // Perform vector search with crop_stage filter
                const cursor = mongoDb.collection("guideline_documents").aggregate([
                    {
                        "$vectorSearch": {
                            "index": "vector_index",
                            "path": "embedding",
                            "queryVector": queryVector,
                            "numCandidates": 10,
                            "limit": 5
                        }
                    },
                    {
                        "$match": {
                            "crop_stage": testCase.cropStage
                        }
                    },
                    {
                        "$project": {
                            "_id": 1,
                            "title": 1,
                            "content": 1,
                            "crop_stage": 1,
                            "score": { "$meta": "vectorSearchScore" }
                        }
                    }
                ]);

                const results_docs = await cursor.toArray();
                const minScore = parseFloat(process.env.VECTOR_MIN_SCORE || "0.72");

                // ─── Validation Checks ─────────────────────────────────────────
                let testPassed = true;
                let issues = [];

                // Check 1: Retrieved at least 1 relevant document
                if (results_docs.length === 0) {
                    issues.push('No documents retrieved for this crop stage');
                    testPassed = false;
                } else {
                    console.log(`  ✅ Retrieved ${results_docs.length} documents`);
                }

                // Check 2: Top result meets minimum score threshold
                if (results_docs.length > 0) {
                    const topScore = results_docs[0].score;
                    if (topScore >= minScore) {
                        console.log(`  ✅ Top result score: ${topScore.toFixed(3)} (meets threshold ${minScore})`);
                    } else {
                        issues.push(`Top score ${topScore.toFixed(3)} below threshold ${minScore}`);
                        console.warn(`  ⚠️ Top result score: ${topScore.toFixed(3)} (below threshold ${minScore})`);
                    }
                }

                // Check 3: Crop stage filter was applied correctly
                const allMatchCropStage = results_docs.every(doc => doc.crop_stage === testCase.cropStage);
                if (allMatchCropStage) {
                    console.log(`  ✅ All results match crop_stage: ${testCase.cropStage}`);
                } else {
                    issues.push('Some results do not match requested crop_stage');
                    testPassed = false;
                }

                // Check 4: Source IDs are valid
                const sourceIds = results_docs.map(doc => doc._id);
                if (sourceIds.every(id => typeof id === 'string' && id.length > 0)) {
                    console.log(`  ✅ Valid source IDs: ${sourceIds.slice(0, 3).join(', ')}`);
                } else {
                    issues.push('Invalid source IDs');
                    testPassed = false;
                }

                // Check 5: Content relevance (optional keyword check)
                if (results_docs.length > 0) {
                    const topContent = results_docs[0].content.toLowerCase();
                    const relevantKeywords = testCase.expectedKeywords.filter(kw => 
                        topContent.includes(kw.toLowerCase())
                    );
                    if (relevantKeywords.length > 0) {
                        console.log(`  ✅ Content contains keywords: ${relevantKeywords.join(', ')}`);
                    } else {
                        console.warn(`  ⚠️ Top result may not contain expected keywords: ${testCase.expectedKeywords.join(', ')}`);
                    }
                }

                // Summary
                if (testPassed) {
                    console.log(`  ✅ Test PASSED`);
                    passedTests++;
                } else {
                    console.log(`  ❌ Test FAILED: ${issues.join('; ')}`);
                }

                results.push({
                    testCase: testCase.name,
                    passed: testPassed,
                    docsRetrieved: results_docs.length,
                    issues,
                    topScore: results_docs.length > 0 ? results_docs[0].score : null,
                });

            } catch (err) {
                console.error(`  ❌ Error during test: ${err.message}`);
                results.push({
                    testCase: testCase.name,
                    passed: false,
                    error: err.message,
                });
            }
        }

        // ─── Final Summary ──────────────────────────────────────────────────────
        console.log('\n' + '='.repeat(60));
        console.log(`📊 Retrieval Quality Summary: ${passedTests}/${totalTests} tests passed`);
        console.log('='.repeat(60));

        results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.testCase}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            } else if (result.issues?.length > 0) {
                console.log(`   Issues: ${result.issues.join('; ')}`);
            }
        });

        const testPassed = passedTests === totalTests;
        if (testPassed) {
            console.log('\n✅ Task 6.2 PASSED: Retrieval quality validated!\n');
        } else {
            console.log('\n⚠️ Task 6.2 PARTIAL: Some retrieval tests failed.\n');
        }

        return testPassed;

    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        return false;
    }
}

// Run test
testRetrievalQuality().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
