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
export function buildImprovementPlan(results, category) {
  const failedChecks = [];

  results.forEach((result) => {
    const checks = result.categoryDetails?.[category] || [];

    checks.forEach((check) => {
      if (check.status === "fail") {
        failedChecks.push({
          url: result.url,
          title: result.title || "Untitled page",
          checkName: check.name,
          severity: check.severity || "medium",
          message: check.message,
          recommendation: check.recommendation || "",
          evidence: check.evidence || ""
        });
      }
    });
  });

  const grouped = {};

  failedChecks.forEach((item) => {
    if (!grouped[item.checkName]) {
      grouped[item.checkName] = {
        checkName: item.checkName,
        severity: item.severity,
        message: item.message,
        recommendation: item.recommendation,
        affectedPages: [],
        count: 0
      };
    }

    grouped[item.checkName].count += 1;

    grouped[item.checkName].affectedPages.push({
      url: item.url,
      title: item.title,
      evidence: item.evidence
    });
  });

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      priority: calculatePriority(item.count, item.severity),
      context: getImprovementContext(category, item.checkName),
      affectedPages: item.affectedPages.slice(0, 8)
    }))
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 12);
}

function calculatePriority(count, severity) {
  const severityWeight = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2
  };

  const score = count * (severityWeight[severity] || 2);

  if (score >= 40) {
    return {
      label: "High priority",
      score
    };
  }

  if (score >= 15) {
    return {
      label: "Medium priority",
      score
    };
  }

  return {
    label: "Low priority",
    score
  };
}

