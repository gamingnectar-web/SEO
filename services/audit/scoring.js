export function calculatePageAudit({ url, html, status, loadMs }) {
  const issues = [];
  const recommendations = [];

  const categoryScores = {
    functionality: 10,
    seo: 10,
    geo: 10,
    accessibility: 10,
    performance: 10,
    conversion: 10,
    trust: 10,
    merchandising: 10
  };

  function deduct(category, points, message, severity = "medium", recommendation = "") {
    categoryScores[category] = Math.max(0, categoryScores[category] - points);

    issues.push({
      category,
      severity,
      message,
      points
    });

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  const safeHtml = html || "";

  const title = extractTitle(safeHtml);
  const metaDescription = extractMetaDescription(safeHtml);

  /**
   * Functionality checks
   */
  if (!status || status >= 400) {
    deduct(
      "functionality",
      5,
      `Page returned a bad HTTP status: ${status || "unknown"}.`,
      "high",
      "Fix broken pages, redirects, or server errors before optimising content."
    );
  }

  if (safeHtml.length < 1000) {
    deduct(
      "functionality",
      1.5,
      "Page content appears unusually thin or failed to fully load.",
      "medium",
      "Check whether the page is rendering correctly and not blocking crawlers."
    );
  }

  if (!safeHtml.includes("</html>")) {
    deduct(
      "functionality",
      1,
      "Rendered HTML may be incomplete.",
      "medium",
      "Review the page source and confirm the full document is loading."
    );
  }

  /**
   * SEO checks
   */
  if (!title) {
    deduct(
      "seo",
      1.5,
      "Missing page title.",
      "high",
      "Add a clear, keyword-relevant title tag."
    );
  } else {
    if (title.length < 20) {
      deduct(
        "seo",
        0.7,
        "Page title may be too short.",
        "medium",
        "Expand the title so it clearly explains the page topic."
      );
    }

    if (title.length > 65) {
      deduct(
        "seo",
        0.7,
        "Page title may be too long.",
        "medium",
        "Shorten the title so important words are not truncated in search results."
      );
    }
  }

  if (!metaDescription) {
    deduct(
      "seo",
      1.2,
      "Missing meta description.",
      "high",
      "Add a useful meta description that explains the page and encourages clicks."
    );
  } else {
    if (metaDescription.length < 70) {
      deduct(
        "seo",
        0.5,
        "Meta description may be too short.",
        "medium",
        "Give the meta description more context and value."
      );
    }

    if (metaDescription.length > 170) {
      deduct(
        "seo",
        0.5,
        "Meta description may be too long.",
        "medium",
        "Shorten the meta description so it is easier to scan."
      );
    }
  }

  const h1Count = countMatches(safeHtml, /<h1[\s>]/gi);

  if (h1Count === 0) {
    deduct(
      "seo",
      1,
      "Missing H1 heading.",
      "high",
      "Add one clear H1 that describes the main page topic."
    );
  }

  if (h1Count > 1) {
    deduct(
      "seo",
      0.5,
      `Multiple H1 headings found: ${h1Count}.`,
      "low",
      "Use one main H1 and structure other headings as H2/H3."
    );
  }

  if (!/<link[^>]+rel=["']canonical["']/i.test(safeHtml)) {
    deduct(
      "seo",
      0.7,
      "Missing canonical URL.",
      "medium",
      "Add a canonical tag to help search engines understand the preferred URL."
    );
  }

  /**
   * GEO checks
   */
  if (!/application\/ld\+json/i.test(safeHtml)) {
    deduct(
      "geo",
      1.5,
      "No JSON-LD structured data found.",
      "high",
      "Add structured data such as Product, Organization, FAQPage, BreadcrumbList, or Article schema where relevant."
    );
  }

  if (
    !/faq|frequently asked|question|answer|how to|what is|why does|which is|best for/i.test(
      safeHtml
    )
  ) {
    deduct(
      "geo",
      1,
      "Page does not appear to contain answer-style content for generative search.",
      "medium",
      "Add concise answer blocks, FAQs, definitions, and comparison-style content."
    );
  }

  if (
    !/brand|product|ingredients|benefits|features|shipping|returns|reviews|about/i.test(
      safeHtml
    )
  ) {
    deduct(
      "geo",
      0.8,
      "Page may not clearly explain brand, product, benefits, or context.",
      "medium",
      "Make the page clearer for AI systems by explicitly explaining who the brand is, what the product is, and who it helps."
    );
  }

  /**
   * Accessibility checks
   */
  const imageTags = safeHtml.match(/<img\b[^>]*>/gi) || [];
  const imagesWithoutAlt = imageTags.filter(
    (img) => !/\salt=["'][^"']*["']/i.test(img)
  );

  if (imagesWithoutAlt.length > 0) {
    deduct(
      "accessibility",
      Math.min(2, imagesWithoutAlt.length * 0.2),
      `${imagesWithoutAlt.length} image(s) appear to be missing alt text.`,
      "medium",
      "Add descriptive alt text to meaningful images."
    );
  }

  if (!/<button|role=["']button["']|type=["']submit["']/i.test(safeHtml)) {
    deduct(
      "accessibility",
      0.5,
      "No clear button elements detected.",
      "low",
      "Make sure key actions use accessible button or link elements."
    );
  }

  /**
   * Performance checks
   */
  if (loadMs > 3000) {
    deduct(
      "performance",
      2,
      `Page took ${loadMs}ms to load.`,
      "high",
      "Review large images, scripts, apps, and third-party tracking."
    );
  } else if (loadMs > 1800) {
    deduct(
      "performance",
      1,
      `Page took ${loadMs}ms to load.`,
      "medium",
      "There may be room to improve initial response and asset loading."
    );
  }

  const scriptCount = countMatches(safeHtml, /<script\b/gi);

  if (scriptCount > 35) {
    deduct(
      "performance",
      1,
      `High number of script tags detected: ${scriptCount}.`,
      "medium",
      "Review unused Shopify apps, tracking pixels, and theme scripts."
    );
  }

  /**
   * Conversion checks
   */
  if (
    !/add to cart|buy now|shop now|subscribe|checkout|get started|view product/i.test(
      safeHtml
    )
  ) {
    deduct(
      "conversion",
      1.5,
      "No obvious conversion call-to-action detected.",
      "high",
      "Add a clear CTA such as Add to Cart, Shop Now, Buy Now, or Subscribe."
    );
  }

  if (!/£|\$|€|price|sale|regular price|compare at/i.test(safeHtml)) {
    deduct(
      "conversion",
      0.7,
      "No clear pricing signal detected.",
      "medium",
      "Make sure price information is visible on product and collection pages."
    );
  }

  /**
   * Trust checks
   */
  if (
    !/reviews|rated|trustpilot|shipping|returns|refund|secure|guarantee|contact/i.test(
      safeHtml
    )
  ) {
    deduct(
      "trust",
      1.2,
      "Limited trust signals detected.",
      "medium",
      "Add reviews, shipping info, returns info, guarantee messaging, secure checkout, or contact links."
    );
  }

  /**
   * Merchandising checks
   */
  if (
    !/variant|quantity|flavour|flavor|size|bundle|ingredients|nutrition|benefits/i.test(
      safeHtml
    )
  ) {
    deduct(
      "merchandising",
      1,
      "Limited product merchandising signals found.",
      "medium",
      "Improve product detail with variants, ingredients, benefits, nutrition, bundles, and usage guidance."
    );
  }

  const overallScore = average(Object.values(categoryScores));

  return {
    url,
    status,
    loadMs,
    title,
    metaDescription,
    overallScore,
    categoryScores,
    issues,
    recommendations: [...new Set(recommendations)],
    checkedAt: new Date().toISOString()
  };
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return match ? cleanText(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );

  return match ? cleanText(match[1]) : "";
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function average(values) {
  if (!values.length) return 0;

  const total = values.reduce((sum, value) => sum + value, 0);

  return Math.round((total / values.length) * 10) / 10;
}
