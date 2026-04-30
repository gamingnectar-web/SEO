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
    auditRuns: db.collection("auditRuns"),
    auditTodos: db.collection("auditTodos")
  };
}

export async function ensureIndexes() {
  const { auditRuns, auditTodos } = await getCollections();

  await auditRuns.createIndex({ createdAt: -1 });
  await auditRuns.createIndex({ type: 1, createdAt: -1 });
  await auditRuns.createIndex({ "summary.averageScore": 1 });

  await auditTodos.createIndex({ auditRunId: 1, createdAt: -1 });
  await auditTodos.createIndex({ status: 1, updatedAt: -1 });
  await auditTodos.createIndex({ pageUrl: 1, category: 1, checkName: 1 });

  await auditTodos.createIndex(
    {
      auditRunId: 1,
      pageUrl: 1,
      category: 1,
      checkName: 1
    },
    {
      unique: true
    }
  );
}
