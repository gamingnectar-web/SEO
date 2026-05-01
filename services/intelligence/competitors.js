import { getCollections } from "../db/mongodb.js";
import { auditMultipleUrls, auditSiteFromSitemap } from "../audit/crawler.js";

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
    {
      ownerKey,
      domain: cleanDomain
    },
    {
      $set: {
        ownerKey,
        domain: cleanDomain,
        urls: Array.isArray(urls) ? urls.filter(Boolean).slice(0, 50) : [],
        updatedAt: now,
        status: "active"
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    {
      upsert: true
    }
  );

  return trackedCompetitors.findOne({
    ownerKey,
    domain: cleanDomain
  });
}

export async function getTrackedCompetitors(ownerKey) {
  const { trackedCompetitors } = await getCollections();

  return trackedCompetitors
    .find({
      ownerKey,
      status: {
        $ne: "deleted"
      }
    })
    .sort({
      domain: 1
    })
    .toArray();
}

export async function runCompetitorSnapshot(ownerKey, options = {}) {
  const { competitorSnapshots } = await getCollections();
  const competitors = await getTrackedCompetitors(ownerKey);
  const now = new Date();
  const docs = [];
  const maxUrls = Number(options.maxUrls || process.env.COMPETITOR_AUDIT_MAX_URLS || 25);

  for (const competitor of competitors) {
    const hasManualUrls = Array.isArray(competitor.urls) && competitor.urls.length > 0;

    let results = [];
    let discoveredCount = 0;
    let crawlMode = "manual_urls";

    if (hasManualUrls) {
      const urls = competitor.urls.slice(0, maxUrls);
      results = await auditMultipleUrls(urls);
      discoveredCount = urls.length;
    } else {
      crawlMode = "sitemap";
      const siteAudit = await auditSiteFromSitemap(`https://${competitor.domain}`, {
        maxUrls
      });

      results = siteAudit.results || [];
      discoveredCount = siteAudit.discoveredCount || results.length;
    }

    const summary = summariseCompetitorResults(results);

    docs.push({
      ownerKey,
      domain: competitor.domain,
      urls: hasManualUrls ? competitor.urls.slice(0, maxUrls) : [],
      crawlMode,
      discoveredCount,
      pageCount: results.length,
      averageScore: summary.averageScore,
      issueCount: summary.issueCount,
      categoryAverages: summary.categoryAverages,
      averageLinkScore: summary.categoryAverages.linking || 0,
      averageGeoScore: summary.categoryAverages.geo || 0,
      averageSeoScore: summary.categoryAverages.seo || 0,
      averageTechnicalScore: summary.categoryAverages.technical || 0,
      averageContentScore: summary.categoryAverages.content || 0,
      strongestPage: results
        .slice()
        .sort((a, b) => Number(b.overallScore || 0) - Number(a.overallScore || 0))[0] || null,
      weakestPage: results
        .slice()
        .sort((a, b) => Number(a.overallScore || 0) - Number(b.overallScore || 0))[0] || null,
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
    .find({
      ownerKey
    })
    .sort({
      createdAt: -1
    })
    .limit(Number(limit) || 50)
    .toArray();
}

export async function deleteTrackedCompetitor({ ownerKey, domain }) {
  const { trackedCompetitors } = await getCollections();

  return trackedCompetitors.updateOne(
    {
      ownerKey,
      domain: normaliseDomain(domain)
    },
    {
      $set: {
        status: "deleted",
        updatedAt: new Date()
      }
    }
  );
}

function summariseCompetitors(docs) {
  return {
    trackedCount: docs.length,
    averageCompetitorScore: average(docs.map((item) => item.averageScore)),
    averageCompetitorIssues: average(docs.map((item) => item.issueCount)),
    strongestCompetitor:
      docs
        .slice()
        .sort((a, b) => Number(b.averageScore || 0) - Number(a.averageScore || 0))[0] || null,
    weakestCompetitor:
      docs
        .slice()
        .sort((a, b) => Number(a.averageScore || 0) - Number(b.averageScore || 0))[0] || null
  };
}

function summariseCompetitorResults(results) {
  const cleanResults = Array.isArray(results) ? results : [];
  const categoryTotals = {};
  const categoryCounts = {};

  for (const result of cleanResults) {
    for (const [category, score] of Object.entries(result.categoryScores || {})) {
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(score || 0);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  }

  const categoryAverages = {};

  for (const category of Object.keys(categoryTotals)) {
    categoryAverages[category] = roundOneDecimal(
      categoryTotals[category] / categoryCounts[category]
    );
  }

  return {
    averageScore: average(cleanResults.map((item) => item.overallScore)),
    issueCount: cleanResults.reduce(
      (sum, item) => sum + (Array.isArray(item.issues) ? item.issues.length : 0),
      0
    ),
    categoryAverages
  };
}

function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);

  if (!clean.length) {
    return 0;
  }

  return roundOneDecimal(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function roundOneDecimal(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 10) / 10;
}

function normaliseDomain(value) {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!domain) {
    throw new Error("Competitor domain is required.");
  }

  return domain;
}