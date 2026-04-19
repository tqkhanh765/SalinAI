const { connectMongoDB } = require('../config/mongodb');

async function checkStats() {
    const db = await connectMongoDB();
    if (!db) return;
    const count = await db.collection('guideline_documents').countDocuments({ _id: { $regex: '^paper-' } });
    console.log('Total Paper Chunks:', count);
    
    // List unique paper filenames
    const docs = await db.collection('guideline_documents').find({ _id: { $regex: '^paper-' } }).project({ _id: 1 }).toArray();
    const filenames = new Set();
    docs.forEach(doc => {
        const parts = doc._id.split('-chunk-');
        if (parts.length > 0) {
            filenames.add(parts[0].replace('paper-', ''));
        }
    });
    console.log('Existing Paper Files:', Array.from(filenames));
    process.exit(0);
}

checkStats();
