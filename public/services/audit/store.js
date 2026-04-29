import { ObjectId } from "mongodb";
import { getCollections } from "../db/mongodb.js";

export async function saveAuditRun({
  type,
  input,
  results,
  siteAudit = null,
  competitorAnalysis = null
}) {
  const { auditRuns } = await getCollections();

  const createdAt = new Date();

  const summary = buildSummary({
    results,
    siteAudit,
    competitorAnalysis
  });

  const document = {
    type,
    input,
    results,
    siteAudit,
    competitorAnalysis,
    summary,
    createdAt,
    updatedAt: createdAt
  };

  const insertResult = await auditRuns.insertOne(document);

  return {
    ...document,
    _id: insertResult.insertedId
  };
}

export async function getRecentAuditRuns(limit = 20) {
  const { auditRuns } = await getCollections();

  return auditRuns
    .find(
      {},
      {
        projection: {
          results: 0,
          siteAudit: 0,
          competitorAnalysis: 0
        }
      }
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getAuditRunById(id) {
  const { auditRuns } = await getCollections();

  if (!ObjectId.isValid(id)) {
    return null;
  }

  return auditRuns.findOne({
    _id: new ObjectId(id)
  });
}

function buildSummary({ results, siteAudit, competitorAnalysis }) {
  const cleanResults = Array.isArray(results) ? results : [];

  const averageScore = average(
    cleanResults.map((result) => result.overallScore)
  );

  const categoryAverages = {};

  cleanResults.forEach((result) => {
    Object.entries(result.categoryScores || {}).forEach(([category, score]) => {
      if (!categoryAverages[category]) {
        categoryAverages[category] = {
          total: 0,
          count: 0
        };
      }

      categoryAverages[category].total += Number(score || 0);
      categoryAverages[category].count += 1;
    });
  });

  const finalCategoryAverages = {};

  Object.entries(categoryAverages).forEach(([category, value]) => {
    finalCategoryAverages[category] =
      Math.round((value.total / value.count) * 10) / 10;
  });

  return {
    averageScore,
    pageCount: cleanResults.length,
    issueCount: cleanResults.reduce(
      (total, result) => total + (result.issues?.length || 0),
      0
    ),
    categoryAverages: finalCategoryAverages,
    siteAverageScore: siteAudit?.summary?.averageScore || null,
    competitorCount: competitorAnalysis?.competitors?.length || 0
  };
}

function average(values) {
  const cleanValues = values.filter((value) => typeof value === "number");

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return Math.round((total / cleanValues.length) * 10) / 10;
}