import { calculatePageAudit, compareAudits } from "./scoring.js";

export async function auditMultipleUrls(urls) {
  const results = [];

  for (const url of urls) {
    const result = await auditSingleUrl(url);
    results.push(result);
  }

  return results;
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
          "GamingNectarSiteQualityAuditor/2.0 (+https://gamingnectar.com)",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return failedAudit(
        normalisedUrl,
        Date.now() - startedAt,
        `URL did not return HTML content. Content-Type: ${contentType || "unknown"}.`
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
      error.name === "AbortError" ? "Request timed out after 15 seconds." : error.message
    );
  }
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
    categoryScores: {
      technical: 0,
      seo: 0,
      content: 0,
      geo: 0,
      accessibility: 0,
      performance: 0,
      conversion: 0,
      trust: 0,
      merchandising: 0
    },
    issues: [
      {
        category: "technical",
        severity: "critical",
        message: message || "Unable to fetch this page.",
        points: 10,
        recommendation: "Check that the URL is correct, public, and not blocking server-side requests."
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

function normaliseUrl(url) {
  const trimmed = String(url || "").trim();

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }

  return trimmed;
}