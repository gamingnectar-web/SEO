const CATEGORIES = [
  "technical",
  "seo",
  "geo",
  "linking",
  "content",
  "accessibility",
  "performance",
  "conversion",
  "trust",
  "merchandising"
];

export function calculatePageAudit({ url, html, status, loadMs }) {
  const safeHtml = html || "";
  const text = extractVisibleText(safeHtml);

  const title = extractTitle(safeHtml);
  const metaDescription = extractMetaDescription(safeHtml);
  const h1s = extractHeadings(safeHtml, "h1");
  const h2s = extractHeadings(safeHtml, "h2");
  const h3s = extractHeadings(safeHtml, "h3");
  const imageStats = analyseImages(safeHtml);
  const links = analyseLinks(safeHtml, url);
  const schema = analyseSchema(safeHtml);
  const wordCount = countWords(text);
  const scriptCount = countMatches(safeHtml, /<script\b/gi);
  const styleCount = countMatches(
    safeHtml,
    /<style\b|rel=["']stylesheet["']/gi
  );

  const categoryScores = createCategoryScores();
  const categoryDetails = createCategoryDetails();

  const issues = [];
  const wins = [];
  const recommendations = [];

  function check(category, config) {
    const {
      name,
      passed,
      severity = "medium",
      points = 0.5,
      passMessage,
      failMessage,
      recommendation = "",
      evidence = ""
    } = config;

    categoryDetails[category].push({
      name,
      status: passed ? "pass" : "fail",
      severity,
      message: passed ? passMessage : failMessage,
      recommendation,
      evidence
    });

    if (passed) {
      wins.push({
        category,
        message: passMessage || `${name} looks good.`
      });
      return;
    }

    categoryScores[category] = Math.max(
      0,
      round1(categoryScores[category] - points)
    );

    issues.push({
      category,
      severity,
      message: failMessage,
      recommendation,
      evidence
    });

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  /**
   * Technical checks
   */
  check("technical", {
    name: "HTTP status",
    passed: status >= 200 && status < 300,
    severity: status >= 400 ? "critical" : "medium",
    points: status >= 400 ? 4 : 1,
    passMessage: "Page returns a successful HTTP status.",
    failMessage: `Page returned HTTP status ${status || "unknown"}.`,
    recommendation:
      "Fix server errors, broken URLs, redirect chains, or blocked resources first.",
    evidence: String(status || "unknown")
  });

  check("technical", {
    name: "Complete HTML",
    passed: safeHtml.includes("</html>"),
    severity: "medium",
    points: 1,
    passMessage: "HTML document appears complete.",
    failMessage: "HTML appears incomplete or partially rendered.",
    recommendation:
      "Check whether the page is interrupted, blocked, or failing during render."
  });

  check("technical", {
    name: "Mobile viewport",
    passed: /<meta[^>]+name=["']viewport["']/i.test(safeHtml),
    severity: "high",
    points: 1,
    passMessage: "Viewport meta tag found.",
    failMessage: "Missing viewport meta tag.",
    recommendation:
      "Add a viewport meta tag so the page is mobile-friendly and responsive."
  });

  check("technical", {
    name: "Canonical",
    passed: /<link[^>]+rel=["']canonical["']/i.test(safeHtml),
    severity: "medium",
    points: 0.8,
    passMessage: "Canonical tag found.",
    failMessage: "Missing canonical tag.",
    recommendation:
      "Add a canonical tag to clarify the preferred URL for search engines."
  });

  check("technical", {
    name: "Indexability hints",
    passed: !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(
      safeHtml
    ),
    severity: "critical",
    points: 2,
    passMessage: "No obvious noindex directive detected.",
    failMessage: "Potential noindex directive detected.",
    recommendation:
      "Confirm whether this page should be excluded from search. Remove noindex if it should rank."
  });

  /**
   * SEO checks
   */
  check("seo", {
    name: "Title exists",
    passed: Boolean(title),
    severity: "critical",
    points: 1.5,
    passMessage: "Title tag exists.",
    failMessage: "Missing title tag.",
    recommendation:
      "Add a descriptive title tag with the main keyword/topic near the start."
  });

  check("seo", {
    name: "Title length",
    passed: title.length >= 25 && title.length <= 65,
    severity: "medium",
    points: 0.7,
    passMessage: `Title length looks sensible at ${title.length} characters.`,
    failMessage: `Title length is ${title.length} characters, outside the preferred range.`,
    recommendation: "Aim for a useful, readable title around 25–65 characters.",
    evidence: title
  });

  check("seo", {
    name: "Meta description exists",
    passed: Boolean(metaDescription),
    severity: "high",
    points: 1.2,
    passMessage: "Meta description exists.",
    failMessage: "Missing meta description.",
    recommendation:
      "Add a persuasive meta description that explains the page benefit and encourages clicks."
  });

  check("seo", {
    name: "Meta description length",
    passed: metaDescription.length >= 90 && metaDescription.length <= 170,
    severity: "medium",
    points: 0.6,
    passMessage: `Meta description length looks healthy at ${metaDescription.length} characters.`,
    failMessage: `Meta description length is ${metaDescription.length} characters.`,
    recommendation:
      "Aim for roughly 90–170 characters and include a clear reason to visit.",
    evidence: metaDescription
  });

  check("seo", {
    name: "Single H1",
    passed: h1s.length === 1,
    severity: h1s.length === 0 ? "high" : "medium",
    points: h1s.length === 0 ? 1.1 : 0.6,
    passMessage: "Exactly one H1 found.",
    failMessage:
      h1s.length === 0
        ? "Missing H1."
        : `Multiple H1s found: ${h1s.length}.`,
    recommendation: "Use one clear H1 that describes the main page topic."
  });

  /**
   * Content checks
   */
  check("content", {
    name: "Content depth",
    passed: wordCount >= 500,
    severity: wordCount < 250 ? "high" : "medium",
    points: wordCount < 250 ? 2 : 0.8,
    passMessage: `Healthy visible content depth: approximately ${wordCount} words.`,
    failMessage: `Visible content is thin: approximately ${wordCount} words.`,
    recommendation:
      "Add useful copy covering benefits, ingredients, use cases, objections, FAQs, comparisons and trust signals.",
    evidence: `${wordCount} words`
  });

  check("content", {
    name: "Section structure",
    passed: h2s.length >= 3,
    severity: "medium",
    points: 0.8,
    passMessage: `Page has ${h2s.length} H2 sections.`,
    failMessage: `Page only has ${h2s.length} H2 sections.`,
    recommendation:
      "Use H2s to create scannable sections for benefits, FAQs, reviews, delivery, ingredients, comparisons and usage."
  });

  const contentSignals = {
    benefits: /benefit|helps|supports|improves|boost|energy|focus|hydration/i,
    ingredients: /ingredient|nutrition|vitamin|mineral|caffeine|sugar|calorie/i,
    usage: /how to use|when to use|serving|daily|morning|workout|gaming|study/i,
    objections: /shipping|returns|refund|guarantee|safe|secure|delivery/i,
    socialProof: /review|rated|stars|testimonial|customer/i
  };

  Object.entries(contentSignals).forEach(([name, regex]) => {
    check("content", {
      name: `Content signal: ${name}`,
      passed: regex.test(text),
      severity: "low",
      points: 0.35,
      passMessage: `${formatCategory(name)} content signal found.`,
      failMessage: `Weak or missing ${formatCategory(name)} content signal.`,
      recommendation: `Add clearer ${formatCategory(name)} content where relevant.`
    });
  });

  /**
   * GEO checks
   */
  check("geo", {
    name: "JSON-LD structured data",
    passed: schema.hasJsonLd,
    severity: "high",
    points: 1.4,
    passMessage: `JSON-LD detected: ${
      schema.types.length ? schema.types.join(", ") : "type not identified"
    }.`,
    failMessage: "No JSON-LD structured data detected.",
    recommendation:
      "Add structured data such as Product, Organization, FAQPage, BreadcrumbList, Article, CollectionPage or Review where relevant."
  });

  check("geo", {
    name: "Schema type clarity",
    passed: schema.types.length > 0,
    severity: "medium",
    points: 0.7,
    passMessage: `Schema types identified: ${schema.types.join(", ")}.`,
    failMessage: "Structured data type could not be identified.",
    recommendation:
      "Ensure JSON-LD uses explicit @type values and validates cleanly."
  });

  const geoChecks = [
    {
      name: "Answer-style copy",
      regex: /what is|how does|how to|why|which|best|can you|does it|is it/i,
      recommendation:
        "Add direct answer blocks that explain the product, use case, benefits and objections in plain language."
    },
    {
      name: "FAQ coverage",
      regex: /faq|frequently asked|question|answer/i,
      recommendation:
        "Add natural-language FAQs with concise answers and FAQPage schema where suitable."
    },
    {
      name: "Entity clarity",
      regex:
        /gaming nectar|brand|product|energy drink|healthy energy|clean energy|caffeine|vitamin/i,
      recommendation:
        "Clearly state who the brand is, what the product is, what category it belongs to, and who it is for."
    },
    {
      name: "Comparison context",
      regex: /compare|versus|vs\.|alternative|better than|difference|instead of/i,
      recommendation:
        "Add comparison sections against common alternatives, use cases, or competitor-style choices."
    },
    {
      name: "Evidence and proof",
      regex: /review|rated|tested|certified|customer|ingredient|nutrition|study/i,
      recommendation:
        "Add proof points such as reviews, ingredient evidence, nutritional facts, testing or customer outcomes."
    },
    {
      name: "Topical coverage",
      regex: /energy|focus|gaming|study|workout|hydration|vitamin|mineral|sugar|calorie/i,
      recommendation:
        "Expand supporting topical language so AI systems understand the page context."
    },
    {
      name: "Source-of-truth clarity",
      regex: /about|contact|shipping|returns|ingredients|nutrition|reviews|guarantee/i,
      recommendation:
        "Make key factual information easy to find and consistently stated across the site."
    }
  ];

  geoChecks.forEach((item) => {
    check("geo", {
      name: item.name,
      passed: item.regex.test(text),
      severity: "medium",
      points: 0.55,
      passMessage: `${item.name} signal found.`,
      failMessage: `${item.name} signal appears weak or missing.`,
      recommendation: item.recommendation
    });
  });

  /**
   * Linking checks
   */
  check("linking", {
    name: "Internal links",
    passed: links.internalCount >= 5,
    severity: "medium",
    points: 1,
    passMessage: `${links.internalCount} internal links detected.`,
    failMessage: `Only ${links.internalCount} internal links detected.`,
    recommendation:
      "Add internal links to relevant products, collections, guides, FAQs and supporting pages."
  });

  check("linking", {
    name: "External links",
    passed: links.externalCount > 0,
    severity: "low",
    points: 0.35,
    passMessage: `${links.externalCount} external links detected.`,
    failMessage: "No external links detected.",
    recommendation:
      "Where useful, cite trusted external references, review platforms, certifications or social proof."
  });

  check("linking", {
    name: "Link volume balance",
    passed: links.total <= 180,
    severity: "low",
    points: 0.4,
    passMessage: "Link volume appears reasonable.",
    failMessage: `High link count detected: ${links.total}.`,
    recommendation:
      "Review whether navigation, filters or repeated links are bloating the page."
  });

  /**
   * Accessibility
   */
  check("accessibility", {
    name: "Image alt text",
    passed: imageStats.total === 0 || imageStats.missingAlt === 0,
    severity: "medium",
    points: Math.min(2.5, imageStats.missingAlt * 0.25),
    passMessage: "Images appear to include alt attributes.",
    failMessage: `${imageStats.missingAlt} of ${imageStats.total} images appear to be missing alt text.`,
    recommendation:
      "Add descriptive alt text to meaningful images and empty alt attributes to decorative images."
  });

  check("accessibility", {
    name: "Accessible actions",
    passed: /<button|role=["']button["']|type=["']submit["']/i.test(safeHtml),
    severity: "low",
    points: 0.5,
    passMessage: "Button/action elements detected.",
    failMessage: "No obvious semantic button elements detected.",
    recommendation:
      "Make sure important actions use semantic buttons or accessible links."
  });

  /**
   * Performance
   */
  check("performance", {
    name: "Initial response speed",
    passed: loadMs <= 1800,
    severity: loadMs > 3500 ? "high" : "medium",
    points: loadMs > 3500 ? 2.2 : 1,
    passMessage: `Initial fetch time looks good at ${loadMs}ms.`,
    failMessage: `Initial fetch took ${loadMs}ms.`,
    recommendation:
      "Review app scripts, large assets, server response time, third-party scripts and theme bloat."
  });

  check("performance", {
    name: "Script count",
    passed: scriptCount <= 30,
    severity: scriptCount > 45 ? "high" : "medium",
    points: scriptCount > 45 ? 1.4 : 0.8,
    passMessage: `Script count is acceptable at ${scriptCount}.`,
    failMessage: `High script count detected: ${scriptCount}.`,
    recommendation:
      "Audit Shopify apps, pixels, tracking scripts and unused JavaScript."
  });

  check("performance", {
    name: "Stylesheet count",
    passed: styleCount <= 18,
    severity: "low",
    points: 0.4,
    passMessage: `Stylesheet/style count is acceptable at ${styleCount}.`,
    failMessage: `High stylesheet/style count detected: ${styleCount}.`,
    recommendation: "Review duplicated app CSS and theme CSS."
  });

  /**
   * Commercial checks
   */
  commercialCheck(
    "conversion",
    "Primary CTA",
    /add to cart|buy now|shop now|subscribe|checkout|get started|view product|choose option/i,
    text,
    1.4
  );

  commercialCheck(
    "conversion",
    "Pricing clarity",
    /£|\$|€|price|sale|regular price|compare at|from £|from \$|from €/i,
    text,
    0.8
  );

  commercialCheck(
    "conversion",
    "Value/offer signal",
    /limited|selling fast|popular|bestseller|offer|save|discount|bundle/i,
    text,
    0.5
  );

  commercialCheck(
    "trust",
    "Reviews/social proof",
    /review|rated|stars|testimonial|customer/i,
    text,
    0.7
  );

  commercialCheck(
    "trust",
    "Delivery/returns clarity",
    /shipping|delivery|dispatch|returns|refund/i,
    text,
    0.7
  );

  commercialCheck(
    "trust",
    "Contact/help clarity",
    /contact|email|support|help/i,
    text,
    0.5
  );

  commercialCheck(
    "trust",
    "Guarantee/security",
    /guarantee|secure|safe|trusted|money back/i,
    text,
    0.5
  );

  commercialCheck(
    "merchandising",
    "Variant clarity",
    /variant|flavour|flavor|size|pack|bundle|quantity/i,
    text,
    0.7
  );

  commercialCheck(
    "merchandising",
    "Ingredient/nutrition clarity",
    /ingredient|nutrition|vitamin|mineral|caffeine|sugar|calorie/i,
    text,
    0.7
  );

  commercialCheck(
    "merchandising",
    "Use-case clarity",
    /gaming|study|work|focus|energy|workout|daily|morning/i,
    text,
    0.7
  );

  commercialCheck(
    "merchandising",
    "Benefit clarity",
    /benefit|supports|helps|clean energy|healthy energy|focus/i,
    text,
    0.7
  );

  function commercialCheck(category, name, regex, inputText, points) {
    check(category, {
      name,
      passed: regex.test(inputText),
      severity: "medium",
      points,
      passMessage: `${name} signal found.`,
      failMessage: `${name} signal appears weak or missing.`,
      recommendation: `Strengthen ${name.toLowerCase()} messaging on important commercial pages.`
    });
  }

  const overallScore = average(Object.values(categoryScores));

  return {
    url,
    status,
    loadMs,
    title,
    metaDescription,
    h1s,
    h2s,
    h3s,
    wordCount,
    scriptCount,
    styleCount,
    schemaTypes: schema.types,
    imageStats,
    links,
    overallScore,
    categoryScores,
    categoryDetails,
    issues,
    wins,
    recommendations: [...new Set(recommendations)].slice(0, 20),
    insights: [
      {
        label: "Word count",
        value: wordCount,
        note: "Approximate visible text words."
      },
      {
        label: "Headings",
        value: `${h1s.length} H1 / ${h2s.length} H2 / ${h3s.length} H3`,
        note: "Useful for SEO, scanning and GEO."
      },
      {
        label: "Images",
        value: `${imageStats.total} total / ${imageStats.missingAlt} missing alt`,
        note: "Alt text helps accessibility and context."
      },
      {
        label: "Links",
        value: `${links.internalCount} internal / ${links.externalCount} external`,
        note: "Internal links help topical authority."
      },
      {
        label: "Schema",
        value: schema.types.length ? schema.types.join(", ") : "None detected",
        note: "Structured data supports machine readability."
      },
      {
        label: "Scripts",
        value: scriptCount,
        note: "High script counts can slow pages."
      }
    ],
    checkedAt: new Date().toISOString()
  };
}

export function summariseSiteAudit(results) {
  const validResults = results.filter((r) => r && r.categoryScores);
  const averageScore = average(validResults.map((r) => r.overallScore));

  const categoryAverages = {};

  CATEGORIES.forEach((category) => {
    categoryAverages[category] = average(
      validResults.map((r) => r.categoryScores[category] || 0)
    );
  });

  const allIssues = validResults.flatMap((result) =>
    result.issues.map((issue) => ({
      ...issue,
      url: result.url,
      pageTitle: result.title
    }))
  );

  const issueCounts = {};

  allIssues.forEach((issue) => {
    issueCounts[issue.category] = (issueCounts[issue.category] || 0) + 1;
  });

  const weakestPages = [...validResults]
    .sort((a, b) => a.overallScore - b.overallScore)
    .slice(0, 10);

  const strongestPages = [...validResults]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10);

  const priorityIssues = allIssues
    .filter((issue) => ["critical", "high"].includes(issue.severity))
    .slice(0, 25);

  return {
    averageScore,
    categoryAverages,
    totalPages: validResults.length,
    totalIssues: allIssues.length,
    issueCounts,
    weakestPages,
    strongestPages,
    priorityIssues
  };
}

export function compareAudits(primary, competitors = []) {
  const comparisons = competitors.map((competitor) => {
    const categoryDiffs = {};

    Object.keys(primary.categoryScores).forEach((category) => {
      categoryDiffs[category] = round1(
        competitor.categoryScores[category] - primary.categoryScores[category]
      );
    });

    return {
      url: competitor.url,
      title: competitor.title,
      overallDifference: round1(competitor.overallScore - primary.overallScore),
      categoryDiffs,
      competitorScore: competitor.overallScore
    };
  });

  const opportunities = [];

  competitors.forEach((competitor) => {
    Object.entries(competitor.categoryScores).forEach(([category, score]) => {
      const ownScore = primary.categoryScores[category];

      if (score - ownScore >= 1) {
        opportunities.push({
          category,
          message: `Competitor is stronger in ${formatCategory(
            category
          )} by ${round1(score - ownScore)} points.`,
          competitorUrl: competitor.url
        });
      }
    });

    if (competitor.wordCount > primary.wordCount * 1.5) {
      opportunities.push({
        category: "content",
        message: `Competitor has deeper visible content: ${competitor.wordCount} words vs your ${primary.wordCount}.`,
        competitorUrl: competitor.url
      });
    }

    if (competitor.schemaTypes.length > primary.schemaTypes.length) {
      opportunities.push({
        category: "geo",
        message: `Competitor has more detected schema types: ${competitor.schemaTypes.join(
          ", "
        )}.`,
        competitorUrl: competitor.url
      });
    }
  });

  return {
    primaryUrl: primary.url,
    primaryScore: primary.overallScore,
    competitors: comparisons,
    opportunities: opportunities.slice(0, 20)
  };
}

function createCategoryScores() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 10]));
}

