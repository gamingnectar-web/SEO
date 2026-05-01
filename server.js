import "dotenv/config";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import { auditMultipleUrls, auditWithCompetitors, auditSiteFromSitemap } from "./services/audit/crawler.js";
import { saveAuditRun, getRecentAuditRuns, getAuditRunById } from "./services/audit/store.js";
import { ensureIndexes } from "./services/db/mongodb.js";
import { createTodo, getTodosForAuditRun, getTodoSummaryForAuditRun, updateTodoStatus } from "./services/audit/todos.js";
import {
  attachAuthLocals,
  bootstrapAdminUser,
  buildShopifyInstallUrl,
  exchangeShopifyCode,
  getOwnerKey,
  requireAuth,
  saveShopifyInstall,
  verifyPasswordLogin,
  verifyShopifyHmac
} from "./services/auth/auth.js";
import { startAuditScheduler, runScheduledAudits } from "./services/intelligence/scheduler.js";
import { buildAuditSnapshot, buildMovementInsight, getAuditHistory, getDashboardTimeline, saveAuditSnapshot } from "./services/intelligence/history.js";
import { getKeywordDashboard, runKeywordSnapshot, upsertTrackedKeyword } from "./services/intelligence/keywords.js";
import { getCompetitorDashboard, runCompetitorSnapshot, upsertTrackedCompetitor } from "./services/intelligence/competitors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true, limit: "6mb" }));
app.use(express.json({ limit: "6mb" }));
app.use(cookieParser());
app.use(
  session({
    name: "gn_seo_sid",
    secret: process.env.SESSION_SECRET || "dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    store: process.env.MONGODB_URI
      ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: "sessions" })
      : undefined,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14
    }
  })
);
app.use(attachAuthLocals);
app.use(express.static(path.join(__dirname, "public")));

app.get("/login", (req, res) => {
  if (res.locals.auth.isLoggedIn) return res.redirect(req.query.returnTo || "/dashboard");
  return res.render("login", {
    title: "Log in",
    error: null,
    returnTo: req.query.returnTo || "/dashboard"
  });
});

app.post("/login", async (req, res) => {
  try {
    const user = await verifyPasswordLogin(req.body.email, req.body.password);
    if (!user) {
      return res.status(401).render("login", {
        title: "Log in",
        error: "Invalid email or password.",
        returnTo: req.body.returnTo || "/dashboard"
      });
    }

    req.session.userId = user._id.toString();
    req.session.userEmail = user.email;
    return res.redirect(req.body.returnTo || "/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).render("login", {
      title: "Log in",
      error: "Could not log in right now.",
      returnTo: req.body.returnTo || "/dashboard"
    });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/auth/shopify", (req, res) => {
  try {
    const { state, url } = buildShopifyInstallUrl(req.query.shop);
    req.session.shopifyOauthState = state;
    return res.redirect(url);
  } catch (error) {
    return res.status(400).send(error.message);
  }
});

app.get("/auth/shopify/callback", async (req, res) => {
  try {
    if (!verifyShopifyHmac(req.query)) {
      return res.status(401).send("Invalid Shopify OAuth HMAC.");
    }

    if (!req.session.shopifyOauthState || req.session.shopifyOauthState !== req.query.state) {
      return res.status(401).send("Invalid Shopify OAuth state.");
    }

    const tokenPayload = await exchangeShopifyCode({ shop: req.query.shop, code: req.query.code });
    const shopDoc = await saveShopifyInstall({ shop: req.query.shop, tokenPayload });

    req.session.shopify = {
      shop: shopDoc.shop,
      scope: shopDoc.scope
    };
    delete req.session.shopifyOauthState;

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Shopify auth callback error:", error);
    return res.status(500).send("Shopify authentication failed.");
  }
});

app.get("/", (req, res) => {
  if (res.locals.auth.isLoggedIn) return res.redirect("/dashboard");
  return res.redirect("/login");
});

