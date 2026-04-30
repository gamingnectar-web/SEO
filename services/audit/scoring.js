import {
  analyseSchemaDeep,
  buildSchemaConsistencyChecks
} from "./schema-deep-analysis.js";

import { buildGeoAeoChecks } from "./geo-aeo-analysis.js";
import { analysePageSituation } from "./page-situation-analysis.js";

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
  const schema = analyseSchemaDeep(safeHtml);

  const wordCount = countWords(text);
  const scriptCount = countMatches(safeHtml, /<script\b/gi);
  const styleCount = countMatches(
    safeHtml,
    /<style\b|rel=["']stylesheet["']/gi
  );

  const pageSituation = analysePageSituation({
    url,
    text,
    title
  });

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
      evidence = "",
      why = "",
      how = "",
      example = "",
      businessImpact = "",
      implementationHint = "",
      expectedImpact = "",
      effort = ""
    } = config;

    categoryDetails[category].push({
      name,
      status: passed ? "pass" : "fail",
      severity,
      message: passed ? passMessage : failMessage,
      recommendation,
      evidence,
      why,
      how,
      example,
      businessImpact,
      implementationHint,
      expectedImpact,
      effort
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
      evidence,
      why,
      how,
      example,
      businessImpact,
      implementationHint,
      expectedImpact,
      effort
    });

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  /**
   * TECHNICAL
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
    evidence: String(status || "unknown"),
    why:
      "Search engines, AI systems and users need to be able to access the page reliably.",
    how:
      "Fix broken URLs, server errors, redirect chains, blocked pages or incorrect route handling.",
    example:
      "Important product, collection and content pages should usually return 200 OK.",
    businessImpact:
      "Pages with poor availability can lose rankings, visibility and sales.",
    implementationHint:
      "Check Shopify redirects, theme routes, app proxy routes and any removed products or collections.",
    expectedImpact: "High",
    effort: "Medium"
  });

  check("technical", {
    name: "Complete HTML",
    passed: safeHtml.includes("</html>"),
    severity: "medium",
    points: 1,
    passMessage: "HTML document appears complete.",
    failMessage: "HTML appears incomplete or partially rendered.",
    recommendation:
      "Check whether the page is interrupted, blocked, or failing during render.",
    evidence: safeHtml.includes("</html>") ? "Closing HTML tag found" : "",
    why:
      "Incomplete HTML can stop crawlers and AI systems from seeing important content.",
    how:
      "Check theme rendering, app blocks, script errors, and whether content is injected too late by JavaScript.",
    example:
      "The source HTML should include the main product/category content and a closing </html> tag.",
    businessImpact:
      "Incomplete rendering can weaken SEO, GEO, indexing and user experience.",
    implementationHint:
      "Use View Source and Render logs to confirm the HTML is fully returned.",
    expectedImpact: "Medium",
    effort: "Medium"
  });

  check("technical", {
    name: "Mobile viewport",
    passed: /<meta[^>]+name=["']viewport["']/i.test(safeHtml),
    severity: "high",
    points: 1,
    passMessage: "Viewport meta tag found.",
    failMessage: "Missing viewport meta tag.",
    recommendation:
      "Add a viewport meta tag so the page is mobile-friendly and responsive.",
    evidence: "Checked HTML head for viewport meta tag",
    why:
      "Most ecommerce traffic is mobile. A missing viewport tag can harm mobile usability.",
    how:
      "Ensure your Shopify theme includes a viewport meta tag in the document head.",
    example:
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    businessImpact:
      "Poor mobile usability can reduce conversion and search performance.",
    implementationHint:
      "Add the viewport tag to theme.liquid inside the <head> section.",
    expectedImpact: "High",
    effort: "Low"
  });

  check("technical", {
    name: "Canonical",
    passed: /<link[^>]+rel=["']canonical["']/i.test(safeHtml),
    severity: "medium",
    points: 0.8,
    passMessage: "Canonical tag found.",
    failMessage: "Missing canonical tag.",
    recommendation:
      "Add a canonical tag to clarify the preferred URL for search engines.",
    evidence: "Checked HTML head for rel=canonical",
    why:
      "Canonical tags help prevent duplicate URL confusion, especially with Shopify product and collection URLs.",
    how:
      "Make sure each page declares its preferred clean URL.",
    example:
      "A product page should canonicalise to its main product URL rather than filtered or tracking URLs.",
    businessImpact:
      "Better canonicalisation can protect ranking signals and reduce duplicate-content confusion.",
    implementationHint:
      "Check your theme.liquid or SEO app output for canonical tag rendering.",
    expectedImpact: "Medium",
    effort: "Low"
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
      "Confirm whether this page should be excluded from search. Remove noindex if it should rank.",
    evidence: "Checked robots meta tag for noindex",
    why:
      "A noindex directive can prevent a page from appearing in Google and other search systems.",
    how:
      "Remove noindex from important product, collection, homepage and content pages.",
    example:
      "Product and collection pages should usually be indexable unless intentionally hidden.",
    businessImpact:
      "Accidental noindex can remove commercial pages from organic visibility.",
    implementationHint:
      "Check Shopify SEO settings, theme meta tags and any SEO apps.",
    expectedImpact: "High",
    effort: "Low"
  });

  /**
   * SEO
   */
  check("seo", {
    name: "Title exists",
    passed: Boolean(title),
    severity: "critical",
    points: 1.5,
    passMessage: "Title tag exists.",
    failMessage: "Missing title tag.",
    recommendation:
      "Add a descriptive title tag with the main keyword/topic near the start.",
    evidence: title || "No title detected",
    why:
      "The title tag is one of the strongest page-level SEO signals and affects search snippets.",
    how:
      "Write a unique, descriptive title for each important page using the main product, collection or query topic.",
    example:
      "Healthy Energy Drink for Gaming & Focus | Gaming Nectar",
    businessImpact:
      "Better titles can improve rankings, click-through and relevance for commercial queries.",
    implementationHint:
      "Set Shopify page/product SEO title fields or update theme SEO fallbacks.",
    expectedImpact: "High",
    effort: "Low"
  });

  check("seo", {
    name: "Title length",
    passed: title.length >= 25 && title.length <= 65,
    severity: "medium",
    points: 0.7,
    passMessage: `Title length looks sensible at ${title.length} characters.`,
    failMessage: `Title length is ${title.length} characters, outside the preferred range.`,
    recommendation: "Aim for a useful, readable title around 25–65 characters.",
    evidence: title,
    why:
      "Titles that are too short lack context. Titles that are too long may be truncated.",
    how:
      "Keep titles clear and commercially descriptive without overstuffing keywords.",
    example:
      "Clean Energy Drinks for Gaming and Focus | Gaming Nectar",
    businessImpact:
      "Better title clarity can improve click-through and topical relevance.",
    implementationHint:
      "Review product, collection and page SEO title fields in Shopify.",
    expectedImpact: "Medium",
    effort: "Low"
  });

  check("seo", {
    name: "Meta description exists",
    passed: Boolean(metaDescription),
    severity: "high",
    points: 1.2,
    passMessage: "Meta description exists.",
    failMessage: "Missing meta description.",
    recommendation:
      "Add a persuasive meta description that explains the page benefit and encourages clicks.",
    evidence: metaDescription || "No meta description detected",
    why:
      "Meta descriptions help frame the search result and can influence click-through.",
    how:
      "Write a concise description explaining what the page offers and why someone should visit.",
    example:
      "Discover cleaner energy drinks for focus, gaming and busy days. Explore flavours, benefits and bundles.",
    businessImpact:
      "Better descriptions can improve organic click-through and help users choose your result.",
    implementationHint:
      "Set Shopify SEO description fields for products, collections, pages and blogs.",
    expectedImpact: "Medium",
    effort: "Low"
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
    evidence: metaDescription,
    why:
      "Very short descriptions lack detail; very long ones may be truncated.",
    how:
      "Include the page topic, commercial benefit and reason to click.",
    example:
      "A clean energy drink made for gamers, creators and busy days. Explore flavours, benefits and bundles.",
    businessImpact:
      "Better snippets can improve qualified traffic from search.",
    implementationHint:
      "Use a consistent SEO description template for product and collection pages.",
    expectedImpact: "Medium",
    effort: "Low"
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
    recommendation: "Use one clear H1 that describes the main page topic.",
    evidence: h1s.length ? h1s.join(" | ") : "No H1 found",
    why:
      "The H1 helps users, search engines and AI systems understand the main topic of the page.",
    how:
      "Use one specific H1 that matches the product, collection or content purpose.",
    example:
      "Clean Energy Drinks for Gaming and Focus",
    businessImpact:
      "Clear H1s improve page comprehension and topical targeting.",
    implementationHint:
      "Check Shopify product title, collection title and custom section heading output.",
    expectedImpact: "Medium",
    effort: "Low"
  });

  /**
   * CONTENT
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
    evidence: `${wordCount} words`,
    why:
      "Thin pages often fail to answer enough questions to rank, convert or be used confidently by AI systems.",
    how:
      "Expand important product and collection pages with helpful, structured, user-facing content.",
    example:
      "Include benefits, ingredients, how to use, FAQs, reviews, delivery, returns and comparisons.",
    businessImpact:
      "Stronger content can improve SEO/GEO visibility and purchase confidence.",
    implementationHint:
      "Add reusable Shopify sections for product education, FAQs, nutrition and trust blocks.",
    expectedImpact: "High",
    effort: "Medium"
  });

  check("content", {
    name: "Section structure",
    passed: h2s.length >= 3,
    severity: "medium",
    points: 0.8,
    passMessage: `Page has ${h2s.length} H2 sections.`,
    failMessage: `Page only has ${h2s.length} H2 sections.`,
    recommendation:
      "Use H2s to create scannable sections for benefits, FAQs, reviews, delivery, ingredients, comparisons and usage.",
    evidence: h2s.length ? h2s.slice(0, 8).join(" | ") : "No H2s found",
    why:
      "Clear section structure improves scanning, SEO and AI extraction.",
    how:
      "Break important content into clear H2-led sections.",
    example:
      "Benefits, Ingredients, How to Use, FAQs, Reviews, Delivery & Returns.",
    businessImpact:
      "Better structure makes pages easier to understand and more useful for search and AI systems.",
    implementationHint:
      "Use Shopify sections with meaningful heading tags, not only styled divs.",
    expectedImpact: "Medium",
    effort: "Medium"
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
      recommendation: `Add clearer ${formatCategory(name)} content where relevant.`,
      evidence: `Checked visible text for ${name} language`,
      why: getContentSignalContext(name).why,
      how: getContentSignalContext(name).how,
      example: getContentSignalContext(name).example,
      businessImpact: getContentSignalContext(name).businessImpact,
      implementationHint: getContentSignalContext(name).implementationHint,
      expectedImpact: getContentSignalContext(name).expectedImpact,
      effort: getContentSignalContext(name).effort
    });
  });

  /**
   * GEO / AEO / SCHEMA
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
      "Add structured data such as Product, Organization, FAQPage, BreadcrumbList, Article, CollectionPage or Review where relevant.",
    evidence: schema.types.length ? schema.types.join(", ") : "No schema types found",
    why:
      "Structured data helps search engines and AI systems understand your pages as machine-readable entities.",
    how:
      "Add valid JSON-LD for the page type and make sure it matches visible content.",
    example:
      "Product pages should include Product schema. FAQ sections should include FAQPage schema only when visible.",
    businessImpact:
      "Better structured data can improve eligibility for rich results and strengthen AI/search understanding.",
    implementationHint:
      "Use theme JSON-LD snippets or a Shopify schema app, but validate that output matches visible content.",
    expectedImpact: "High",
    effort: "Medium"
  });

  check("geo", {
    name: "Schema type clarity",
    passed: schema.types.length > 0,
    severity: "medium",
    points: 0.7,
    passMessage: `Schema types identified: ${schema.types.join(", ")}.`,
    failMessage: "Structured data type could not be identified.",
    recommendation:
      "Ensure JSON-LD uses explicit @type values and validates cleanly.",
    evidence: schema.types.length ? schema.types.join(", ") : "No @type values found",
    why:
      "If schema exists but the type is unclear, search and AI systems may not confidently classify the page.",
    how:
      "Ensure every schema block has a clear @type and is valid JSON-LD.",
    example:
      "Use @type Product for product pages, FAQPage for visible FAQs, and Organization for brand/entity information.",
    businessImpact:
      "Clear schema types improve machine readability and reduce ambiguity.",
    implementationHint:
      "Check generated Shopify schema for missing or malformed @type fields.",
    expectedImpact: "Medium",
    effort: "Low"
  });

  const schemaConsistencyChecks = buildSchemaConsistencyChecks({
    schema,
    text,
    title,
    metaDescription,
    h1s
  });

  schemaConsistencyChecks.forEach((item) => {
    check("geo", item);
  });

  const geoAeoChecks = buildGeoAeoChecks({
    text,
    title,
    metaDescription,
    h1s,
    h2s
  });

  geoAeoChecks.forEach((item) => {
    check("geo", item);
  });

  const geoChecks = [
    {
      name: "Answer-style copy",
      regex: /what is|how does|how to|why|which|best|can you|does it|is it/i,
      recommendation:
        "Add direct answer blocks that explain the product, use case, benefits and objections in plain language.",
      why:
        "Generative engines often extract direct answers. Pages that only use marketing copy can be harder for AI systems to quote or summarise.",
      how:
        "Add short explanatory sections that answer what the product is, who it is for, how it works, why it is different and when to use it.",
      example:
        "What is Gaming Nectar? Gaming Nectar is a cleaner energy drink designed for focus, gaming, work and busy days."
    },
    {
      name: "FAQ coverage",
      regex: /faq|frequently asked|question|answer/i,
      recommendation:
        "Add natural-language FAQs with concise answers and FAQPage schema where suitable.",
      why:
        "FAQs map directly to customer questions and AI-answer formats.",
      how:
        "Add 4–8 genuine questions to important product, collection and landing pages.",
      example:
        "How much caffeine is in it? Is it suitable for daily use? How long does delivery take?"
    },
    {
      name: "Entity clarity",
      regex:
        /gaming nectar|brand|product|energy drink|healthy energy|clean energy|caffeine|vitamin/i,
      recommendation:
        "Clearly state who the brand is, what the product is, what category it belongs to, and who it is for.",
      why:
        "AI systems need to understand the entity before they can confidently mention or recommend it.",
      how:
        "Use clear, repeated brand/product/category language across key pages.",
      example:
        "Gaming Nectar is a cleaner energy drink for gamers, creators and busy people who want focus and energy."
    },
    {
      name: "Comparison context",
      regex: /compare|versus|vs\.|alternative|better than|difference|instead of/i,
      recommendation:
        "Add comparison sections against common alternatives, use cases, or competitor-style choices.",
      why:
        "AI answers often compare options. Without comparison content, competitors can be easier to recommend.",
      how:
        "Explain how your product compares against coffee, standard energy drinks, sugary drinks or competitor options.",
      example:
        "Gaming Nectar vs traditional energy drinks: lower sugar, added vitamins, cleaner energy positioning."
    },
    {
      name: "Evidence and proof",
      regex: /review|rated|tested|certified|customer|ingredient|nutrition|study/i,
      recommendation:
        "Add proof points such as reviews, ingredient evidence, nutritional facts, testing or customer outcomes.",
      why:
        "AI systems and users both trust pages more when claims are backed by visible evidence.",
      how:
        "Support claims with reviews, nutrition information, ingredient rationale, guarantees or testing details.",
      example:
        "If you say clean energy, show sugar, calories, caffeine, vitamins and minerals clearly."
    },
    {
      name: "Topical coverage",
      regex: /energy|focus|gaming|study|workout|hydration|vitamin|mineral|sugar|calorie/i,
      recommendation:
        "Expand supporting topical language so AI systems understand the page context.",
      why:
        "A page with shallow topical language may not look authoritative for its intended search area.",
      how:
        "Naturally cover related terms and use cases around energy, focus, gaming, work, study and nutrition.",
      example:
        "Explain when to use the product, who it helps, and how it compares with alternatives."
    },
    {
      name: "Source-of-truth clarity",
      regex: /about|contact|shipping|returns|ingredients|nutrition|reviews|guarantee/i,
      recommendation:
        "Make key factual information easy to find and consistently stated across the site.",
      why:
        "AI systems prefer clear, consistent, easy-to-find factual information.",
      how:
        "Make ingredients, nutrition, shipping, returns, reviews, guarantee and contact details visible.",
      example:
        "Add persistent product information blocks for ingredients, nutrition, delivery, returns and support."
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
      recommendation: item.recommendation,
      evidence: `Checked visible text for ${item.name.toLowerCase()} signals`,
      why: item.why,
      how: item.how,
      example: item.example,
      businessImpact:
        "Improving this helps the brand become easier for search engines, AI systems and customers to understand.",
      implementationHint:
        "Add reusable Shopify sections so this content can be consistently deployed across products and collections.",
      expectedImpact: "Medium",
      effort: "Medium"
    });
  });

  /**
   * LINKING
   */
  check("linking", {
    name: "Internal links",
    passed: links.internalCount >= 5,
    severity: "medium",
    points: 1,
    passMessage: `${links.internalCount} internal links detected.`,
    failMessage: `Only ${links.internalCount} internal links detected.`,
    recommendation:
      "Add internal links to relevant products, collections, guides, FAQs and supporting pages.",
    evidence: `${links.internalCount} internal links`,
    why:
      "Internal links help distribute authority and show relationships between products, collections and content.",
    how:
      "Add contextual links to related products, collections, ingredients, bundles, FAQs and buying guides.",
    example:
      "From a product page, link to ingredients, related flavours, bundles, FAQs and relevant collections.",
    businessImpact:
      "Better internal linking can improve discoverability, SEO strength and customer journey flow.",
    implementationHint:
      "Use Shopify sections for related products, product education links and collection cross-links.",
    expectedImpact: "Medium",
    effort: "Medium"
  });

  check("linking", {
    name: "External links",
    passed: links.externalCount > 0,
    severity: "low",
    points: 0.35,
    passMessage: `${links.externalCount} external links detected.`,
    failMessage: "No external links detected.",
    recommendation:
      "Where useful, cite trusted external references, review platforms, certifications or social proof.",
    evidence: `${links.externalCount} external links`,
    why:
      "Trusted external references can support claims and improve credibility.",
    how:
      "Link to review platforms, certifications, ingredient references, social proof or authoritative sources where relevant.",
    example:
      "If making an ingredient or nutrition claim, support it with visible evidence or a credible reference.",
    businessImpact:
      "Can strengthen trust and improve content credibility.",
    implementationHint:
      "Use external links carefully; do not leak users away from key purchase paths unnecessarily.",
    expectedImpact: "Low",
    effort: "Low"
  });

  check("linking", {
    name: "Link volume balance",
    passed: links.total <= 180,
    severity: "low",
    points: 0.4,
    passMessage: "Link volume appears reasonable.",
    failMessage: `High link count detected: ${links.total}.`,
    recommendation:
      "Review whether navigation, filters or repeated links are bloating the page.",
    evidence: `${links.total} total links`,
    why:
      "Too many links can create clutter, dilute attention and make a page harder to interpret.",
    how:
      "Reduce repeated menu, footer, filter or duplicate links and prioritise useful contextual links.",
    example:
      "Keep important navigation but reduce repeated product or footer links that do not help decision-making.",
    businessImpact:
      "A cleaner link structure can improve UX, crawl clarity and commercial focus.",
    implementationHint:
      "Audit header, mega-menu, footer, filters and repeated app-generated links.",
    expectedImpact: "Low",
    effort: "Medium"
  });

  /**
   * ACCESSIBILITY
   */
  check("accessibility", {
    name: "Image alt text",
    passed: imageStats.total === 0 || imageStats.missingAlt === 0,
    severity: "medium",
    points: Math.min(2.5, imageStats.missingAlt * 0.25),
    passMessage: "Images appear to include alt attributes.",
    failMessage: `${imageStats.missingAlt} of ${imageStats.total} images appear to be missing alt text.`,
    recommendation:
      "Add descriptive alt text to meaningful images and empty alt attributes to decorative images.",
    evidence: `${imageStats.total} images / ${imageStats.missingAlt} missing alt`,
    why:
      "Alt text helps accessibility, image context and sometimes image search understanding.",
    how:
      "Write descriptive alt text for meaningful product, ingredient and lifestyle images.",
    example:
      "Gaming Nectar Berry Bomb energy drink tub on a desk with gaming setup.",
    businessImpact:
      "Improves accessibility and gives search/AI systems more visual context.",
    implementationHint:
      "Set alt text in Shopify media fields and theme image snippets.",
    expectedImpact: "Medium",
    effort: "Medium"
  });

  check("accessibility", {
    name: "Accessible actions",
    passed: /<button|role=["']button["']|type=["']submit["']/i.test(safeHtml),
    severity: "low",
    points: 0.5,
    passMessage: "Button/action elements detected.",
    failMessage: "No obvious semantic button elements detected.",
    recommendation:
      "Make sure important actions use semantic buttons or accessible links.",
    evidence: "Checked for button/action markup",
    why:
      "Accessible buttons help users and assistive technologies interact with the page.",
    how:
      "Use semantic button elements for key actions like Add to Cart, Buy Now and forms.",
    example:
      '<button type="submit">Add to cart</button>',
    businessImpact:
      "Better accessibility can improve usability and conversion for more users.",
    implementationHint:
      "Review theme buttons, app blocks and custom Liquid sections.",
    expectedImpact: "Low",
    effort: "Low"
  });

  /**
   * PERFORMANCE
   */
  check("performance", {
    name: "Initial response speed",
    passed: loadMs <= 1800,
    severity: loadMs > 3500 ? "high" : "medium",
    points: loadMs > 3500 ? 2.2 : 1,
    passMessage: `Initial fetch time looks good at ${loadMs}ms.`,
    failMessage: `Initial fetch took ${loadMs}ms.`,
    recommendation:
      "Review app scripts, large assets, server response time, third-party scripts and theme bloat.",
    evidence: `${loadMs}ms initial fetch`,
    why:
      "Slow pages hurt user experience, conversion and crawl efficiency.",
    how:
      "Reduce heavy scripts, unnecessary apps, large media, render blocking assets and server delays.",
    example:
      "Remove unused Shopify apps and defer non-critical scripts.",
    businessImpact:
      "Improving speed can improve conversion rate and organic performance.",
    implementationHint:
      "Use Shopify theme performance reports, Lighthouse and app audits.",
    expectedImpact: "High",
    effort: "Medium"
  });

  check("performance", {
    name: "Script count",
    passed: scriptCount <= 30,
    severity: scriptCount > 45 ? "high" : "medium",
    points: scriptCount > 45 ? 1.4 : 0.8,
    passMessage: `Script count is acceptable at ${scriptCount}.`,
    failMessage: `High script count detected: ${scriptCount}.`,
    recommendation:
      "Audit Shopify apps, pixels, tracking scripts and unused JavaScript.",
    evidence: `${scriptCount} script tags`,
    why:
      "Too many scripts can slow pages and create layout or interaction delays.",
    how:
      "Remove unused apps, consolidate tracking tags and defer non-critical scripts.",
    example:
      "Disable unused product widgets, duplicate analytics tags or old popup tools.",
    businessImpact:
      "Lower script bloat can improve speed, UX and conversion.",
    implementationHint:
      "Review theme.liquid, app embeds, GTM and Shopify app pixels.",
    expectedImpact: "Medium",
    effort: "Medium"
  });

  check("performance", {
    name: "Stylesheet count",
    passed: styleCount <= 18,
    severity: "low",
    points: 0.4,
    passMessage: `Stylesheet/style count is acceptable at ${styleCount}.`,
    failMessage: `High stylesheet/style count detected: ${styleCount}.`,
    recommendation: "Review duplicated app CSS and theme CSS.",
    evidence: `${styleCount} style/stylesheet references`,
    why:
      "Too many CSS sources can create render blocking and maintenance issues.",
    how:
      "Remove unused app CSS, combine theme CSS where sensible and avoid duplicate styles.",
    example:
      "Remove old app stylesheets after uninstalling apps.",
    businessImpact:
      "Can improve load speed and reduce theme complexity.",
    implementationHint:
      "Audit theme assets, app embeds and custom sections.",
    expectedImpact: "Low",
    effort: "Medium"
  });

  /**
   * CONVERSION
   */
  commercialCheck(
    "conversion",
    "Primary CTA",
    /add to cart|buy now|shop now|subscribe|checkout|get started|view product|choose option|notify me|back in stock/i,
    text,
    1.4,
    {
      why:
        "A clear CTA helps users take the next step, whether buying now or joining a restock list.",
      how:
        "Make Add to Cart, Buy Now, Shop Now, Subscribe or Notify Me highly visible depending on stock state.",
      example:
        "Use a sticky Add to Cart for in-stock products and a prominent Notify Me form for sold-out products.",
      businessImpact:
        "Clearer CTAs improve conversion and recover more demand from product pages.",
      implementationHint:
        "Use Shopify product form logic to show different CTAs for in-stock and out-of-stock states.",
      expectedImpact: "High",
      effort: "Medium"
    }
  );

  commercialCheck(
    "conversion",
    "Pricing clarity",
    /£|\$|€|price|sale|regular price|compare at|from £|from \$|from €/i,
    text,
    0.8,
    {
      why:
        "Users need clear price information before making a purchase decision.",
      how:
        "Show price, sale price, compare-at price, bundle savings and subscription pricing clearly.",
      example:
        "Show £24.99 near the title and CTA, with bundle or subscription savings where relevant.",
      businessImpact:
        "Clear pricing reduces friction and improves buyer confidence.",
      implementationHint:
        "Use Shopify price snippets and make sure app-generated pricing is visible in HTML.",
        expectedImpact: "Medium",
        effort: "Low"
    }
  );

  commercialCheck(
    "conversion",
    "Value/offer signal",
    /limited|selling fast|popular|bestseller|offer|save|discount|bundle|free shipping|subscribe/i,
    text,
    0.5,
    {
      why:
        "Value signals help users understand why they should buy now or buy more.",
      how:
        "Show bundles, savings, bestsellers, free shipping thresholds or subscription benefits where relevant.",
      example:
        "Save 15% with a monthly bundle or try the variety pack.",
      businessImpact:
        "Can increase average order value and urgency without relying only on discounts.",
      implementationHint:
        "Use Shopify bundles, selling plans, promo banners and product badges.",
      expectedImpact: "Medium",
      effort: "Medium"
    }
  );

  /**
   * TRUST
   */
  commercialCheck(
    "trust",
    "Reviews/social proof",
    /review|rated|stars|testimonial|customer/i,
    text,
    0.7,
    {
      why:
        "Reviews reduce hesitation and increase confidence, especially for first-time buyers.",
      how:
        "Add review stars, review count, written reviews or testimonials close to the purchase area.",
      example:
        "Rated 4.8/5 by customers, with review snippets explaining taste, focus and energy.",
      businessImpact:
        "Can improve conversion rate and strengthen trust signals for SEO/GEO.",
      implementationHint:
        "Ensure your review app renders crawlable review summaries on product pages.",
      expectedImpact: "High",
      effort: "Medium"
    }
  );

  commercialCheck(
    "trust",
    "Delivery/returns clarity",
    /shipping|delivery|dispatch|returns|refund/i,
    text,
    0.7,
    {
      why:
        "Delivery and returns uncertainty can stop customers from buying.",
      how:
        "Show delivery timeframe, shipping threshold, returns policy and support link near the CTA.",
      example:
        "Fast UK delivery. Free shipping over £X. Easy returns if there is a problem.",
      businessImpact:
        "Reduces buying friction and improves first-time purchase confidence.",
      implementationHint:
        "Add a reusable delivery/returns snippet to product templates.",
      expectedImpact: "Medium",
      effort: "Low"
    }
  );

  commercialCheck(
    "trust",
    "Contact/help clarity",
    /contact|email|support|help/i,
    text,
    0.5,
    {
      why:
        "Users trust brands more when help and contact options are easy to find.",
      how:
        "Add clear help, contact or support links on product and policy pages.",
      example:
        "Need help? Contact our support team before ordering.",
      businessImpact:
        "Improves trust and reduces uncertainty before purchase.",
      implementationHint:
        "Add a support/contact block in product accordions and footer navigation.",
      expectedImpact: "Low",
      effort: "Low"
    }
  );

  commercialCheck(
    "trust",
    "Guarantee/security",
    /guarantee|secure|safe|trusted|money back|secure checkout|secure payment/i,
    text,
    0.5,
    {
      why:
        "Guarantee and security messaging reduces perceived risk before purchase.",
      how:
        "Add truthful secure checkout, satisfaction guarantee or support reassurance where appropriate.",
      example:
        "Secure checkout. Fast UK delivery. Support available if there is a problem.",
      businessImpact:
        "Can improve buyer confidence and conversion on commercial pages.",
      implementationHint:
        "Add small trust badges or reassurance copy near the product form.",
      expectedImpact: "Medium",
      effort: "Low"
    }
  );

  /**
   * MERCHANDISING
   */
  commercialCheck(
    "merchandising",
    "Variant clarity",
    /variant|flavour|flavor|size|pack|bundle|quantity/i,
    text,
    0.7,
    {
      why:
        "Users need to understand available flavours, sizes, packs and quantities.",
      how:
        "Make variants easy to compare and select.",
      example:
        "Show flavour cards, pack size, bundle options and quantity selector clearly.",
      businessImpact:
        "Clear merchandising can improve product selection and reduce abandonment.",
      implementationHint:
        "Use Shopify variants, swatches, metafields and clear variant labels.",
      expectedImpact: "Medium",
      effort: "Medium"
    }
  );

  commercialCheck(
    "merchandising",
    "Ingredient/nutrition clarity",
    /ingredient|nutrition|vitamin|mineral|caffeine|sugar|calorie/i,
    text,
    0.7,
    {
      why:
        "Nutrition and ingredient clarity is central for food/drink trust and GEO/AEO.",
      how:
        "Show ingredients, caffeine, sugar, calories, vitamins and minerals clearly.",
      example:
        "Caffeine: Xmg. Sugar: Xg. Calories: X. Includes vitamins B6, B12 and key minerals.",
      businessImpact:
        "Improves buyer confidence and gives AI/search systems useful factual product information.",
      implementationHint:
        "Use Shopify metafields for nutrition data and render them consistently.",
      expectedImpact: "High",
      effort: "Medium"
    }
  );

  commercialCheck(
    "merchandising",
    "Use-case clarity",
    /gaming|study|work|focus|energy|workout|daily|morning/i,
    text,
    0.7,
    {
      why:
        "Use cases help customers understand when the product fits into their life.",
      how:
        "Explain whether the product is for gaming, work, study, workouts or daily energy.",
      example:
        "Perfect for gaming sessions, work focus, studying or busy days.",
      businessImpact:
        "Stronger use-case clarity can improve conversion and keyword relevance.",
      implementationHint:
        "Add use-case icons or sections to product and collection templates.",
      expectedImpact: "Medium",
      effort: "Medium"
    }
  );

  commercialCheck(
    "merchandising",
    "Benefit clarity",
    /benefit|supports|helps|clean energy|healthy energy|focus/i,
    text,
    0.7,
    {
      why:
        "Clear benefits make the product easier to understand and buy.",
      how:
        "Explain specific outcomes users get, not just product features.",
      example:
        "Clean energy, focus support, lower sugar and added vitamins.",
      businessImpact:
        "Better benefit clarity can improve conversion and strengthen page relevance.",
      implementationHint:
        "Add benefit blocks near the top of product pages and in collection descriptions.",
      expectedImpact: "Medium",
      effort: "Medium"
    }
  );

  function commercialCheck(category, name, regex, inputText, points, context = {}) {
    check(category, {
      name,
      passed: regex.test(inputText),
      severity: "medium",
      points,
      passMessage: `${name} signal found.`,
      failMessage: `${name} signal appears weak or missing.`,
      recommendation: `Strengthen ${name.toLowerCase()} messaging on important commercial pages.`,
      evidence: `Checked visible text for ${name.toLowerCase()} signals`,
      why: context.why || "",
      how: context.how || "",
      example: context.example || "",
      businessImpact: context.businessImpact || "",
      implementationHint: context.implementationHint || "",
      expectedImpact: context.expectedImpact || "",
      effort: context.effort || ""
    });
  }

  /**
   * PAGE-SPECIFIC SITUATIONAL INSIGHTS
   */
  pageSituation.insights.forEach((item) => {
    check(item.category, {
      name: item.name,
      passed: item.passed,
      severity: item.severity,
      points: item.points,
      passMessage: `${item.name} looks good.`,
      failMessage: item.message,
      recommendation: item.recommendation,
      evidence: "",
      why: item.why,
      how: item.how,
      example: item.example,
      businessImpact: item.businessImpact,
      implementationHint: item.implementationHint,
      expectedImpact: item.expectedImpact,
      effort: item.effort
    });
  });

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
    pageSituation,
    imageStats,
    links,
    overallScore,
    categoryScores,
    categoryDetails,
    issues,
    wins,
    recommendations: [...new Set(recommendations)].slice(0, 30),
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
        label: "Situation",
        value: buildSituationLabel(pageSituation),
        note: "Page-specific ecommerce signals."
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
          evidence: check.evidence || "",
          why: check.why || "",
          how: check.how || "",
          example: check.example || "",
          businessImpact: check.businessImpact || "",
          implementationHint: check.implementationHint || "",
          expectedImpact: check.expectedImpact || "",
          effort: check.effort || ""
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
        count: 0,
        why: item.why,
        how: item.how,
        example: item.example,
        businessImpact: item.businessImpact,
        implementationHint: item.implementationHint,
        expectedImpact: item.expectedImpact,
        effort: item.effort,
        affectedPages: []
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
      context: {
        why:
          item.why ||
          getImprovementContext(category, item.checkName).why,
        how:
          item.how ||
          getImprovementContext(category, item.checkName).how,
        example:
          item.example ||
          getImprovementContext(category, item.checkName).example
      },
      affectedPages: item.affectedPages.slice(0, 12)
    }))
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 15);
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
  return String(category || "")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSituationLabel(pageSituation) {
  if (!pageSituation) return "Unknown";

  const labels = [];

  if (pageSituation.isProductPage) labels.push("Product");
  if (pageSituation.isCollectionPage) labels.push("Collection");
  if (pageSituation.isOutOfStock) labels.push("Out of stock");
  if (pageSituation.hasNotifyMe) labels.push("Notify-me");
  if (pageSituation.hasAlternatives) labels.push("Alternatives");
  if (pageSituation.hasReviews) labels.push("Reviews");

  return labels.length ? labels.join(" / ") : "General page";
}