function createCategoryDetails() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, []]));
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

function extractHeadings(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, "gis");
  const headings = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    headings.push(cleanText(stripTags(match[1])));
  }

  return headings.filter(Boolean).slice(0, 40);
}

function analyseImages(html) {
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];

  const missingAlt = imageTags.filter(
    (img) => !/\salt=["'][^"']*["']/i.test(img)
  ).length;

  return {
    total: imageTags.length,
    missingAlt
  };
}

function analyseLinks(html, pageUrl) {
  const linkMatches = [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)
  ];

  const origin = getOrigin(pageUrl);

  let internalCount = 0;
  let externalCount = 0;

  linkMatches.forEach((match) => {
    const href = match[1];

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    if (href.startsWith("/") || href.includes(origin)) {
      internalCount += 1;
    } else if (href.startsWith("http")) {
      externalCount += 1;
    }
  });

  return {
    total: internalCount + externalCount,
    internalCount,
    externalCount
  };
}

function analyseSchema(html) {
  const hasJsonLd = /application\/ld\+json/i.test(html);
  const types = new Set();

  const jsonLdMatches = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  jsonLdMatches.forEach((match) => {
    try {
      const raw = cleanJson(match[1]);
      const parsed = JSON.parse(raw);
      collectSchemaTypes(parsed, types);
    } catch {
      // Ignore invalid JSON-LD in this version.
    }
  });

  return {
    hasJsonLd,
    types: [...types].slice(0, 20)
  };
}

function collectSchemaTypes(value, types) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaTypes(item, types));
    return;
  }

  if (typeof value === "object") {
    if (value["@type"]) {
      if (Array.isArray(value["@type"])) {
        value["@type"].forEach((type) => types.add(String(type)));
      } else {
        types.add(String(value["@type"]));
      }
    }

    if (value["@graph"]) {
      collectSchemaTypes(value["@graph"], types);
    }
  }
}

function extractVisibleText(html) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function countWords(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function cleanText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cleanJson(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function average(values) {
  const cleanValues = values.filter((value) => typeof value === "number");

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return round1(total / cleanValues.length);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function formatCategory(category) {
  return category
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}