import cron from "node-cron";
import { auditSiteFromSitemap } from "../audit/crawler.js";
import { saveAuditRun } from "../audit/store.js";
import { getCollections } from "../db/mongodb.js";
import { buildAuditSnapshot, saveAuditSnapshot } from "./history.js";
import { runKeywordSnapshot, seedDefaultKeywords } from "./keywords.js";
import { runCompetitorSnapshot, seedDefaultCompetitors } from "./competitors.js";

let isRunning = false;

export function startAuditScheduler() {
  if (process.env.ENABLE_SCHEDULER === "false") {
    console.log("Scheduled audits disabled.");
    return;
  }

  const expression = process.env.AUDIT_SCHEDULE_CRON || "0 */12 * * *";

  if (!cron.validate(expression)) {
    console.warn(`Invalid AUDIT_SCHEDULE_CRON: ${expression}. Scheduler not started.`);
    return;
  }

  cron.schedule(expression, async () => {
    await runScheduledAudits();
  });

  console.log(`Scheduled audits enabled with cron: ${expression}`);
}

export async function runScheduledAudits() {
  if (isRunning) {
    console.log("Scheduled audit skipped because a previous run is still active.");
    return [];
  }

  isRunning = true;

  try {
    const targets = await getScheduledTargets();
    const completed = [];

    for (const target of targets) {
      try {
        completed.push(await runScheduledAuditForTarget(target));
      } catch (error) {
        console.error(`Scheduled audit failed for ${target.ownerKey}:`, error);
      }
    }

    return completed;
  } finally {
    isRunning = false;
  }
}

export async function runScheduledAuditForTarget(target) {
  await seedDefaultKeywords(target.ownerKey);
  await seedDefaultCompetitors(target.ownerKey);

  const maxUrls = Number(process.env.SCHEDULED_AUDIT_MAX_URLS || 50);
  const siteAudit = await auditSiteFromSitemap(target.siteUrl, { maxUrls });

  const auditRun = await saveAuditRun({
    ownerKey: target.ownerKey,
    type: "scheduled",
    input: { siteUrl: target.siteUrl, maxUrls, schedule: "12-hour" },
    results: siteAudit.results,
    siteAudit,
    competitorAnalysis: null
  });

  const keywordSummary = await runKeywordSnapshot(target.ownerKey);
  const competitorSummary = await runCompetitorSnapshot(target.ownerKey);

  const snapshot = buildAuditSnapshot({
    ownerKey: target.ownerKey,
    siteUrl: target.siteUrl,
    auditRun,
    keywordSummary,
    competitorSummary
  });

  await saveAuditSnapshot(snapshot);
  return { auditRun, snapshot };
}

async function getScheduledTargets() {
  const { shops, users } = await getCollections();
  const targets = [];

  const shopRows = await shops.find({ status: "installed" }).toArray();
  for (const shop of shopRows) {
    targets.push({
      ownerKey: `shopify:${shop.shop}`,
      siteUrl: shop.siteUrl || `https://${shop.shop}`,
      source: "shopify"
    });
  }

  const userRows = await users.find({ role: { $in: ["admin", "user"] } }).toArray();
  for (const user of userRows) {
    targets.push({
      ownerKey: `user:${user._id.toString()}`,
      siteUrl: user.siteUrl || process.env.DEFAULT_SITE_URL || "https://www.gamingnectar.com/",
      source: "login"
    });
  }

  if (!targets.length && process.env.DEFAULT_SITE_URL) {
    targets.push({
      ownerKey: "public:default",
      siteUrl: process.env.DEFAULT_SITE_URL,
      source: "default"
    });
  }

  return targets;
}