export function analyseSchemaDeep(html) {
  const hasJsonLd = /application\/ld\+json/i.test(html);
  const types = new Set();
  const items = [];
  const invalidBlocks = [];

  const jsonLdMatches = [
    ...String(html || "").matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  jsonLdMatches.forEach((match) => {
    try {
      const raw = cleanJson(match[1]);
      const parsed = JSON.parse(raw);

      collectSchemaTypes(parsed, types);
      collectSchemaItems(parsed, items);
    } catch (error) {
      invalidBlocks.push({
        error: error.message,
        raw: match[1]
      });
    }
  });

  return {
    hasJsonLd,
    types: [...types].slice(0, 30),
    items,
    invalidBlocks,
    invalidJsonLdCount: invalidBlocks.length,
    productItems: items.filter((item) => item.type === "Product"),
    faqItems: items.filter((item) => item.type === "FAQPage"),
    breadcrumbItems: items.filter((item) => item.type === "BreadcrumbList"),
    organizationItems: items.filter((item) =>
      ["Organization", "LocalBusiness", "Brand"].includes(item.type)
    ),
    reviewItems: items.filter((item) =>
      ["Review", "AggregateRating"].includes(item.type)
    )
  };
}

export function buildSchemaConsistencyChecks({
  schema,
  text,
  title,
  metaDescription,
  h1s
}) {
  const checks = [];

  if (!schema?.hasJsonLd) {
    return checks;
  }

  const visibleText = normaliseForComparison(text);
  const visibleTitle = normaliseForComparison(title);
  const visibleDescription = normaliseForComparison(metaDescription);
  const visibleH1s = (h1s || []).map(normaliseForComparison);

  checks.push({
    name: "JSON-LD validity",
    passed: schema.invalidJsonLdCount === 0,
    severity: schema.invalidJsonLdCount > 0 ? "high" : "medium",
    points: schema.invalidJsonLdCount > 0 ? 1.2 : 0.3,
    passMessage: "JSON-LD appears parseable.",
    failMessage: `${schema.invalidJsonLdCount} invalid JSON-LD block(s) detected.`,
    recommendation:
      "Fix invalid JSON-LD. Broken schema can prevent search engines and AI systems from reading your structured data.",
    evidence:
      schema.invalidJsonLdCount > 0
        ? `${schema.invalidJsonLdCount} invalid block(s)`
        : "All JSON-LD blocks parsed",
    why:
      "Invalid JSON-LD can cause structured data to be ignored entirely.",
    how:
      "Validate the JSON-LD and fix syntax errors, missing commas, broken quotes, invalid @type fields or malformed arrays.",
    example:
      "Use valid JSON-LD with @context, @type and properly quoted values."
  });

  if (schema.types.includes("FAQPage")) {
    const faqQuestions = extractFaqQuestionsFromSchema(schema.items);

    const visibleFaqSignals =
      /faq|frequently asked|question|answer/i.test(text) ||
      faqQuestions.some((question) => {
        const q = normaliseForComparison(question);
        return q.length > 8 && visibleText.includes(q.slice(0, 45));
      });

    checks.push({
      name: "FAQ schema matches visible FAQ",
      passed: visibleFaqSignals,
      severity: "high",
      points: 1.3,
      passMessage:
        "FAQPage schema appears to match visible FAQ/question content.",
      failMessage:
        "FAQPage schema exists, but visible FAQ/question content was not clearly found on the page.",
      recommendation:
        "If FAQPage schema is used, the same questions and answers should be visible to users on the page. Remove FAQ schema if FAQs are hidden or not present.",
      evidence: faqQuestions.length
        ? `${faqQuestions.length} FAQ question(s) found in schema`
        : "FAQPage schema found",
      why:
        "Structured data should match visible content. FAQ schema without visible FAQs can weaken trust and may be ignored.",
      how:
        "Add a visible FAQ section using the same questions and answers as the schema, or remove FAQPage schema.",
      example:
        "If schema includes 'Is Gaming Nectar suitable for daily use?', that question should appear visibly in an FAQ section."
    });
  }

  if (schema.types.includes("Product")) {
    const productSignals = extractProductSignalsFromSchema(schema.items);

    const productNameVisible =
      productSignals.names.length === 0 ||
      productSignals.names.some((name) => {
        const cleanName = normaliseForComparison(name);

        return (
          cleanName.length > 2 &&
          (visibleText.includes(cleanName) ||
            visibleTitle.includes(cleanName) ||
            visibleDescription.includes(cleanName) ||
            visibleH1s.some((h1) => h1.includes(cleanName)))
        );
      });

    checks.push({
      name: "Product schema name matches visible product",
      passed: productNameVisible,
      severity: "high",
      points: 1,
      passMessage:
        "Product schema name appears to match visible page content.",
      failMessage:
        "Product schema name does not clearly match the visible page title, H1, meta description, or body content.",
      recommendation:
        "Make sure Product schema uses the same product name that users can see on the page.",
      evidence: productSignals.names.length
        ? productSignals.names.join(", ")
        : "No product name found in schema",
      why:
        "Product schema should describe the same product users can see. Mismatched schema can reduce confidence in the page.",
      how:
        "Align the schema Product name with the visible product title, H1 and product copy.",
      example:
        "If the page shows 'Gaming Nectar Variety Pack', the Product schema name should also reference 'Gaming Nectar Variety Pack'."
    });

    if (productSignals.hasOffer) {
      const visiblePrice =
        /£|\$|€|price|sale|regular price|compare at|from £|from \$|from €/i.test(
          text
        );

      checks.push({
        name: "Offer schema matches visible pricing",
        passed: visiblePrice,
        severity: "high",
        points: 1,
        passMessage:
          "Offer schema exists and visible pricing signals were found.",
        failMessage:
          "Offer schema exists, but visible pricing was not clearly found on the page.",
        recommendation:
          "If Product Offer schema includes price, make sure price and currency are visible near the product CTA.",
        evidence: productSignals.prices.length
          ? `Schema price(s): ${productSignals.prices.join(", ")}`
          : "Offer schema found",
        why:
          "Price data in schema should reflect what users can actually see. Hidden or mismatched offer data can reduce trust.",
        how:
          "Display the product price clearly near the product title and purchase area.",
        example:
          "If schema exposes £24.99, the page should visibly show £24.99 near the Add to Cart button."
      });
    }

    if (productSignals.hasAvailability) {
      const visibleAvailability =
        /in stock|out of stock|sold out|available|unavailable|preorder|pre-order/i.test(
          text
        );

      checks.push({
        name: "Availability schema matches visible stock status",
        passed: visibleAvailability,
        severity: "medium",
        points: 0.7,
        passMessage:
          "Availability schema exists and visible stock status was found.",
        failMessage:
          "Availability schema exists, but visible stock status was not clearly found.",
        recommendation:
          "Make stock status visible to users if availability is included in Product schema.",
        evidence: productSignals.availability.length
          ? productSignals.availability.join(", ")
          : "Availability schema found",
        why:
          "Stock status in schema should match the page experience. Inconsistent availability can confuse users and search systems.",
        how:
          "Show in-stock, sold-out, preorder or unavailable messaging clearly on the product page.",
        example:
          "If schema says InStock, the product page should visibly indicate that the product is available."
      });
    }
  }

  if (
    schema.types.includes("Review") ||
    schema.types.includes("AggregateRating")
  ) {
    const visibleReviewSignals =
      /review|reviews|rated|rating|stars|testimonial|customer/i.test(text);

    checks.push({
      name: "Review schema matches visible reviews",
      passed: visibleReviewSignals,
      severity: "high",
      points: 1.1,
      passMessage:
        "Review/rating schema exists and visible review signals were found.",
      failMessage:
        "Review/rating schema exists, but visible reviews or ratings were not clearly found.",
      recommendation:
        "Only use Review or AggregateRating schema when reviews or ratings are visible to users on the page.",
      evidence: schema.types
        .filter((type) => ["Review", "AggregateRating"].includes(type))
        .join(", "),
      why:
        "Review schema should represent visible customer proof. Hidden or unsupported reviews can create trust problems.",
      how:
        "Show the rating, review count or written reviews if Review or AggregateRating schema is present.",
      example:
        "If schema says 4.8 stars from 120 reviews, users should be able to see that rating or review count."
    });
  }

  if (schema.types.includes("BreadcrumbList")) {
    const breadcrumbNames = extractBreadcrumbNamesFromSchema(schema.items);

    const breadcrumbVisible =
      /breadcrumb|home\s*\/|home\s*>|collections|products/i.test(text) ||
      breadcrumbNames.some((name) =>
        visibleText.includes(normaliseForComparison(name))
      );

    checks.push({
      name: "Breadcrumb schema matches visible navigation",
      passed: breadcrumbVisible,
      severity: "medium",
      points: 0.6,
      passMessage:
        "Breadcrumb schema appears to align with visible navigation or page context.",
      failMessage:
        "BreadcrumbList schema exists, but visible breadcrumb/navigation context was not clearly found.",
      recommendation:
        "Make sure breadcrumb schema reflects visible breadcrumbs or a clear page hierarchy.",
      evidence: breadcrumbNames.length
        ? breadcrumbNames.join(" > ")
        : "BreadcrumbList schema found",
      why:
        "Breadcrumb schema should describe a real navigational hierarchy users can understand.",
      how:
        "Add visible breadcrumbs or make sure the schema matches the page’s obvious navigation structure.",
      example:
        "Home > Energy Drinks > Variety Pack"
    });
  }

  if (
    schema.types.includes("Organization") ||
    schema.types.includes("Brand") ||
    schema.types.includes("LocalBusiness")
  ) {
    const orgNames = extractOrganizationNamesFromSchema(schema.items);

    const orgVisible =
      orgNames.length === 0 ||
      orgNames.some((name) =>
        visibleText.includes(normaliseForComparison(name))
      );

    checks.push({
      name: "Organization schema matches visible brand",
      passed: orgVisible,
      severity: "medium",
      points: 0.6,
      passMessage:
        "Organization/brand schema appears to match visible brand content.",
      failMessage:
        "Organization/brand schema exists, but the brand/entity was not clearly visible in the page content.",
      recommendation:
        "Make sure brand schema matches the visible brand name and brand information on important pages.",
      evidence: orgNames.length
        ? orgNames.join(", ")
        : "Organization or Brand schema found",
      why:
        "Organization schema helps establish the business as an entity. It is stronger when the same brand information is visible on-page.",
      how:
        "Make the brand name, brand description, contact/about links and supporting entity signals visible.",
      example:
        "Gaming Nectar should be visibly referenced as the brand, with clear About, Contact, logo or social proof signals."
    });
  }

  return checks;
}

function collectSchemaTypes(value, types) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaTypes(item, types));
    return;
  }

  if (typeof value === "object") {
    const type = value["@type"];

    if (type) {
      if (Array.isArray(type)) {
        type.forEach((item) => types.add(String(item)));
      } else {
        types.add(String(type));
      }
    }

    if (value["@graph"]) {
      collectSchemaTypes(value["@graph"], types);
    }

    Object.values(value).forEach((nestedValue) => {
      if (nestedValue && typeof nestedValue === "object") {
        collectSchemaTypes(nestedValue, types);
      }
    });
  }
}

