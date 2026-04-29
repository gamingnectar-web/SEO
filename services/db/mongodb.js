import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

export async function getDb() {
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }

  const connectedClient = await clientPromise;

  return connectedClient.db();
}

export async function getCollections() {
  const db = await getDb();

  return {
    auditRuns: db.collection("auditRuns")
  };
}

export async function ensureIndexes() {
  const { auditRuns } = await getCollections();

  await auditRuns.createIndex({ createdAt: -1 });
  await auditRuns.createIndex({ type: 1, createdAt: -1 });
  await auditRuns.createIndex({ "summary.averageScore": 1 });
}