function getContentSignalContext(name) {
  const contexts = {
    benefits: {
      why:
        "Users need to understand the outcome, not just the product feature.",
      how:
        "Explain the practical benefits in clear, specific language.",
      example:
        "Supports focus, cleaner energy, lower sugar, vitamins and minerals.",
      businessImpact:
        "Clear benefits can improve conversion and keyword relevance.",
      implementationHint:
        "Add benefit blocks to product and collection templates.",
      expectedImpact: "Medium",
      effort: "Low"
    },
    ingredients: {
      why:
        "Ingredients and nutrition are critical trust signals for food and drink products.",
      how:
        "Show ingredients, nutrition, caffeine, sugar, calories, vitamins and minerals clearly.",
      example:
        "Caffeine: Xmg. Sugar: Xg. Calories: X. Includes vitamins B6 and B12.",
      businessImpact:
        "Improves purchase confidence and strengthens factual GEO/AEO content.",
      implementationHint:
        "Use Shopify metafields for ingredients and nutrition facts.",
      expectedImpact: "High",
      effort: "Medium"
    },
    usage: {
      why:
        "Usage context helps customers understand when and why to buy.",
      how:
        "Add guidance on when to use the product and who it suits.",
      example:
        "For gaming sessions, work focus, studying, workouts or busy days.",
      businessImpact:
        "Better use-case clarity can improve conversion and organic relevance.",
      implementationHint:
        "Add use-case sections or icons on product pages.",
      expectedImpact: "Medium",
      effort: "Medium"
    },
    objections: {
      why:
        "Objections stop purchases. Addressing them improves conversion.",
      how:
        "Answer concerns around delivery, returns, caffeine, sugar, subscriptions, taste and ingredients.",
      example:
        "How much caffeine is in it? Is it suitable for daily use? How long does delivery take?",
      businessImpact:
        "Reduces uncertainty and improves buying confidence.",
      implementationHint:
        "Add FAQ sections and product accordions.",
      expectedImpact: "High",
      effort: "Medium"
    },
    socialProof: {
      why:
        "Reviews and proof reduce purchase hesitation.",
      how:
        "Add reviews, ratings, testimonials and customer feedback.",
      example:
        "Show review stars near the product title and detailed reviews lower on the page.",
      businessImpact:
        "Can improve conversion and strengthen trust signals.",
      implementationHint:
        "Ensure review app output is visible and crawlable.",
      expectedImpact: "High",
      effort: "Medium"
    }
  };

  return (
    contexts[name] || {
      why:
        "This signal helps users, search engines and AI systems understand the page more clearly.",
      how:
        "Improve the page by making the information clearer, more specific and easier to find.",
      example:
        "Add concise, specific copy and structure it with clear headings and supporting details.",
      businessImpact:
        "Improves page clarity, trust and competitive strength.",
      implementationHint:
        "Use reusable Shopify sections so the improvement scales across templates.",
      expectedImpact: "Medium",
      effort: "Medium"
    }
  );
}