app.get("/dashboard", requireAuth, async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const recentRuns = await safelyGetRecentRuns(ownerKey);
  const timeline = await getDashboardTimeline(ownerKey, 30);
  const history = await getAuditHistory(ownerKey, 2);
  const current = history[0] || null;
  const previous = history[1] || null;
  const insight = buildMovementInsight(current, previous);
  const keywordSnapshots = await getKeywordDashboard(ownerKey, 50);
  const competitorSnapshots = await getCompetitorDashboard(ownerKey, 50);

  return res.render("dashboard", {
    title: "SEO Intelligence Dashboard",
    recentRuns,
    timeline,
    insight,
    keywordSnapshots,
    competitorSnapshots
  });
});

app.get("/api/dashboard/timeline", requireAuth, async (req, res) => {
  const timeline = await getDashboardTimeline(getOwnerKey(req), 30);
  return res.json({ timeline });
});

app.post("/dashboard/run-scheduled-now", requireAuth, async (_req, res) => {
  await runScheduledAudits();
  return res.redirect("/dashboard");
});

app.post("/keywords", requireAuth, async (req, res) => {
  await upsertTrackedKeyword({
    ownerKey: getOwnerKey(req),
    keyword: req.body.keyword,
    targetUrl: req.body.targetUrl,
    searchVolume: req.body.searchVolume,
    cpc: req.body.cpc
  });
  return res.redirect("/dashboard");
});

app.post("/keywords/snapshot", requireAuth, async (req, res) => {
  await runKeywordSnapshot(getOwnerKey(req));
  return res.redirect("/dashboard");
});

app.post("/competitors", requireAuth, async (req, res) => {
  const urls = String(req.body.urls || "")
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);

  await upsertTrackedCompetitor({
    ownerKey: getOwnerKey(req),
    domain: req.body.domain,
    urls
  });

  return res.redirect("/dashboard");
});

app.post("/competitors/snapshot", requireAuth, async (req, res) => {
  await runCompetitorSnapshot(getOwnerKey(req));
  return res.redirect("/dashboard");
});

app.get("/audit", requireAuth, async (req, res) => {
  const recentRuns = await safelyGetRecentRuns(getOwnerKey(req));
  return res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: null,
    recentRuns
  });
});

app.get("/audit/:id", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);
    const auditRun = await getAuditRunById(req.params.id, ownerKey);

    if (!auditRun) {
      const recentRuns = await safelyGetRecentRuns(ownerKey);
      return res.status(404).render("index", {
        title: "Gaming Nectar Site Quality Auditor",
        error: "Audit run not found.",
        recentRuns
      });
    }

    const todos = await getTodosForAuditRun(req.params.id);
    const todoSummary = await getTodoSummaryForAuditRun(req.params.id);

    return res.render("results", {
      title: "Saved Audit Results",
      results: auditRun.results || [],
      siteAudit: auditRun.siteAudit || null,
      competitorAnalysis: auditRun.competitorAnalysis || null,
      auditRun,
      todos,
      todoSummary
    });
  } catch (error) {
    console.error("Saved audit route error:", error);
    const recentRuns = await safelyGetRecentRuns(getOwnerKey(req));
    return res.status(500).render("index", {
      title: "Gaming Nectar Site Quality Auditor",
      error: "Could not load the saved audit.",
      recentRuns
    });
  }
});

