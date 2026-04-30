export function analysePageSituation({ url, text, title }) {
  const combined = `${url || ""} ${title || ""} ${text || ""}`;

  const isProductPage =
    /\/products\//i.test(url) ||
    /add to cart|buy now|variant|quantity|regular price|sale price/i.test(
      combined
    );

  const isCollectionPage =
    /\/collections\//i.test(url) ||
    /collection|filter|sort by|products/i.test(combined);

  const isOutOfStock =
    /sold out|out of stock|currently unavailable|unavailable|notify me|back in stock/i.test(
      combined
    );

  const hasNotifyMe =
    /notify me|back in stock|restock|email when available|let me know/i.test(
      combined
    );

  const hasAlternatives =
    /related products|you may also like|similar products|recommended products|shop instead|alternative/i.test(
      combined
    );

  const hasRestockTiming =
    /restock|back soon|coming soon|expected|available from|preorder|pre-order/i.test(
      combined
    );

  const hasReviews =
    /review|reviews|rated|rating|stars|testimonial|customer/i.test(combined);

  const hasGuarantee =
    /guarantee|secure checkout|money back|safe checkout|trusted|secure payment/i.test(
      combined
    );

  const hasDeliveryReturns =
    /shipping|delivery|dispatch|returns|refund/i.test(combined);

  const hasIngredientsNutrition =
    /ingredients|nutrition|caffeine|sugar|calorie|vitamin|mineral/i.test(
      combined
    );

  const hasBundles =
    /bundle|pack|subscribe|subscription|save|multi-pack|multipack/i.test(
      combined
    );

  const insights = [];

  if (isProductPage && isOutOfStock && hasNotifyMe && !hasAlternatives) {
    insights.push({
      category: "conversion",
      name: "Out-of-stock recovery could be stronger",
      severity: "high",
      passed: false,
      points: 1.1,
      message:
        "Product appears out of stock and has a notify-me/restock signal, but no obvious alternative product path was detected.",
      recommendation:
        "Keep the notify-me form, but add in-stock alternatives, related products, bundles, or a 'shop similar products' section.",
      why:
        "A notify-me form helps capture future demand, but without alternatives you may lose customers who were ready to buy now.",
      how:
        "Add a section near the sold-out message showing similar in-stock products, related flavours, bundles, or bestsellers.",
      example:
        "Sold out? Join the restock list — or try these in-stock flavours while you wait.",
      businessImpact:
        "This can recover immediate revenue from users who would otherwise leave the page.",
      implementationHint:
        "In Shopify, add a conditional sold-out block to the product template that renders related in-stock products.",
      expectedImpact: "High",
      effort: "Medium"
    });
  }

  if (isProductPage && isOutOfStock && hasNotifyMe && !hasRestockTiming) {
    insights.push({
      category: "conversion",
      name: "Restock expectation missing",
      severity: "medium",
      passed: false,
      points: 0.6,
      message:
        "Product appears out of stock and has a notify-me signal, but no clear restock expectation was detected.",
      recommendation:
        "Add an estimated restock message if you know the likely timeframe, or explain that customers can join the waitlist for updates.",
      why:
        "Users are more likely to join a restock list when they understand what happens next.",
      how:
        "Add a short message beside the notify-me form explaining when or how restock updates are sent.",
      example:
        "Join the waitlist and we’ll email you as soon as this flavour is back.",
      businessImpact:
        "Improves email capture quality and reduces uncertainty around unavailable products.",
      implementationHint:
        "Use Shopify metafields for estimated restock date or a fallback message.",
      expectedImpact: "Medium",
      effort: "Low"
    });
  }

  if (isProductPage && !hasReviews) {
    insights.push({
      category: "trust",
      name: "Product review confidence missing",
      severity: "medium",
      passed: false,
      points: 0.7,
      message:
        "Product page does not show strong visible review or rating signals.",
      recommendation:
        "Add review stars, review count, written reviews, or testimonials close to the product purchase area.",
      why:
        "Reviews reduce hesitation and help users trust the product, especially for food and drink purchases.",
      how:
        "Show rating summary near the product title and detailed reviews lower on the page.",
      example:
        "Rated 4.8/5 by customers — see what people say about taste, focus and energy.",
      businessImpact:
        "Can improve conversion rate and strengthen trust signals for SEO/GEO.",
      implementationHint:
        "Connect your Shopify review app output to product templates and ensure review text is crawlable.",
      expectedImpact: "High",
      effort: "Medium"
    });
  }

  if (isProductPage && !hasDeliveryReturns) {
    insights.push({
      category: "trust",
      name: "Delivery and returns reassurance missing",
      severity: "medium",
      passed: false,
      points: 0.7,
      message:
        "Product page does not clearly show delivery, shipping, returns, or refund reassurance.",
      recommendation:
        "Add concise delivery and returns information near the CTA or in an expandable product information block.",
      why:
        "Delivery uncertainty can stop customers from buying, especially first-time visitors.",
      how:
        "Show delivery timeframe, shipping threshold, returns policy, and support link near the buy area.",
      example:
        "Fast UK delivery. Free shipping over £X. Easy returns if there is a problem.",
      businessImpact:
        "Reduces buying friction and improves trust.",
      implementationHint:
        "Add a reusable delivery/returns snippet to all product templates.",
      expectedImpact: "Medium",
      effort: "Low"
    });
  }

  if (isProductPage && !hasIngredientsNutrition) {
    insights.push({
      category: "merchandising",
      name: "Ingredients and nutrition clarity missing",
      severity: "high",
      passed: false,
      points: 0.9,
      message:
        "Product page does not clearly expose ingredients, nutrition, caffeine, sugar, calories, vitamins or minerals.",
      recommendation:
        "Add ingredient and nutrition information in a clear, scannable section.",
      why:
        "For drinks and consumables, nutrition and ingredient clarity is central to trust, conversion, SEO and GEO.",
      how:
        "Add a nutrition table, ingredient list, caffeine amount, sugar level, calories, vitamins and minerals.",
      example:
        "Caffeine: Xmg. Sugar: Xg. Calories: X. Includes vitamins B6, B12 and key minerals.",
      businessImpact:
        "Improves buyer confidence and gives search/AI systems clearer factual content.",
      implementationHint:
        "Use Shopify product metafields for nutrition facts and render them consistently across product pages.",
      expectedImpact: "High",
      effort: "Medium"
    });
  }

  if (isProductPage && !hasBundles) {
    insights.push({
      category: "merchandising",
      name: "Bundle or subscription opportunity missing",
      severity: "low",
      passed: false,
      points: 0.4,
      message:
        "Product page does not show strong bundle, pack, subscription or savings signals.",
      recommendation:
        "Consider adding bundles, multipacks, subscriptions or savings messaging where commercially relevant.",
      why:
        "Bundles and subscriptions can increase average order value and help users choose faster.",
      how:
        "Show pack sizes, bundle savings, subscription benefits, or related product bundles.",
      example:
        "Save 15% with a monthly bundle or try the variety pack.",
      businessImpact:
        "Can improve AOV and repeat purchase behaviour.",
      implementationHint:
        "Use Shopify bundles, selling plans, or custom product recommendations.",
      expectedImpact: "Medium",
      effort: "Medium"
    });
  }

  return {
    isProductPage,
    isCollectionPage,
    isOutOfStock,
    hasNotifyMe,
    hasAlternatives,
    hasRestockTiming,
    hasReviews,
    hasGuarantee,
    hasDeliveryReturns,
    hasIngredientsNutrition,
    hasBundles,
    insights
  };
}
