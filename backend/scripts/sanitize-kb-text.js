require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

function sanitizeText(text) {
  if (!text) return '';

  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, ' ')
    .replace(/[\uFFFD]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function run() {
  if (!uri) {
    throw new Error('MONGODB_URI is missing in .env');
  }

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const collection = client.db('salinai').collection('guideline_documents');
    const cursor = collection.find({}, { projection: { _id: 1, title: 1, content: 1 } });

    let total = 0;
    let updated = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      total += 1;

      const cleanTitle = sanitizeText(doc.title);
      const cleanContent = sanitizeText(doc.content);

      if (cleanTitle !== (doc.title || '') || cleanContent !== (doc.content || '')) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { title: cleanTitle, content: cleanContent } }
        );
        updated += 1;
      }
    }

    console.log(`Sanitized documents: ${updated}/${total}`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('Sanitize KB failed:', err.message);
  process.exit(1);
});
