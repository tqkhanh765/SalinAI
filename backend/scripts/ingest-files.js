require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const pdfParse = require('pdf-parse');

const URI = process.env.MONGODB_URI;
const DATA_DIR = path.join(__dirname, '../data/knowledge_base');

function sanitizeIngestText(text) {
  if (!text) return "";

  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, ' ')
    .replace(/[\uFFFD]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function ingestFiles() {
  const client = new MongoClient(URI);
  
  try {
    await client.connect();
    const collection = client.db("salinai").collection("guideline_documents");
    
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    });

    // Check if folder exists
    if (!fs.existsSync(DATA_DIR)) {
        console.log("No data folder found. Please put .txt files in backend/data/knowledge_base");
        return;
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.pdf'));
    
    if (files.length === 0) {
        console.log("No text or PDF files found to process.");
        return;
    }

    console.log(`⏳ Found ${files.length} paper(s). Processing text into AI Vectors...`);

    // 1. CHUNKING: Split large documents into small contextual chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    for (const file of files) {
        let rawContent = "";
        
        if (file.endsWith('.pdf')) {
            console.log(`📄 Extracting text from PDF: ${file}`);
            const dataBuffer = fs.readFileSync(path.join(DATA_DIR, file));
            const pdfData = await pdfParse(dataBuffer);
          rawContent = sanitizeIngestText(pdfData.text);
        } else {
            console.log(`📝 Extracting text from document: ${file}`);
          rawContent = sanitizeIngestText(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        }
        
        if (!rawContent || rawContent.trim().length === 0) {
             console.log(`⚠️ Skipped ${file} (No readable text found)`);
             continue;
        }
        
        // Split text
        const chunks = await splitter.splitText(rawContent);
        console.log(`✂️ Chunked ${file} into ${chunks.length} pieces.`);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunkContent = chunks[i];
            
            // 2. VECTOR EMBEDDING: Translate math vectors
            const vector = await embeddings.embedQuery(chunkContent);
            
            // 3. SAVE TO VECTOR DB
            await collection.updateOne(
                { _id: `paper-${file}-chunk-${i}` },
                { 
                   $set: { 
                       title: `Ingested Paper: ${file} (Part ${i+1})`, 
                       content: chunkContent, 
                       embedding: vector,
                       source_ref: "FILE_UPLOAD",
                       crop_stage: "ALL" 
                   } 
                },
                { upsert: true }
            );
            
            // Wait 2.5 seconds to avoid Gemini API Rate Limits!
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
        console.log(`✅ Saved all chunks for: ${file}`);
    }

    console.log("🎉 Ingestion complete!");

  } catch (error) {
    console.error("❌ Error during ingestion:", error);
  } finally {
    await client.close();
  }
}

ingestFiles();