function getImprovementContext(category, checkName) {
  const contexts = {
    geo: {
      "JSON-LD structured data": {
        why:
          "Structured data helps search engines and AI systems understand the page as a machine-readable entity, not just raw text.",
        how:
          "Add valid JSON-LD schema. For Shopify, prioritise Product, Organization, BreadcrumbList, FAQPage, CollectionPage and Article schema where relevant.",
        example:
          "A product page should clearly expose product name, image, description, price, availability, brand and reviews where available."
      },
            "Schema type clarity": {
        why:
          "If schema exists but the type is unclear or invalid, AI and search systems may not confidently classify the page.",
        how:
          "Check the JSON-LD and make sure every schema block includes a clear @type. Validate using Google Rich Results Test or Schema.org validator.",
        example:
          "Use @type: Product for product pages, @type: FAQPage for FAQ sections and @type: Organization for brand information."
      },
      "Answer-style copy": {
        why:
          "Generative engines often extract direct answers. Pages that only use marketing copy can be harder for AI systems to quote or summarise.",
        how:
          "Add short explanatory sections that answer what the product is, who it is for, how it works, why it is different and when to use it.",
        example:
          "Add sections like: What is Gaming Nectar? Who is it best for? How much caffeine is in it? Is it suitable for daily use?"
      },
      "FAQ coverage": {
        why:
          "FAQs are one of the clearest formats for AI search because they map directly to user questions.",
        how:
          "Add 4–8 genuine customer questions to important product, collection and landing pages. Keep answers concise and factual.",
        example:
          "Questions could cover caffeine, sugar, calories, ingredients, delivery, subscriptions, returns and usage."
      },
      "Entity clarity": {
        why:
          "AI systems need to understand the entity: the brand, product category, ingredients, audience and differentiators.",
        how:
          "Explicitly state who Gaming Nectar is, what the product is, what category it belongs to, and what makes it different.",
        example:
          "Instead of only saying 'clean kick', also say 'Gaming Nectar is a healthier energy drink designed for gamers, work and focus.'"
      },
      "Comparison context": {
        why:
          "AI answers often compare options. If your page does not explain how you compare to alternatives, competitors can dominate comparison queries.",
        how:
          "Add comparison content against coffee, standard energy drinks, sugary drinks, powdered energy products or competitor products.",
        example:
          "Create sections like 'Gaming Nectar vs traditional energy drinks' or 'Gaming Nectar vs coffee'."
      },
      "Evidence and proof": {
        why:
          "AI systems and users both trust pages more when claims are backed by specific evidence.",
        how:
          "Add reviews, ratings, ingredient rationale, nutritional facts, testing claims, customer outcomes or transparent product details.",
        example:
          "If you say 'healthy energy', support that with sugar level, vitamins, minerals, calories and caffeine content."
      },
      "Topical coverage": {
        why:
          "A page with shallow topical language may not be seen as authoritative for its intended search area.",
        how:
          "Add related terms naturally: energy, focus, gaming, study, work, hydration, vitamins, minerals, sugar and calories.",
        example:
          "Product and collection pages should describe use cases, benefits, ingredients and situations where the product fits."
      },
      "Source-of-truth clarity": {
        why:
          "AI systems prefer clear, consistent, easily found factual information across a site.",
        how:
          "Make ingredients, nutrition, shipping, returns, reviews, contact and guarantee information easy to find.",
        example:
          "Add persistent links or sections for ingredients, nutrition, delivery, returns and customer support."
      }
    },

    seo: {
      "Title exists": {
        why:
          "The title tag is one of the strongest page-level SEO signals and heavily influences search result snippets.",
        how:
          "Write a unique title for every important page. Put the main query or product/category topic near the front.",
        example:
          "Gaming Energy Drink | Clean Energy for Focus | Gaming Nectar"
      },
      "Title length": {
        why:
          "Titles that are too short lack context; titles that are too long can be truncated.",
        how:
          "Aim for useful, readable titles around 25–65 characters.",
        example:
          "Healthy Energy Drink for Gaming & Focus | Gaming Nectar"
      },
      "Meta description exists": {
        why:
          "Meta descriptions do not directly guarantee ranking, but they influence click-through and help frame the page.",
        how:
          "Add a persuasive description that explains what the page offers and why someone should click.",
        example:
          "Discover Gaming Nectar, a cleaner energy drink with vitamins and minerals for focus, gaming and everyday energy."
      },
      "Meta description length": {
        why:
          "Very short descriptions lack detail, while very long ones may be truncated.",
        how:
          "Aim for roughly 90–170 characters with a clear benefit and page topic.",
        example:
          "A clean energy drink made for gamers, creators and busy days. Explore flavours, benefits, ingredients and bundles."
      },
      "Single H1": {
        why:
          "The H1 helps search engines and users understand the main page topic.",
        how:
          "Use one clear H1 per page. Make it specific to the product, category or page purpose.",
        example:
          "Clean Energy Drinks for Gaming and Focus"
      }
    },

    technical: {
      "HTTP status": {
        why:
          "Pages returning errors or redirects can waste crawl budget and weaken user experience.",
        how:
          "Fix broken URLs, server errors, unnecessary redirects or inaccessible pages.",
        example:
          "Important pages should return 200 OK unless intentionally redirected."
      },
      "Complete HTML": {
        why:
          "Incomplete HTML can indicate rendering, server or crawler-access problems.",
        how:
          "Check whether the page loads fully, whether scripts are blocking content, or whether the request is being interrupted.",
        example:
          "View source and confirm the closing html tag and main content are present."
      },
      "Mobile viewport": {
        why:
          "A missing viewport tag can hurt mobile usability.",
        how:
          "Ensure your theme includes a viewport meta tag in the document head.",
        example:
          '<meta name="viewport" content="width=device-width, initial-scale=1">'
      },
      "Canonical": {
        why:
          "Canonical tags help prevent duplicate URL confusion.",
        how:
          "Add canonical tags pointing to the preferred version of each page.",
        example:
          "A product page should canonicalise to its clean product URL."
      },
      "Indexability hints": {
        why:
          "A noindex directive can prevent a page from appearing in Google.",
        how:
          "Remove noindex from pages that should rank. Keep noindex only for intentional private/utility pages.",
        example:
          "Collection, product and content pages should usually be indexable."
      }
    },

    linking: {
      "Internal links": {
        why:
          "Internal links help distribute authority and show relationships between products, collections and guides.",
        how:
          "Add contextual links between related products, collection pages, FAQs, blog posts and buying guides.",
        example:
          "From a product page, link to ingredients, bundles, subscription, FAQ and related flavours."
      },
      "External links": {
        why:
          "Trusted external references can support claims and improve credibility.",
        how:
          "Where appropriate, link to review platforms, certifications, studies, ingredient sources or social proof.",
        example:
          "If mentioning an ingredient benefit, link to a credible source or explain the evidence clearly."
      },
      "Link volume balance": {
        why:
          "Too many links can make a page feel cluttered and dilute attention.",
        how:
          "Reduce repeated navigation/filter links and prioritise useful contextual links.",
        example:
          "Avoid bloated menus or repeated product links if they do not help users."
      }
    },

    content: {
      "Content depth": {
        why:
          "Thin pages often fail to answer enough user questions to rank or convert well.",
        how:
          "Add deeper copy covering benefits, use cases, ingredients, comparisons, objections, FAQs and trust signals.",
        example:
          "A product page should explain what it is, who it is for, why it is different, ingredients, usage and FAQs."
      },
      "Section structure": {
        why:
          "Clear sections improve scanning, SEO and AI extraction.",
        how:
          "Use H2 sections for benefits, ingredients, FAQs, reviews, delivery, comparisons and usage.",
        example:
          "Suggested H2s: Benefits, Ingredients, How to Use, FAQs, Reviews, Delivery & Returns."
      },
      "Content signal: benefits": {
        why:
          "Users need to understand the outcome, not just the product.",
        how:
          "Explain the practical benefits in clear, specific language.",
        example:
          "Supports focus, cleaner energy, lower sugar, vitamins and minerals."
      },
      "Content signal: ingredients": {
        why:
          "Ingredients and nutrition matter strongly for food/drink trust and GEO.",
        how:
          "Show ingredient and nutrition information clearly on product pages.",
        example:
          "Include caffeine, sugar, calories, vitamins, minerals and flavour information."
      },
      "Content signal: usage": {
        why:
          "Usage context helps customers understand when and why to buy.",
        how:
          "Add guidance on when to drink it and who it suits.",
        example:
          "For gaming sessions, work focus, studying, workouts or busy days."
      },
      "Content signal: objections": {
        why:
          "Objections stop purchases. Addressing them improves conversion.",
        how:
          "Answer concerns around delivery, returns, safety, subscription, taste and ingredients.",
        example:
          "Add sections for shipping, returns, caffeine level and daily use."
      },
      "Content signal: socialProof": {
        why:
          "Reviews and proof reduce purchase hesitation.",
        how:
          "Add reviews, ratings, testimonials and real customer feedback.",
        example:
          "Show review stars near the product title and detailed reviews lower on the page."
      }
    }
  };

  return (
    contexts[category]?.[checkName] || {
      why:
        "This signal helps users, search engines and AI systems understand the page more clearly.",
      how:
        "Improve the page by making the information clearer, more specific and easier to find.",
      example:
        "Add concise, specific copy and structure it with clear headings and supporting details."
    }
  );
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