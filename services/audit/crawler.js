import {
  calculatePageAudit,
  compareAudits,
  summariseSiteAudit,
  buildImprovementPlan
} from "./scoring.js";

export async function auditMultipleUrls(urls) {
  const results = [];

  for (const url of urls) {
    results.push(await auditSingleUrl(url));
  }

  return results;
}

export async function auditSiteFromSitemap(siteUrl, options = {}) {
  const maxUrls = options.maxUrls || 50;
  const startedAt = new Date().toISOString();

  const discoveredUrls = await discoverUrlsFromSitemap(siteUrl, maxUrls);

  const results = [];

  for (const url of discoveredUrls) {
    results.push(await auditSingleUrl(url));
  }

    const summary = summariseSiteAudit(results);

  const improvementPlans = {
    geo: buildImprovementPlan(results, "geo"),
    seo: buildImprovementPlan(results, "seo"),
    technical: buildImprovementPlan(results, "technical"),
    linking: buildImprovementPlan(results, "linking"),
    content: buildImprovementPlan(results, "content"),
    conversion: buildImprovementPlan(results, "conversion"),
    trust: buildImprovementPlan(results, "trust"),
    merchandising: buildImprovementPlan(results, "merchandising")
  };

  return {
    siteUrl: normaliseUrl(siteUrl),
    startedAt,
    completedAt: new Date().toISOString(),
    maxUrls,
    discoveredCount: discoveredUrls.length,
    results,
    summary,
    improvementPlans
  };
}

export async function auditWithCompetitors(primaryUrl, competitorUrls = []) {
  const primary = await auditSingleUrl(primaryUrl);
  const competitors = [];

  for (const competitorUrl of competitorUrls.slice(0, 5)) {
    competitors.push(await auditSingleUrl(competitorUrl));
  }

  return {
    primary,
    competitors,
    comparison: compareAudits(primary, competitors)
  };
}

export async function auditSingleUrl(url) {
  const startedAt = Date.now();

  try {
    const normalisedUrl = normaliseUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(normalisedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "GamingNectarSiteQualityAuditor/3.0 (+https://gamingnectar.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return failedAudit(
        normalisedUrl,
        Date.now() - startedAt,
        `URL did not return HTML content. Content-Type: ${
          contentType || "unknown"
        }.`
      );
    }

    const html = await response.text();
    const loadMs = Date.now() - startedAt;

    return calculatePageAudit({
      url: normalisedUrl,
      html,
      status: response.status,
      loadMs
    });
  } catch (error) {
    return failedAudit(
      url,
      Date.now() - startedAt,
      error.name === "AbortError"
        ? "Request timed out after 15 seconds."
        : error.message
    );
  }
}

async function discoverUrlsFromSitemap(siteUrl, maxUrls) {
  const baseUrl = normaliseUrl(siteUrl);
  const origin = new URL(baseUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const visitedSitemaps = new Set();
  const pageUrls = new Set();

  async function crawlSitemap(url, depth = 0) {
    if (visitedSitemaps.has(url)) return;
    if (depth > 4) return;
    if (pageUrls.size >= maxUrls) return;

    visitedSitemaps.add(url);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "GamingNectarSiteQualityAuditor/3.0 (+https://gamingnectar.com)",
          Accept: "application/xml,text/xml,*/*"
        }
      });

      if (!response.ok) return;

      const xml = await response.text();

      const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)].map((m) =>
        decodeXml(m[1].trim())
      );

      for (const loc of locs) {
        if (pageUrls.size >= maxUrls) break;

        if (loc.endsWith(".xml") || loc.includes("sitemap")) {
          await crawlSitemap(loc, depth + 1);
        } else if (loc.startsWith(origin)) {
          pageUrls.add(loc);
        }
      }
    } catch {
      // Ignore failed sitemap branches for now.
    }
  }

  await crawlSitemap(sitemapUrl);

  if (pageUrls.size === 0) {
    pageUrls.add(origin);
  }

  return [...pageUrls].slice(0, maxUrls);
}

function failedAudit(url, loadMs, message) {
  return {
    url,
    status: null,
    loadMs,
    title: "",
    metaDescription: "",
    h1s: [],
    h2s: [],
    h3s: [],
    wordCount: 0,
    scriptCount: 0,
    styleCount: 0,
    schemaTypes: [],
    imageStats: {
      total: 0,
      missingAlt: 0
    },
    links: {
      total: 0,
      internalCount: 0,
      externalCount: 0
    },
    overallScore: 0,
    categoryScores: emptyCategoryScores(),
    categoryDetails: emptyCategoryDetails(),
    issues: [
      {
        category: "technical",
        severity: "critical",
        message: message || "Unable to fetch this page.",
        recommendation:
          "Check that the URL is correct, public, and not blocking server-side requests."
      }
    ],
    wins: [],
    recommendations: [
      "Check that the URL is correct, public, and not blocking server-side requests."
    ],
    insights: [],
    checkedAt: new Date().toISOString()
  };
}

function emptyCategoryScores() {
  return {
    technical: 0,
    seo: 0,
    geo: 0,
    linking: 0,
    content: 0,
    accessibility: 0,
    performance: 0,
    conversion: 0,
    trust: 0,
    merchandising: 0
  };
}

function emptyCategoryDetails() {
  return Object.fromEntries(
    Object.keys(emptyCategoryScores()).map((key) => [key, []])
  );
}

function normaliseUrl(url) {
  const trimmed = String(url || "").trim();

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}