function getImprovementContext(category, checkName) {
  const contexts = {
    conversion: {
      "Out-of-stock recovery could be stronger": {
        why:
          "A notify-me form captures future demand, but without alternatives you may lose customers who were ready to buy now.",
        how:
          "Keep the notify-me form, but add in-stock alternatives, related products, bundles or a shop-similar section.",
        example:
          "Sold out? Join the restock list — or try these in-stock flavours while you wait."
      },
      "Restock expectation missing": {
        why:
          "Users are more likely to join a restock list when they understand what happens next.",
        how:
          "Add expected restock timing or explain that they will be emailed when the product returns.",
        example:
          "Join the waitlist and we’ll email you as soon as this flavour is back."
        }
    },
    trust: {
      "Product review confidence missing": {
        why:
          "Reviews reduce hesitation and help users trust the product.",
        how:
          "Add review stars, review count, written reviews or testimonials near the purchase area.",
        example:
          "Rated 4.8/5 by customers — see what people say about taste, focus and energy."
      },
      "Delivery and returns reassurance missing": {
        why:
          "Delivery uncertainty can stop customers from buying.",
        how:
          "Add delivery timeframe, shipping threshold, returns policy and support link near the CTA.",
        example:
          "Fast UK delivery. Free shipping over £X. Easy returns if there is a problem."
      }
    },
    merchandising: {
      "Ingredients and nutrition clarity missing": {
        why:
          "Nutrition and ingredient clarity is central for food/drink trust and GEO.",
        how:
          "Add ingredient and nutrition information in a clear, scannable section.",
        example:
          "Caffeine: Xmg. Sugar: Xg. Calories: X. Includes vitamins B6, B12 and key minerals."
      },
      "Bundle or subscription opportunity missing": {
        why:
          "Bundles and subscriptions can increase average order value and simplify choices.",
        how:
          "Add bundles, multipacks, subscriptions or savings messaging where commercially relevant.",
        example:
          "Save 15% with a monthly bundle or try the variety pack."
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
