import { getCollections } from "../db/mongodb.js";

export function buildAuditSnapshot({ ownerKey, siteUrl, auditRun, keywordSummary = null, competitorSummary = null }) {
  const summary = auditRun?.summary || {};
  const categoryAverages = summary.categoryAverages || {};

  const effectivenessScore = Math.round(
    Number(summary.averageScore || 0) * 10
  );

  return {
    ownerKey,
    siteUrl,
    auditRunId: auditRun?._id?.toString?.() || String(auditRun?._id || ""),
    auditType: auditRun?.type || "scheduled",
    effectivenessScore,
    averageScore: Number(summary.averageScore || 0),
    pageCount: Number(summary.pageCount || 0),
    issueCount: Number(summary.issueCount || 0),
    categoryAverages,
    seoScore: toPercent(categoryAverages.seo),
    geoScore: toPercent(categoryAverages.geo),
    aeoScore: toPercent(categoryAverages.geo),
    linkScore: toPercent(categoryAverages.linking),
    technicalScore: toPercent(categoryAverages.technical),
    contentScore: toPercent(categoryAverages.content),
    conversionScore: toPercent(categoryAverages.conversion),
    trustScore: toPercent(categoryAverages.trust),
    merchandisingScore: toPercent(categoryAverages.merchandising),
    keywordSummary,
    competitorSummary,
    createdAt: new Date()
  };
}

export async function saveAuditSnapshot(snapshot) {
  const { auditSnapshots } = await getCollections();
  const result = await auditSnapshots.insertOne(snapshot);
  return { ...snapshot, _id: result.insertedId };
}

export async function getAuditHistory(ownerKey, limit = 30) {
  const { auditSnapshots } = await getCollections();
  return auditSnapshots
    .find({ ownerKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getDashboardTimeline(ownerKey, limit = 30) {
  const rows = await getAuditHistory(ownerKey, limit);
  return rows.reverse().map((row) => ({
    id: row._id?.toString(),
    auditRunId: row.auditRunId,
    label: new Date(row.createdAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }),
    createdAt: row.createdAt,
    effectivenessScore: row.effectivenessScore || 0,
    seoScore: row.seoScore || 0,
    geoScore: row.geoScore || 0,
    aeoScore: row.aeoScore || 0,
    linkScore: row.linkScore || 0,
    technicalScore: row.technicalScore || 0,
    issueCount: row.issueCount || 0,
    keywordValue: row.keywordSummary?.equivalentPaidValue || 0,
    competitorScore: row.competitorSummary?.averageCompetitorScore || 0
  }));
}

export function buildMovementInsight(current, previous) {
  if (!current) {
    return {
      status: "empty",
      title: "No dashboard history yet",
      message: "Run an audit or wait for the scheduled audit to create the first point.",
      actions: ["Run a full-site crawl", "Add tracked keywords", "Add competitors"]
    };
  }

  if (!previous) {
    return {
      status: "baseline",
      title: "Baseline captured",
      message: "This is your first traceable snapshot. Future 12-hour checks will show movement against this point.",
      actions: ["Complete the highest priority to-dos", "Add competitor domains", "Track commercial keywords"]
    };
  }

  const diff = Number(current.effectivenessScore || 0) - Number(previous.effectivenessScore || 0);
  const issueDiff = Number(current.issueCount || 0) - Number(previous.issueCount || 0);

  if (diff >= 5) {
    return {
      status: "improved",
      title: "Effectiveness increased",
      message: `Effectiveness improved by ${diff} points since the previous snapshot.`,
      actions: [
        issueDiff < 0 ? "Issues reduced since the last scan — keep pushing this pattern." : "Score rose, but issues did not fall. Check which categories moved.",
        "Review completed to-dos and repeat the highest impact changes across similar pages.",
        "Check whether competitor or keyword visibility moved at the same time."
      ]
    };
  }

  if (diff <= -5) {
    return {
      status: "dropped",
      title: "Effectiveness dropped",
      message: `Effectiveness dropped by ${Math.abs(diff)} points since the previous snapshot.`,
      actions: [
        issueDiff > 0 ? "New issues appeared. Start with technical, indexability, link-count and out-of-stock changes." : "Issues did not rise, so the drop may be category weighting, competitors, keyword movement or content drift.",
        "Check pages that changed status, inventory, schema, canonical or internal-link count.",
        "Compare competitor snapshots for gains against your tracked pages."
      ]
    };
  }

  return {
    status: "stable",
    title: "Performance is stable",
    message: "No major movement since the previous 12-hour check.",
    actions: [
      "Work through planned high-priority to-dos.",
      "Look for pages with high link counts and weak commercial context.",
      "Add keyword value tracking to prove organic value against paid spend."
    ]
  };
}

function toPercent(scoreOutOfTen) {
  return Math.round(Number(scoreOutOfTen || 0) * 10);
}