app.post("/audit", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);
    const mode = req.body.mode || "standard";

    if (mode === "site") {
      const siteUrl = String(req.body.siteUrl || "").trim();
      const maxUrls = Number(req.body.maxUrls || 50);

      if (!siteUrl) return renderIndexWithError(req, res, "Please enter a site URL before running a full-site crawl.");

      const siteAudit = await auditSiteFromSitemap(siteUrl, {
        maxUrls: Math.min(Math.max(maxUrls, 5), 100)
      });

      const auditRun = await saveAuditRun({
        ownerKey,
        type: "site",
        input: { siteUrl, maxUrls },
        results: siteAudit.results,
        siteAudit,
        competitorAnalysis: null
      });

      const snapshot = buildAuditSnapshot({ ownerKey, siteUrl, auditRun });
      await saveAuditSnapshot(snapshot);

      return res.redirect(`/audit/${auditRun._id.toString()}`);
    }

    if (mode === "competitor") {
      const primaryUrl = String(req.body.primaryUrl || "").trim();
      const competitorUrls = String(req.body.competitorUrls || "")
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, 5);

      if (!primaryUrl) return renderIndexWithError(req, res, "Please enter your page URL before running competitor analysis.");
      if (!competitorUrls.length) return renderIndexWithError(req, res, "Please enter at least one competitor URL.");

      const competitorAnalysis = await auditWithCompetitors(primaryUrl, competitorUrls);
      const results = [competitorAnalysis.primary, ...competitorAnalysis.competitors];

      const auditRun = await saveAuditRun({
        ownerKey,
        type: "competitor",
        input: { primaryUrl, competitorUrls },
        results,
        siteAudit: null,
        competitorAnalysis
      });

      return res.redirect(`/audit/${auditRun._id.toString()}`);
    }

    const urls = String(req.body.urls || "")
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!urls.length) return renderIndexWithError(req, res, "Please enter at least one URL.");

    const results = await auditMultipleUrls(urls);
    const auditRun = await saveAuditRun({
      ownerKey,
      type: "standard",
      input: { urls },
      results,
      siteAudit: null,
      competitorAnalysis: null
    });

    return res.redirect(`/audit/${auditRun._id.toString()}`);
  } catch (error) {
    console.error("Audit route error:", error);
    return renderIndexWithError(req, res, "Something went wrong while running the audit. Check the Render logs for details.");
  }
});

app.post("/todos", requireAuth, async (req, res) => {
  try {
    await createTodo({
      ownerKey: getOwnerKey(req),
      auditRunId: req.body.auditRunId,
      pageUrl: req.body.pageUrl,
      pageTitle: req.body.pageTitle,
      category: req.body.category,
      checkName: req.body.checkName,
      severity: req.body.severity,
      message: req.body.message,
      recommendation: req.body.recommendation,
      evidence: req.body.evidence,
      why: req.body.why,
      how: req.body.how,
      example: req.body.example,
      businessImpact: req.body.businessImpact,
      implementationHint: req.body.implementationHint,
      expectedImpact: req.body.expectedImpact,
      effort: req.body.effort,
      dueDate: req.body.dueDate,
      plannedFor: req.body.plannedFor,
      source: req.body.source || "manual",
      returnTo: req.body.returnTo
    });

    return res.redirect(req.body.returnTo || "/dashboard");
  } catch (error) {
    console.error("Create todo error:", error);
    return res.redirect(req.body.returnTo || "/dashboard");
  }
});

app.post("/todos/:id/status", requireAuth, async (req, res) => {
  try {
    await updateTodoStatus({
      todoId: req.params.id,
      status: req.body.status,
      dueDate: req.body.dueDate,
      plannedFor: req.body.plannedFor
    });

    return res.redirect(req.body.returnTo || "/dashboard");
  } catch (error) {
    console.error("Update todo status error:", error);
    return res.redirect(req.body.returnTo || "/dashboard");
  }
});

app.get("/health", async (_req, res) => {
  let mongo = "unknown";
  try {
    await ensureIndexes();
    mongo = "connected";
  } catch (error) {
    mongo = `error: ${error.message}`;
  }

  return res.status(200).json({ status: "ok", app: "Gaming Nectar Site Quality Auditor", mongo });
});

app.use(async (req, res) => {
  const recentRuns = res.locals.auth.isLoggedIn ? await safelyGetRecentRuns(getOwnerKey(req)) : [];
  return res.status(404).render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: `The page "${req.path}" does not exist. Use the audit form below.`,
    recentRuns
  });
});

async function renderIndexWithError(req, res, error) {
  const recentRuns = await safelyGetRecentRuns(getOwnerKey(req));
  return res.render("index", { title: "Gaming Nectar Site Quality Auditor", error, recentRuns });
}

async function safelyGetRecentRuns(ownerKey) {
  try {
    return await getRecentAuditRuns(10, ownerKey);
  } catch {
    return [];
  }
}

ensureIndexes()
  .then(async () => {
    console.log("MongoDB indexes ready.");
    await bootstrapAdminUser();
    startAuditScheduler();
  })
  .catch((error) => {
    console.warn("MongoDB setup skipped:", error.message);
  });

app.listen(PORT, () => {
  console.log(`Site Quality Auditor running on port ${PORT}`);
});