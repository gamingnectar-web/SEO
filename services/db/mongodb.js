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
    users: db.collection("users"),
    shops: db.collection("shops"),
    auditRuns: db.collection("auditRuns"),
    auditTodos: db.collection("auditTodos"),
    auditSnapshots: db.collection("auditSnapshots"),
    trackedKeywords: db.collection("trackedKeywords"),
    keywordSnapshots: db.collection("keywordSnapshots"),
    trackedCompetitors: db.collection("trackedCompetitors"),
    competitorSnapshots: db.collection("competitorSnapshots"),
    dashboardInsights: db.collection("dashboardInsights")
  };
}

export async function ensureIndexes() {
  const {
    users,
    shops,
    auditRuns,
    auditTodos,
    auditSnapshots,
    trackedKeywords,
    keywordSnapshots,
    trackedCompetitors,
    competitorSnapshots,
    dashboardInsights
  } = await getCollections();

  await users.createIndex({ email: 1 }, { unique: true, sparse: true });
  await users.createIndex({ createdAt: -1 });

  await shops.createIndex({ shop: 1 }, { unique: true, sparse: true });
  await shops.createIndex({ installedAt: -1 });

  await auditRuns.createIndex({ createdAt: -1 });
  await auditRuns.createIndex({ type: 1, createdAt: -1 });
  await auditRuns.createIndex({ ownerKey: 1, createdAt: -1 });
  await auditRuns.createIndex({ "summary.averageScore": 1 });

  await auditTodos.createIndex({ auditRunId: 1, createdAt: -1 });
  await auditTodos.createIndex({ ownerKey: 1, status: 1, updatedAt: -1 });
  await auditTodos.createIndex({ dueDate: 1, status: 1 });
  await auditTodos.createIndex({ pageUrl: 1, category: 1, checkName: 1 });
  await auditTodos.createIndex(
    { auditRunId: 1, pageUrl: 1, category: 1, checkName: 1 },
    { unique: true }
  );

  await auditSnapshots.createIndex({ ownerKey: 1, createdAt: -1 });
  await auditSnapshots.createIndex({ siteUrl: 1, createdAt: -1 });

  await trackedKeywords.createIndex({ ownerKey: 1, keyword: 1 }, { unique: true });
  await keywordSnapshots.createIndex({ ownerKey: 1, keyword: 1, createdAt: -1 });

  await trackedCompetitors.createIndex({ ownerKey: 1, domain: 1 }, { unique: true });
  await competitorSnapshots.createIndex({ ownerKey: 1, domain: 1, createdAt: -1 });

  await dashboardInsights.createIndex({ ownerKey: 1, createdAt: -1 });
}