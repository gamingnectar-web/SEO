import { ObjectId } from "mongodb";
import { getCollections } from "../db/mongodb.js";

export async function saveAuditRun({
  ownerKey = "public:anonymous",
  type,
  input,
  results,
  siteAudit = null,
  competitorAnalysis = null
}) {
  const { auditRuns } = await getCollections();
  const createdAt = new Date();
  const summary = buildSummary({ results, siteAudit, competitorAnalysis });

  const document = {
    ownerKey,
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

export async function getRecentAuditRuns(limit = 20, ownerKey = null) {
  const { auditRuns } = await getCollections();
  const query = ownerKey ? { ownerKey } : {};

  return auditRuns
    .find(query, {
      projection: {
        results: 0,
        siteAudit: 0,
        competitorAnalysis: 0
      }
    })
    .sort({ createdAt: -1 })
    .limit(Number(limit) || 20)
    .toArray();
}

export async function getAuditRunById(id, ownerKey = null) {
  const { auditRuns } = await getCollections();

  if (!ObjectId.isValid(id)) {
    return null;
  }

  const query = {
    _id: new ObjectId(id)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  return auditRuns.findOne(query);
}

export async function deleteAuditRunById(id, ownerKey = null) {
  const { auditRuns, auditTodos } = await getCollections();

  if (!ObjectId.isValid(id)) {
    return {
      deletedCount: 0
    };
  }

  const query = {
    _id: new ObjectId(id)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  const result = await auditRuns.deleteOne(query);

  if (result.deletedCount) {
    await auditTodos.deleteMany({
      auditRunId: id,
      ...(ownerKey ? { ownerKey } : {})
    });
  }

  return result;
}

export async function getLatestAuditRun(ownerKey = null) {
  const { auditRuns } = await getCollections();
  const query = ownerKey ? { ownerKey } : {};

  return auditRuns.findOne(query, {
    sort: {
      createdAt: -1
    }
  });
}

export async function getAuditRunStats(ownerKey = null) {
  const { auditRuns } = await getCollections();
  const query = ownerKey ? { ownerKey } : {};

  const [latestRun, totalRuns, averages] = await Promise.all([
    getLatestAuditRun(ownerKey),
    auditRuns.countDocuments(query),
    auditRuns
      .aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: null,
            averageScore: {
              $avg: "$summary.averageScore"
            },
            averageIssues: {
              $avg: "$summary.issueCount"
            },
            totalPages: {
              $sum: "$summary.pageCount"
            },
            totalIssues: {
              $sum: "$summary.issueCount"
            }
          }
        }
      ])
      .toArray()
  ]);

  const aggregate = averages[0] || {};

  return {
    totalRuns,
    latestRun,
    averageScore: roundOneDecimal(aggregate.averageScore || 0),
    averageIssues: roundOneDecimal(aggregate.averageIssues || 0),
    totalPages: Number(aggregate.totalPages || 0),
    totalIssues: Number(aggregate.totalIssues || 0)
  };
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
    finalCategoryAverages[category] = roundOneDecimal(value.total / value.count);
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
  const cleanValues = values
    .map(Number)
    .filter((value) => Number.isFinite(value));

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);
  return roundOneDecimal(total / cleanValues.length);
}

function roundOneDecimal(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 10) / 10;
}