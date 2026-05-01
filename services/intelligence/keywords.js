import { getCollections } from "../db/mongodb.js";

const CTR_BY_RANK = {
  1: 0.28,
  2: 0.15,
  3: 0.15,
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

export async function upsertTrackedKeyword({
  ownerKey,
  keyword,
  searchVolume = null,
  cpc = null,
  location = "United Kingdom",
  targetUrl = ""
}) {
  const { trackedKeywords } = await getCollections();
  const now = new Date();
  const cleanKeyword = normaliseKeyword(keyword);

  if (!cleanKeyword) {
    throw new Error("Keyword is required.");
  }

  await trackedKeywords.updateOne(
    {
      ownerKey,
      keyword: cleanKeyword
    },
    {
      $set: {
        ownerKey,
        keyword: cleanKeyword,
        location: String(location || "United Kingdom").trim(),
        targetUrl: String(targetUrl || "").trim(),
        searchVolume: normaliseNullableNumber(searchVolume),
        cpc: normaliseNullableNumber(cpc),
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now,
        status: "active"
      }
    },
    {
      upsert: true
    }
  );

  return trackedKeywords.findOne({
    ownerKey,
    keyword: cleanKeyword
  });
}

export async function getTrackedKeywords(ownerKey) {
  const { trackedKeywords, keywordSnapshots } = await getCollections();

  const keywords = await trackedKeywords
    .find({
      ownerKey,
      status: {
        $ne: "deleted"
      }
    })
    .sort({
      createdAt: -1
    })
    .toArray();

  const enriched = [];

  for (const keyword of keywords) {
    const latestSnapshot = await keywordSnapshots.findOne(
      {
        ownerKey,
        keyword: keyword.keyword
      },
      {
        sort: {
          createdAt: -1
        }
      }
    );

    enriched.push({
      ...keyword,
      latestSnapshot,
      dashboard: buildKeywordDashboardRow(keyword, latestSnapshot)
    });
  }

  return enriched;
}

export async function getKeywordDashboard(ownerKey, limit = 100) {
  const { keywordSnapshots } = await getCollections();

  return keywordSnapshots
    .find({
      ownerKey
    })
    .sort({
      createdAt: -1
    })
    .limit(Number(limit) || 100)
    .toArray();
}

export async function runKeywordSnapshot(ownerKey) {
  const { keywordSnapshots } = await getCollections();
  const keywords = await getTrackedKeywords(ownerKey);
  const now = new Date();
  const docs = [];

  for (const item of keywords) {
    const providerData = await fetchKeywordProviderData(item);
    const rank = providerData.rank ?? item.latestSnapshot?.rank ?? null;
    const previousRank = item.latestSnapshot?.rank ?? null;
    const searchVolume =
      providerData.searchVolume ??
      item.searchVolume ??
      item.latestSnapshot?.searchVolume ??
      0;
    const cpc =
      providerData.cpc ??
      item.cpc ??
      item.latestSnapshot?.cpc ??
      0;

    const value = calculateKeywordValue({
      rank,
      searchVolume,
      cpc
    });

    const score = calculateKeywordScore({
      rank,
      searchVolume,
      cpc,
      estimatedClicks: value.estimatedClicks
    });

    const doc = {
      ownerKey,
      keyword: item.keyword,
      location: item.location || "United Kingdom",
      targetUrl: item.targetUrl || "",
      rank,
      previousRank,
      rankChange: calculateRankChange(rank, previousRank),
      searchVolume,
      cpc,
      estimatedClicks: value.estimatedClicks,
      equivalentPaidValue: value.equivalentPaidValue,
      score,
      advice: buildKeywordAdvice({
        keyword: item.keyword,
        rank,
        previousRank,
        searchVolume,
        cpc,
        score
      }),
      provider: providerData.provider,
      confidence: providerData.confidence,
      createdAt: now
    };

    docs.push(doc);
  }

  if (docs.length) {
    await keywordSnapshots.insertMany(docs);
  }

  return summariseKeywordSnapshots(docs);
}

export async function deleteTrackedKeyword({ ownerKey, keyword }) {
  const { trackedKeywords } = await getCollections();

  return trackedKeywords.updateOne(
    {
      ownerKey,
      keyword: normaliseKeyword(keyword)
    },
    {
      $set: {
        status: "deleted",
        updatedAt: new Date()
      }
    }
  );
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

function buildKeywordDashboardRow(keyword, latestSnapshot) {
  const searchVolume = latestSnapshot?.searchVolume ?? keyword.searchVolume ?? 0;
  const cpc = latestSnapshot?.cpc ?? keyword.cpc ?? 0;
  const rank = latestSnapshot?.rank ?? null;

  const value = calculateKeywordValue({
    rank,
    searchVolume,
    cpc
  });

  const score =
    latestSnapshot?.score ??
    calculateKeywordScore({
      rank,
      searchVolume,
      cpc,
      estimatedClicks: value.estimatedClicks
    });

  return {
    keyword: keyword.keyword,
    location: keyword.location || "United Kingdom",
    rank,
    previousRank: latestSnapshot?.previousRank ?? null,
    rankChange: latestSnapshot?.rankChange ?? 0,
    searchVolume,
    cpc,
    estimatedClicks: latestSnapshot?.estimatedClicks ?? value.estimatedClicks,
    equivalentPaidValue: latestSnapshot?.equivalentPaidValue ?? value.equivalentPaidValue,
    score,
    advice: latestSnapshot?.advice || buildKeywordAdvice({
      keyword: keyword.keyword,
      rank,
      previousRank: latestSnapshot?.previousRank,
      searchVolume,
      cpc,
      score
    }),
    provider: latestSnapshot?.provider || "manual/fallback",
    latestSnapshotAt: latestSnapshot?.createdAt || null
  };
}

function calculateKeywordScore({ rank, searchVolume, cpc, estimatedClicks }) {
  let score = 0;

  if (rank && rank <= 3) score += 40;
  else if (rank && rank <= 10) score += 28;
  else if (rank && rank <= 20) score += 14;
  else if (rank) score += 6;

  if (searchVolume >= 1000) score += 25;
  else if (searchVolume >= 300) score += 18;
  else if (searchVolume >= 100) score += 10;
  else if (searchVolume > 0) score += 5;

  if (cpc >= 3) score += 20;
  else if (cpc >= 1) score += 14;
  else if (cpc > 0) score += 8;

  if (estimatedClicks >= 100) score += 15;
  else if (estimatedClicks >= 25) score += 10;
  else if (estimatedClicks > 0) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildKeywordAdvice({ keyword, rank, previousRank, searchVolume, cpc, score }) {
  const actions = [];

  if (!rank) {
    actions.push("Connect DataForSEO, SerpApi, Google Search Console or Google Ads data so this keyword can be ranked automatically.");
  } else if (rank > 10) {
    actions.push("Create or strengthen a dedicated landing page for this keyword. Include the keyword in the title, H1, intro copy, FAQs and internal links.");
  } else if (rank > 3) {
    actions.push("You are visible but not dominant. Improve content depth, add stronger internal links, and compare your page against the top 3 competitors.");
  } else {
    actions.push("This keyword is performing strongly. Protect the ranking by keeping the page updated and monitoring competitor movement.");
  }

  if (previousRank && rank && rank > previousRank) {
    actions.push("Ranking has dropped. Check whether competitors added stronger content, products went out of stock, or your page lost internal links.");
  }

  if (searchVolume && cpc) {
    actions.push(`This term has commercial value. Organic traffic here may offset paid search spend because CPC is approximately £${Number(cpc).toFixed(2)}.`);
  }

  if (score < 50) {
    actions.push("Priority: build clearer relevance and authority. Add supporting collection/product links, FAQs, schema, and comparison copy.");
  }

  return {
    summary: `${keyword} currently has a keyword strength score of ${score}/100.`,
    actions
  };
}

function calculateRankChange(rank, previousRank) {
  if (!rank || !previousRank) return 0;
  return Number(previousRank) - Number(rank);
}

function summariseKeywordSnapshots(docs) {
  const totalValue = docs.reduce((sum, doc) => sum + Number(doc.equivalentPaidValue || 0), 0);
  const rankedDocs = docs.filter((doc) => doc.rank);
  const averageRank = rankedDocs.length
    ? rankedDocs.reduce((sum, doc) => sum + Number(doc.rank || 0), 0) / rankedDocs.length
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
    rank: keywordConfig.latestSnapshot?.rank ?? null,
    searchVolume: keywordConfig.searchVolume ?? keywordConfig.latestSnapshot?.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? keywordConfig.latestSnapshot?.cpc ?? 0
  };
}

async function fetchDataForSeoKeywordData(keywordConfig) {
  return {
    provider: "dataforseo-placeholder",
    confidence: "medium",
    rank: keywordConfig.latestSnapshot?.rank ?? null,
    searchVolume: keywordConfig.searchVolume ?? keywordConfig.latestSnapshot?.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? keywordConfig.latestSnapshot?.cpc ?? 0
  };
}

async function fetchSerpApiKeywordData(keywordConfig) {
  return {
    provider: "serpapi-placeholder",
    confidence: "medium",
    rank: keywordConfig.latestSnapshot?.rank ?? null,
    searchVolume: keywordConfig.searchVolume ?? keywordConfig.latestSnapshot?.searchVolume ?? 0,
    cpc: keywordConfig.cpc ?? keywordConfig.latestSnapshot?.cpc ?? 0
  };
}

function getProviderMode() {
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) return "dataforseo";
  if (process.env.SERPAPI_KEY) return "serpapi";
  return "manual/fallback";
}

function normaliseKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function normaliseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}