function collectSchemaItems(value, items) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaItems(item, items));
    return;
  }

  if (typeof value !== "object") return;

  const type = getSchemaType(value);

  if (type) {
    items.push({
      type,
      value
    });
  }

  if (value["@graph"]) {
    collectSchemaItems(value["@graph"], items);
  }

  Object.values(value).forEach((nestedValue) => {
    if (nestedValue && typeof nestedValue === "object") {
      collectSchemaItems(nestedValue, items);
    }
  });
}

function getSchemaType(value) {
  if (!value || typeof value !== "object") return "";

  const type = value["@type"];

  if (Array.isArray(type)) {
    return String(type[0] || "");
  }

  return String(type || "");
}

function extractFaqQuestionsFromSchema(items) {
  const questions = [];

  items.forEach((item) => {
    if (item.type !== "FAQPage") return;

    const mainEntity = item.value?.mainEntity;

    if (Array.isArray(mainEntity)) {
      mainEntity.forEach((entity) => {
        if (entity?.name) {
          questions.push(String(entity.name));
        }
      });
    }
  });

  return [...new Set(questions)].filter(Boolean);
}

function extractProductSignalsFromSchema(items) {
  const products = items.filter((item) => item.type === "Product");

  const names = [];
  const prices = [];
  const availability = [];

  let hasOffer = false;
  let hasAvailability = false;

  products.forEach((item) => {
    const product = item.value;

    if (product?.name) {
      names.push(String(product.name));
    }

    const offers = Array.isArray(product?.offers)
      ? product.offers
      : product?.offers
        ? [product.offers]
        : [];

    offers.forEach((offer) => {
      hasOffer = true;

      if (offer?.price) {
        prices.push(String(offer.price));
      }

      if (offer?.availability) {
        hasAvailability = true;
        availability.push(String(offer.availability));
      }
    });
  });

  return {
    names: [...new Set(names)].filter(Boolean),
    prices: [...new Set(prices)].filter(Boolean),
    availability: [...new Set(availability)].filter(Boolean),
    hasOffer,
    hasAvailability
  };
}

function extractBreadcrumbNamesFromSchema(items) {
  const names = [];

  items.forEach((item) => {
    if (item.type !== "BreadcrumbList") return;

    const itemListElement = item.value?.itemListElement;

    if (Array.isArray(itemListElement)) {
      itemListElement.forEach((element) => {
        if (element?.name) {
          names.push(String(element.name));
        }

        if (element?.item?.name) {
          names.push(String(element.item.name));
        }
      });
    }
  });

  return [...new Set(names)].filter(Boolean);
}

function extractOrganizationNamesFromSchema(items) {
  return [
    ...new Set(
      items
        .filter((item) =>
          ["Organization", "LocalBusiness", "Brand"].includes(item.type)
        )
        .map((item) => item.value?.name)
        .filter(Boolean)
        .map(String)
    )
  ];
}

function cleanJson(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function normaliseForComparison(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9£$€%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
