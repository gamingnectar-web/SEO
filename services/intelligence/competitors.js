import { getCollections } from "../db/mongodb.js";
import { auditMultipleUrls } from "../audit/crawler.js";

export async function seedDefaultCompetitors(ownerKey) {
  const domains = String(process.env.DEFAULT_COMPETITORS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const domain of domains) {
    await upsertTrackedCompetitor({ ownerKey, domain });
  }
}

export async function upsertTrackedCompetitor({ ownerKey, domain, urls = [] }) {
  const { trackedCompetitors } = await getCollections();
  const cleanDomain = normaliseDomain(domain);
  const now = new Date();

  await trackedCompetitors.updateOne(
    { ownerKey, domain: cleanDomain },
    {
      $set: {
        ownerKey,
        domain: cleanDomain,
        urls: Array.isArray(urls) ? urls.filter(Boolean).slice(0, 25) : [],
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

export async function getTrackedCompetitors(ownerKey) {
  const { trackedCompetitors } = await getCollections();
  return trackedCompetitors.find({ ownerKey }).sort({ domain: 1 }).toArray();
}

export async function runCompetitorSnapshot(ownerKey) {
  const { competitorSnapshots } = await getCollections();
  const competitors = await getTrackedCompetitors(ownerKey);
  const now = new Date();
  const docs = [];

  for (const competitor of competitors) {
    const urls = competitor.urls?.length ? competitor.urls : [`https://${competitor.domain}`];
    const results = await auditMultipleUrls(urls.slice(0, 5));
    const averageScore = average(results.map((item) => item.overallScore));
    const averageLinkScore = average(results.map((item) => item.categoryScores?.linking));
    const averageGeoScore = average(results.map((item) => item.categoryScores?.geo));

    docs.push({
      ownerKey,
      domain: competitor.domain,
      urls,
      pageCount: results.length,
      averageScore,
      averageLinkScore,
      averageGeoScore,
      strongestPage: results.slice().sort((a, b) => Number(b.overallScore || 0) - Number(a.overallScore || 0))[0] || null,
      createdAt: now
    });
  }

  if (docs.length) {
    await competitorSnapshots.insertMany(docs);
  }

  return summariseCompetitors(docs);
}

export async function getCompetitorDashboard(ownerKey, limit = 50) {
  const { competitorSnapshots } = await getCollections();
  return competitorSnapshots
    .find({ ownerKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

function summariseCompetitors(docs) {
  return {
    trackedCount: docs.length,
    averageCompetitorScore: average(docs.map((item) => item.averageScore)),
    strongestCompetitor: docs.slice().sort((a, b) => Number(b.averageScore || 0) - Number(a.averageScore || 0))[0] || null
  };
}

function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return 0;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
}

function normaliseDomain(value) {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!domain) throw new Error("Competitor domain is required.");
  return domain;
}