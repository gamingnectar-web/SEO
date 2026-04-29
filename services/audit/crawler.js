import { calculatePageAudit } from "./scoring.js";

export async function auditMultipleUrls(urls) {
  const results = [];

  for (const url of urls) {
    const result = await auditSingleUrl(url);
    results.push(result);
  }

  return results;
}

export async function auditSingleUrl(url) {
  const startedAt = Date.now();

  try {
    const normalisedUrl = normaliseUrl(url);

    const response = await fetch(normalisedUrl, {
      headers: {
        "User-Agent":
          "GamingNectarSiteQualityAuditor/1.0 (+https://gamingnectar.com)"
      }
    });

    const html = await response.text();
    const loadMs = Date.now() - startedAt;

    return calculatePageAudit({
      url: normalisedUrl,
      html,
      status: response.status,
      loadMs
    });
  } catch (error) {
    return {
      url,
      status: null,
      loadMs: Date.now() - startedAt,
      title: "",
      metaDescription: "",
      overallScore: 0,
      categoryScores: {
        functionality: 0,
        seo: 0,
        geo: 0,
        accessibility: 0,
        performance: 0,
        conversion: 0,
        trust: 0,
        merchandising: 0
      },
      issues: [
        {
          category: "functionality",
          severity: "high",
          message: error.message || "Unable to fetch this page.",
          points: 10
        }
      ],
      recommendations: [
        "Check that the URL is correct and publicly accessible."
      ],
      checkedAt: new Date().toISOString()
    };
  }
}

function normaliseUrl(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }

  return url;
}