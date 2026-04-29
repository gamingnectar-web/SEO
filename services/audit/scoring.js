export function calculatePageAudit({ url, html, status, loadMs }) {
  const safeHtml = html || "";
  const text = extractVisibleText(safeHtml);

  const title = extractTitle(safeHtml);
  const metaDescription = extractMetaDescription(safeHtml);
  const h1s = extractHeadings(safeHtml, "h1");
  const h2s = extractHeadings(safeHtml, "h2");
  const imageStats = analyseImages(safeHtml);
  const links = analyseLinks(safeHtml, url);
  const schema = analyseSchema(safeHtml);
  const wordCount = countWords(text);
  const scriptCount = countMatches(safeHtml, /<script\b/gi);
  const styleCount = countMatches(safeHtml, /<style\b|rel=["']stylesheet["']/gi);

  const categoryScores = {
    technical: 10,
    seo: 10,
    content: 10,
    geo: 10,
    accessibility: 10,
    performance: 10,
    conversion: 10,
    trust: 10,
    merchandising: 10
  };

  const issues = [];
  const wins = [];
  const recommendations = [];
  const insights = [];

  function deduct(category, points, message, severity = "medium", recommendation = "") {
    categoryScores[category] = Math.max(0, round1(categoryScores[category] - points));

    issues.push({
      category,
      severity,
      message,
      points,
      recommendation
    });

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  function win(category, message) {
    wins.push({ category, message });
  }

  /**
   * Technical
   */
  if (!status || status >= 400) {
    deduct(
      "technical",
      5,
      `Page returned HTTP status ${status || "unknown"}.`,
      "critical",
      "Fix server errors, broken URLs, or redirects before making content improvements."
    );
  } else if (status >= 300) {
    deduct(
      "technical",
      1,
      `Page returned redirect status ${status}.`,
      "medium",
      "Check whether this URL should be the final canonical destination."
    );
  } else {
    win("technical", "Page returned a successful HTTP status.");
  }

  if (!safeHtml.includes("</html>")) {
    deduct(
      "technical",
      1,
      "HTML appears incomplete.",
      "medium",
      "Check whether the page is being interrupted, blocked, or partially rendered."
    );
  } else {
    win("technical", "HTML document appears complete.");
  }

  if (!/<meta[^>]+name=["']viewport["']/i.test(safeHtml)) {
    deduct(
      "technical",
      1,
      "Missing viewport meta tag.",
      "high",
      "Add a viewport meta tag so the page is mobile-friendly."
    );
  }

  /**
   * SEO
   */
  if (!title) {
    deduct(
      "seo",
      1.8,
      "Missing title tag.",
      "critical",
      "Add a descriptive title tag with the main query/topic near the front."
    );
  } else {
    if (title.length < 25) {
      deduct(
        "seo",
        0.8,
        `Title is short at ${title.length} characters.`,
        "medium",
        "Expand the title to make the page purpose clearer."
      );
    } else if (title.length > 65) {
      deduct(
        "seo",
        0.8,
        `Title is long at ${title.length} characters.`,
        "medium",
        "Shorten the title so important text is less likely to be truncated."
      );
    } else {
      win("seo", "Title length is within a sensible range.");
    }
  }

  if (!metaDescription) {
    deduct(
      "seo",
      1.3,
      "Missing meta description.",
      "high",
      "Add a persuasive meta description that explains the benefit of the page."
    );
  } else {
    if (metaDescription.length < 90) {
      deduct(
        "seo",
        0.6,
        `Meta description is short at ${metaDescription.length} characters.`,
        "medium",
        "Add more context and a reason to click."
      );
    } else if (metaDescription.length > 170) {
      deduct(
        "seo",
        0.6,
        `Meta description is long at ${metaDescription.length} characters.`,
        "medium",
        "Condense the meta description so it is easier to scan."
      );
    } else {
      win("seo", "Meta description length looks healthy.");
    }
  }

  if (h1s.length === 0) {
    deduct(
      "seo",
      1.2,
      "Missing H1 heading.",
      "high",
      "Add one clear H1 that describes the page topic."
    );
  } else if (h1s.length > 1) {
    deduct(
      "seo",
      0.7,
      `Multiple H1s found: ${h1s.length}.`,
      "medium",
      "Use one primary H1 and move secondary headings to H2/H3."
    );
  } else {
    win("seo", "Exactly one H1 found.");
  }

  if (!/<link[^>]+rel=["']canonical["']/i.test(safeHtml)) {
    deduct(
      "seo",
      0.8,
      "Missing canonical tag.",
      "medium",
      "Add a canonical tag to clarify the preferred URL."
    );
  } else {
    win("seo", "Canonical tag found.");
  }

  if (links.internalCount < 3) {
    deduct(
      "seo",
      0.8,
      `Only ${links.internalCount} internal links detected.`,
      "medium",
      "Add relevant internal links to collections, products, guides, FAQs, or supporting pages."
    );
  }

  /**
   * Content
   */
  if (wordCount < 250) {
    deduct(
      "content",
      2,
      `Page has low visible text volume: approximately ${wordCount} words.`,
      "high",
      "Add useful copy that explains the product, category, benefits, use cases, objections, and FAQs."
    );
  } else if (wordCount < 600) {
    deduct(
      "content",
      0.8,
      `Page has moderate visible text volume: approximately ${wordCount} words.`,
      "medium",
      "Consider adding deeper supporting content if this page is important for search."
    );
  } else {
    win("content", `Healthy visible content depth detected: approximately ${wordCount} words.`);
  }

  if (h2s.length < 2) {
    deduct(
      "content",
      0.8,
      `Only ${h2s.length} H2 heading(s) found.`,
      "medium",
      "Use H2 sections to organise benefits, ingredients, FAQs, reviews, shipping, comparisons, and use cases."
    );
  } else {
    win("content", "Page has multiple H2 sections.");
  }

  const contentSignals = {
    benefits: /benefit|helps|supports|improves|boost|energy|focus|hydration/i.test(text),
    ingredients: /ingredient|nutrition|vitamin|mineral|caffeine|sugar|calorie/i.test(text),
    usage: /how to use|when to use|serving|daily|morning|workout|gaming|study/i.test(text),
    objections: /shipping|returns|refund|guarantee|safe|secure|delivery/i.test(text),
    reviews: /review|rated|stars|testimonial|customer/i.test(text)
  };

  Object.entries(contentSignals).forEach(([name, present]) => {
    if (!present) {
      deduct(
        "content",
        0.3,
        `Missing or weak ${name} content signal.`,
        "low",
        `Add clearer ${name} information where relevant.`
      );
    }
  });

  /**
   * GEO
   */
  if (!schema.hasJsonLd) {
    deduct(
      "geo",
      1.7,
      "No JSON-LD structured data detected.",
      "high",
      "Add schema such as Product, Organization, FAQPage, BreadcrumbList, Article, or CollectionPage."
    );
  } else {
    win("geo", "JSON-LD structured data detected.");
  }

  if (!schema.types.length) {
    deduct(
      "geo",
      0.8,
      "Structured data types could not be identified.",
      "medium",
      "Make schema types explicit and valid."
    );
  }

  const geoSignals = {
    answers: /what is|how does|how to|why|which|best|can you|does it/i.test(text),
    faq: /faq|frequently asked|question|answer/i.test(text),
    comparison: /compare|versus|vs\.|alternative|better than|difference/i.test(text),
    entityClarity: /gaming nectar|brand|product|energy drink|healthy energy|clean energy/i.test(text),
    evidence: /review|rated|study|tested|certified|customer|ingredient/i.test(text)
  };

  if (!geoSignals.answers) {
    deduct(
      "geo",
      1,
      "Weak answer-style content.",
      "medium",
      "Add concise answer blocks that directly answer customer questions."
    );
  }

  if (!geoSignals.faq) {
    deduct(
      "geo",
      0.8,
      "No obvious FAQ content detected.",
      "medium",
      "Add FAQs using natural questions and concise answers."
    );
  }

  if (!geoSignals.comparison) {
    deduct(
      "geo",
      0.5,
      "No comparison-style content detected.",
      "low",
      "Add comparisons against alternatives, use cases, or common customer choices."
    );
  }

  if (!geoSignals.entityClarity) {
    deduct(
      "geo",
      1,
      "Brand/product entity clarity appears weak.",
      "medium",
      "Clearly state who Gaming Nectar is, what the product is, who it is for, and why it is different."
    );
  }

  /**
   * Accessibility
   */
  if (imageStats.total > 0 && imageStats.missingAlt > 0) {
    deduct(
      "accessibility",
      Math.min(2.5, imageStats.missingAlt * 0.25),
      `${imageStats.missingAlt} of ${imageStats.total} images appear to be missing alt text.`,
      "medium",
      "Add descriptive alt text to meaningful images and empty alt text to decorative images."
    );
  } else if (imageStats.total > 0) {
    win("accessibility", "Images appear to include alt attributes.");
  }

  if (!/<button|role=["']button["']|type=["']submit["']/i.test(safeHtml)) {
    deduct(
      "accessibility",
      0.6,
      "No accessible button elements detected.",
      "low",
      "Make sure important actions use semantic buttons or accessible links."
    );
  }

  /**
   * Performance
   */
  if (loadMs > 3500) {
    deduct(
      "performance",
      2.2,
      `Initial fetch took ${loadMs}ms.`,
      "high",
      "Review server response time, app scripts, large assets, and third-party scripts."
    );
  } else if (loadMs > 1800) {
    deduct(
      "performance",
      1,
      `Initial fetch took ${loadMs}ms.`,
      "medium",
      "There may be room to improve response speed."
    );
  } else {
    win("performance", `Initial fetch time looks good at ${loadMs}ms.`);
  }

  if (scriptCount > 45) {
    deduct(
      "performance",
      1.5,
      `Very high script count detected: ${scriptCount}.`,
      "high",
      "Audit Shopify apps, tracking pixels, theme scripts, and unused JavaScript."
    );
  } else if (scriptCount > 30) {
    deduct(
      "performance",
      0.8,
      `High script count detected: ${scriptCount}.`,
      "medium",
      "Review whether all scripts are required."
    );
  }

  if (styleCount > 18) {
    deduct(
      "performance",
      0.5,
      `High stylesheet/style count detected: ${styleCount}.`,
      "low",
      "Review theme and app CSS for duplication."
    );
  }

  /**
   * Conversion
   */
  const hasCTA = /add to cart|buy now|shop now|subscribe|checkout|get started|view product|choose option/i.test(text);
  const hasPrice = /£|\$|€|price|sale|regular price|compare at|from £|from \$|from €/i.test(text);
  const hasUrgency = /limited|selling fast|popular|bestseller|offer|save|discount|bundle/i.test(text);

  if (!hasCTA) {
    deduct(
      "conversion",
      1.8,
      "No obvious conversion CTA detected.",
      "high",
      "Add or strengthen CTAs such as Add to Cart, Shop Now, Buy Now, or Subscribe."
    );
  } else {
    win("conversion", "Conversion CTA detected.");
  }

  if (!hasPrice) {
    deduct(
      "conversion",
      0.9,
      "No clear pricing signal detected.",
      "medium",
      "Make price information visible on product and collection pages."
    );
  }

  if (!hasUrgency) {
    deduct(
      "conversion",
      0.4,
      "No urgency, offer, bundle, or value signal detected.",
      "low",
      "Consider adding value messaging such as bundles, savings, bestsellers, or limited offers."
    );
  }

  /**
   * Trust
   */
  const trustSignals = {
    reviews: /review|rated|stars|testimonial|customer/i.test(text),
    delivery: /shipping|delivery|dispatch|returns|refund/i.test(text),
    contact: /contact|email|support|help/i.test(text),
    guarantee: /guarantee|secure|safe|trusted|money back/i.test(text)
  };

  Object.entries(trustSignals).forEach(([name, present]) => {
    if (!present) {
      deduct(
        "trust",
        0.5,
        `Weak ${name} trust signal.`,
        "medium",
        `Add clearer ${name} information where relevant.`
      );
    }
  });

  /**
   * Merchandising
   */
  const merchandisingSignals = {
    variants: /variant|flavour|flavor|size|pack|bundle|quantity/i.test(text),
    ingredients: /ingredient|nutrition|vitamin|mineral|caffeine|sugar|calorie/i.test(text),
    useCase: /gaming|study|work|focus|energy|workout|daily|morning/i.test(text),
    benefits: /benefit|supports|helps|clean energy|healthy energy|focus/i.test(text)
  };

  Object.entries(merchandisingSignals).forEach(([name, present]) => {
    if (!present) {
      deduct(
        "merchandising",
        0.5,
        `Weak ${name} merchandising signal.`,
        "medium",
        `Strengthen ${name} messaging on product or collection pages.`
      );
    }
  });

  const overallScore = average(Object.values(categoryScores));

  insights.push({
    label: "Word count",
    value: wordCount,
    note: "Approximate visible text words found in the HTML."
  });

  insights.push({
    label: "Headings",
    value: `${h1s.length} H1 / ${h2s.length} H2`,
    note: "Useful for structure, scanning, SEO and GEO."
  });

  insights.push({
    label: "Images",
    value: `${imageStats.total} total / ${imageStats.missingAlt} missing alt`,
    note: "Alt text helps accessibility and image context."
  });

  insights.push({
    label: "Links",
    value: `${links.internalCount} internal / ${links.externalCount} external`,
    note: "Internal links help discovery and topical authority."
  });

  insights.push({
    label: "Schema",
    value: schema.types.length ? schema.types.join(", ") : "None detected",
    note: "Structured data improves machine readability."
  });

  insights.push({
    label: "Scripts",
    value: scriptCount,
    note: "High script counts can hurt performance."
  });

  return {
    url,
    status,
    loadMs,
    title,
    metaDescription,
    h1s,
    h2s,
    wordCount,
    scriptCount,
    styleCount,
    schemaTypes: schema.types,
    imageStats,
    links,
    overallScore,
    categoryScores,
    issues,
    wins,
    recommendations: [...new Set(recommendations)].slice(0, 12),
    insights,
    checkedAt: new Date().toISOString()
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

    const strongerCategories = Object.entries(categoryDiffs)
      .filter(([, diff]) => diff > 0.4)
      .map(([category, diff]) => ({ category, diff }));

    const weakerCategories = Object.entries(categoryDiffs)
      .filter(([, diff]) => diff < -0.4)
      .map(([category, diff]) => ({ category, diff: Math.abs(diff) }));

    return {
      url: competitor.url,
      title: competitor.title,
      overallDifference: round1(competitor.overallScore - primary.overallScore),
      categoryDiffs,
      strongerCategories,
      weakerCategories,
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
          message: `Competitor is stronger in ${formatCategory(category)} by ${round1(score - ownScore)} points.`,
          competitorUrl: competitor.url
        });
      }
    });

    if (competitor.wordCount > primary.wordCount * 1.5) {
      opportunities.push({
        category: "content",
        message: `Competitor has much deeper visible content: ${competitor.wordCount} words vs your ${primary.wordCount}.`,
        competitorUrl: competitor.url
      });
    }

    if (competitor.schemaTypes.length > primary.schemaTypes.length) {
      opportunities.push({
        category: "geo",
        message: `Competitor has more detected schema types: ${competitor.schemaTypes.join(", ")}.`,
        competitorUrl: competitor.url
      });
    }

    if (competitor.h2s.length > primary.h2s.length + 2) {
      opportunities.push({
        category: "content",
        message: `Competitor has more structured sections: ${competitor.h2s.length} H2s vs your ${primary.h2s.length}.`,
        competitorUrl: competitor.url
      });
    }
  });

  return {
    primaryUrl: primary.url,
    primaryScore: primary.overallScore,
    competitors: comparisons,
    opportunities: opportunities.slice(0, 12)
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

function extractHeadings(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, "gis");
  const headings = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    headings.push(cleanText(stripTags(match[1])));
  }

  return headings.filter(Boolean).slice(0, 20);
}

function analyseImages(html) {
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  const missingAlt = imageTags.filter((img) => !/\salt=["'][^"']*["']/i.test(img)).length;

  return {
    total: imageTags.length,
    missingAlt
  };
}

function analyseLinks(html, pageUrl) {
  const linkMatches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  const origin = getOrigin(pageUrl);

  let internalCount = 0;
  let externalCount = 0;

  linkMatches.forEach((match) => {
    const href = match[1];

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
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

  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  jsonLdMatches.forEach((match) => {
    try {
      const raw = cleanJson(match[1]);
      const parsed = JSON.parse(raw);
      collectSchemaTypes(parsed, types);
    } catch {
      // Ignore invalid JSON-LD for now.
    }
  });

  return {
    hasJsonLd,
    types: [...types].slice(0, 12)
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
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round1(total / values.length);
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