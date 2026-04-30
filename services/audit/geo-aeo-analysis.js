export function buildGeoAeoChecks({ text, title, metaDescription, h1s, h2s }) {
  const safeText = String(text || "");
  const combined = [
    title,
    metaDescription,
    ...(h1s || []),
    ...(h2s || []),
    safeText
  ].join(" ");

  return [
    {
      name: "Answer extraction readiness",
      passed: hasAnswerReadyContent(combined),
      severity: "high",
      points: 1,
      passMessage:
        "Page contains answer-style content that can be extracted by AI/search systems.",
      failMessage:
        "Page does not appear to contain strong answer-style content.",
      recommendation:
        "Add concise answer blocks that directly answer customer questions about the product, category, use case, ingredients, benefits and objections.",
      evidence: "Checked for question-led and answer-led patterns",
      why:
        "AEO and GEO rely on pages having clear, extractable answers. Marketing copy alone is often harder for AI systems to use.",
      how:
        "Add short sections using natural questions and direct answers. Keep the first sentence of each answer concise and factual.",
      example:
        "Question: What is Gaming Nectar? Answer: Gaming Nectar is a cleaner energy drink designed for focus, gaming, work and busy days."
    },
    {
      name: "Entity definition clarity",
      passed: hasEntityDefinition(combined),
      severity: "high",
      points: 1,
      passMessage:
        "Page appears to define the brand/product/category clearly.",
      failMessage:
        "Page does not clearly define the brand, product, category or audience.",
      recommendation:
        "Clearly state what the product is, who it is for, what category it belongs to and why it is different.",
      evidence: "Checked for brand/product/category definition patterns",
      why:
        "AI systems need to understand the entity before they can confidently recommend or summarise it.",
      how:
        "Add a clear introductory statement near the top of product, collection and landing pages.",
      example:
        "Gaming Nectar is a healthier energy drink for gamers, creators and busy people who want cleaner energy and focus."
    },
    {
      name: "Comparison and alternative coverage",
      passed: /compare|compared with|versus|vs\.|alternative|instead of|better than|difference between/i.test(
        combined
      ),
      severity: "medium",
      points: 0.8,
      passMessage:
        "Page contains comparison or alternative-style content.",
      failMessage:
        "Page lacks comparison or alternative-style content.",
      recommendation:
        "Add comparison content explaining how the product compares with coffee, standard energy drinks, sugary drinks, powdered energy products or competitor products.",
      evidence: "Checked for comparison language",
      why:
        "AI answers often compare options. If your page does not contain comparison context, competitors may be easier to recommend.",
      how:
        "Create simple comparison sections showing differences in ingredients, sugar, caffeine, use case, price, bundles or benefits.",
      example:
        "Gaming Nectar vs traditional energy drinks: lower sugar, added vitamins/minerals, cleaner energy positioning."
    },
    {
      name: "Buyer objection coverage",
      passed: /shipping|delivery|returns|refund|safe|daily|caffeine|sugar|calorie|subscription|cancel|taste|flavour|flavor/i.test(
        combined
      ),
      severity: "medium",
      points: 0.8,
      passMessage:
        "Page addresses common buyer objections or decision questions.",
      failMessage:
        "Page does not strongly address buyer objections or decision questions.",
      recommendation:
        "Answer the questions that could stop someone buying: caffeine level, sugar/calories, delivery, returns, taste, subscription, safety and daily usage.",
      evidence: "Checked for objection-handling content",
      why:
        "Objection handling helps both users and AI systems understand whether the product is a good fit.",
      how:
        "Add sections or FAQs that answer the most common pre-purchase concerns.",
      example:
        "How much caffeine is in Gaming Nectar? Is it suitable for daily use? How long does delivery take?"
    },
    {
      name: "Source-of-truth completeness",
      passed: /ingredients|nutrition|about|contact|reviews|shipping|returns|guarantee|privacy|terms/i.test(
        combined
      ),
      severity: "medium",
      points: 0.7,
      passMessage:
        "Page includes source-of-truth signals such as ingredients, reviews, shipping, returns or contact information.",
      failMessage:
        "Page lacks strong source-of-truth signals.",
      recommendation:
        "Make important factual information easy to find: ingredients, nutrition, shipping, returns, contact, guarantee, reviews and about information.",
      evidence: "Checked for factual trust/support signals",
      why:
        "AI systems prefer clear, consistent factual information. Users also need these signals to trust and buy.",
      how:
        "Add visible sections or links for ingredients, nutrition, delivery, returns, reviews and contact/support.",
      example:
        "A product page should link to or show ingredients, nutrition, reviews, shipping and returns."
    },
    {
      name: "Summary block readiness",
      passed: hasSummaryBlock(combined),
      severity: "medium",
      points: 0.7,
      passMessage:
        "Page appears to include summary-style content.",
      failMessage:
        "Page lacks a clear summary block that explains the page quickly.",
      recommendation:
        "Add a short summary near the top of key pages explaining what the page/product is, who it helps and why it matters.",
      evidence: "Checked for summary/explainer patterns",
      why:
        "Summary blocks make pages easier for users and AI systems to understand quickly.",
      how:
        "Add a 2–4 sentence summary above the fold or near the top of the main content.",
      example:
        "Gaming Nectar gives you cleaner energy for focus, gaming and busy days, with vitamins, minerals and lower sugar than typical energy drinks."
    },
    {
      name: "Experience and proof signals",
      passed: /review|reviews|rated|testimonial|customer|tested|certified|trusted|guarantee|as seen|case study/i.test(
        combined
      ),
      severity: "medium",
      points: 0.8,
      passMessage:
        "Page contains proof, review, trust or experience signals.",
      failMessage:
        "Page lacks strong proof, review or experience signals.",
      recommendation:
        "Add customer reviews, ratings, testimonials, usage examples, guarantees or other proof points.",
      evidence: "Checked for proof/trust language",
      why:
        "AI and users both need evidence to trust claims. Proof signals also help the business compete against stronger brands.",
      how:
        "Show reviews near CTAs, add ingredient/nutrition evidence, and include customer outcomes where truthful.",
      example:
        "Rated 4.8/5 by customers, with review snippets explaining taste, focus and energy benefits."
    },
    {
      name: "Product expansion readiness",
      passed: /collection|range|flavour|flavor|bundle|pack|new|best seller|bestseller|variant|subscription/i.test(
        combined
      ),
      severity: "low",
      points: 0.5,
      passMessage:
        "Page contains signals that support product range expansion.",
      failMessage:
        "Page does not strongly support product range or future product expansion.",
      recommendation:
        "As the business adds products, make sure pages explain ranges, flavours, bundles, variants and related products clearly.",
      evidence: "Checked for range/product expansion signals",
      why:
        "As the business grows, search and AI systems need to understand the product ecosystem, not just one page.",
      how:
        "Add collection-level descriptions, related products, bundles, flavour explanations and internal links between products.",
      example:
        "Create clear collection copy for energy drinks, variety packs, bestsellers and new product launches."
    }
  ];
}

function hasAnswerReadyContent(value) {
  return (
    /what is|what are|how does|how do|how to|why does|why is|which is|who is|when should|can you|does it|is it/i.test(
      value
    ) ||
    /in short|quick answer|summary|the answer|best for|ideal for/i.test(value)
  );
}

function hasEntityDefinition(value) {
  return (
    /gaming nectar is|gaming nectar are|our product is|this product is|this drink is|energy drink for|designed for|made for|built for/i.test(
      value
    ) ||
    /healthy energy drink|clean energy drink|gaming energy drink|energy drink/i.test(
      value
    )
  );
}

function hasSummaryBlock(value) {
  return /summary|overview|in short|quick answer|at a glance|key benefits|why choose|what makes/i.test(
    value
  );
}
