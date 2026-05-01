import { getCollections } from "../db/mongodb.js";

const CTR_BY_RANK = {
  1: 0.28,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.06,
  6: 0.04,
  7: 0.035,
  8: 0.03,
  9: 0.025,
  10: 0.02
};

export async function seedDefaultKeywords(ownerKey) {
  const keywords = String(process.env.DEFAULT_TRACKED_KEYWORDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const keyword of keywords) {
    await upsertTrackedKeyword({ ownerKey, keyword });
  }
}

export async function upsertTrackedKeyword({ ownerKey, keyword, targetUrl = "", searchVolume = null, cpc = null }) {
  const { trackedKeywords } = await getCollections();
  const now = new Date();
  const cleanKeyword = String(keyword || "").trim().toLowerCase();
  if (!cleanKeyword) throw new Error("Keyword is required.");

  await trackedKeywords.updateOne(
    { ownerKey, keyword: cleanKeyword },
    {
      $set: {
        ownerKey,
        keyword: cleanKeyword,
        targetUrl,
        searchVolume: normaliseNullableNumber(searchVolume),
        cpc: normaliseNullableNumber(cpc),
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

export async function getTrackedKeywords(ownerKey) {
  const { trackedKeywords } = await getCollections();
  return trackedKeywords.find({ ownerKey }).sort({ keyword: 1 }).toArray();
}

export async function runKeywordSnapshot(ownerKey) {
  const { keywordSnapshots } = await getCollections();
  const keywords = await getTrackedKeywords(ownerKey);
  const now = new Date();
  const docs = [];

  for (const item of keywords) {
    const providerData = await fetchKeywordProviderData(item);
    const rank = providerData.rank ?? item.rank ?? null;
    const searchVolume = providerData.searchVolume ?? item.searchVolume ?? 0;
    const cpc = providerData.cpc ?? item.cpc ?? 0;
    const value = calculateKeywordValue({ rank, searchVolume, cpc });

    docs.push({
      ownerKey,
      keyword: item.keyword,
      targetUrl: item.targetUrl || "",
      rank,
      previousRank: item.latestRank ?? null,
      searchVolume,
      cpc,
      estimatedClicks: value.estimatedClicks,
      equivalentPaidValue: value.equivalentPaidValue,
      provider: providerData.provider,
      confidence: providerData.confidence,
      createdAt: now
    });
  }

  if (docs.length) {
    await keywordSnapshots.insertMany(docs);
  }

  return summariseKeywordSnapshots(docs);
}

export async function getKeywordDashboard(ownerKey, limit = 100) {
  const { keywordSnapshots } = await getCollections();
  return keywordSnapshots
    .find({ ownerKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export function calculateKeywordValue({ rank, searchVolume, cpc }) {
  const numericRank = Number(rank || 0);
  const ctr = CTR_BY_RANK[numericRank] || (numericRank > 10 && numericRank <= 20 ? 0.008 : 0.002);
  const estimatedClicks = Number(searchVolume || 0) * ctr;
  const equivalentPaidValue = estimatedClicks * Number(cpc || 0);

  return {
    estimatedClicks: Math.round(estimatedClicks),
    equivalentPaidValue: Number(equivalentPaidValue.toFixed(2))
  };
}

function summariseKeywordSnapshots(docs) {
  const totalValue = docs.reduce((sum, doc) => sum + Number(doc.equivalentPaidValue || 0), 0);
  const averageRank = docs.length
    ? docs.reduce((sum, doc) => sum + Number(doc.rank || 0), 0) / docs.filter((doc) => doc.rank).length
    : 0;

  return {
    trackedCount: docs.length,
    equivalentPaidValue: Number(totalValue.toFixed(2)),
    averageRank: Number((averageRank || 0).toFixed(1)),
    providerMode: getProviderMode()
  };
}

async function fetchKeywordProviderData(keywordConfig) {
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    return fetchDataForSeoKeywordData(keywordConfig);
  }

  if (process.env.SERPAPI_KEY) {
    return fetchSerpApiKeywordData(keywordConfig);
  }

  return {
    provider: "manual/fallback",
    confidence: "low",
    rank: keywordConfig.latestRank ?? null,
    searchVolume: keywordConfig.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? 0
  };
}

async function fetchDataForSeoKeywordData(keywordConfig) {
  // Placeholder hook. Add DataForSEO rank/CPC endpoints here when credentials are ready.
  return {
    provider: "dataforseo-not-configured-endpoint",
    confidence: "medium",
    rank: keywordConfig.latestRank ?? null,
    searchVolume: keywordConfig.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? 0
  };
}

async function fetchSerpApiKeywordData(keywordConfig) {
  // Placeholder hook. Add SerpApi Google Organic Results call here when ready.
  return {
    provider: "serpapi-not-configured-endpoint",
    confidence: "medium",
    rank: keywordConfig.latestRank ?? null,
    searchVolume: keywordConfig.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? 0
  };
}

function getProviderMode() {
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) return "dataforseo";
  if (process.env.SERPAPI_KEY) return "serpapi";
  return "manual/fallback";
}

function normaliseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}