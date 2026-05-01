import "dotenv/config";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import {
  auditMultipleUrls,
  auditWithCompetitors,
  auditSiteFromSitemap
} from "./services/audit/crawler.js";

import {
  saveAuditRun,
  getRecentAuditRuns,
  getAuditRunById
} from "./services/audit/store.js";

import { ensureIndexes } from "./services/db/mongodb.js";

import {
  createTodo,
  createTodosFromAuditResults,
  getTodosForAuditRun,
  getTodoSummaryForAuditRun,
  getTodosForOwner,
  getTodoSummaryForOwner,
  updateTodoStatus
} from "./services/audit/todos.js";

import {
  attachAuthLocals,
  bootstrapAdminUser,
  buildShopifyInstallUrl,
  createPasswordUser,
  exchangeShopifyCode,
  getOwnerKey,
  requireAuth,
  saveShopifyInstall,
  verifyPasswordLogin,
  verifyShopifyHmac
} from "./services/auth/auth.js";

import {
  startAuditScheduler,
  runScheduledAudits
} from "./services/intelligence/scheduler.js";

import {
  buildAuditSnapshot,
  buildMovementInsight,
  getAuditHistory,
  getDashboardTimeline,
  saveAuditSnapshot
} from "./services/intelligence/history.js";

import {
  getKeywordDashboard,
  getTrackedKeywords,
  runKeywordSnapshot,
  upsertTrackedKeyword
} from "./services/intelligence/keywords.js";

import {
  deleteTrackedCompetitor,
  getCompetitorDashboard,
  getTrackedCompetitors,
  runCompetitorSnapshot,
  upsertTrackedCompetitor
} from "./services/intelligence/competitors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Required for Render / reverse proxy hosting.
 * Without this, secure session cookies can fail and Shopify OAuth state can be lost.
 */
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use(
  session({
    name: "gn_seo_sid",
    secret: process.env.SESSION_SECRET || "dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: process.env.MONGODB_URI
      ? MongoStore.create({
          mongoUrl: process.env.MONGODB_URI,
          collectionName: "sessions"
        })
      : undefined,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14
    }
  })
);

app.use(attachAuthLocals);
app.use(express.static(path.join(__dirname, "public")));

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

app.get("/login", (req, res) => {
  if (res.locals.auth.isLoggedIn) {
    return res.redirect(req.query.returnTo || "/dashboard");
  }

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

    return req.session.save((error) => {
      if (error) {
        console.error("Could not save login session:", error);

        return res.status(500).render("login", {
          title: "Log in",
          error: "Could not save your session. Please try again.",
          returnTo: req.body.returnTo || "/dashboard"
        });
      }

      return res.redirect(req.body.returnTo || "/dashboard");
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).render("login", {
      title: "Log in",
      error: "Could not log in right now.",
      returnTo: req.body.returnTo || "/dashboard"
    });
  }
});

app.get("/signup", (req, res) => {
  if (res.locals.auth.isLoggedIn) {
    return res.redirect("/dashboard");
  }

  return res.render("signup", {
    title: "Create account",
    error: null
  });
});

app.post("/signup", async (req, res) => {
  try {
    const user = await createPasswordUser({
      email: req.body.email,
      password: req.body.password,
      siteUrl: req.body.siteUrl
    });

    req.session.userId = user._id.toString();
    req.session.userEmail = user.email;

    return req.session.save((error) => {
      if (error) {
        console.error("Could not save signup session:", error);

        return res.status(500).render("signup", {
          title: "Create account",
          error:
            "Your account was created, but the session could not be saved. Please log in."
        });
      }

      return res.redirect("/dashboard");
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(400).render("signup", {
      title: "Create account",
      error: error.message || "Could not create account."
    });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("gn_seo_sid");
    res.redirect("/login");
  });
});

/* -------------------------------------------------------------------------- */
/* Shopify OAuth                                                               */
/* -------------------------------------------------------------------------- */

app.get("/auth/shopify", (req, res) => {
  try {
    const { state, url } = buildShopifyInstallUrl(req.query.shop);

    req.session.shopifyOauthState = state;

    return req.session.save((error) => {
      if (error) {
        console.error("Could not save Shopify OAuth state:", error);
        return res.status(500).send("Could not start Shopify authentication.");
      }

      return res.redirect(url);
    });
  } catch (error) {
    console.error("Shopify OAuth start error:", error);
    return res.status(400).send(error.message);
  }
});

app.get("/auth/shopify/callback", async (req, res) => {
  try {
    if (!verifyShopifyHmac(req.query)) {
      return res.status(401).send("Invalid Shopify OAuth HMAC.");
    }

    const expectedState = req.session.shopifyOauthState;
    const receivedState = req.query.state;

    if (!expectedState || expectedState !== receivedState) {
      console.error("Invalid Shopify OAuth state.", {
        hasExpectedState: Boolean(expectedState),
        hasReceivedState: Boolean(receivedState),
        shop: req.query.shop
      });

      return res.status(401).send("Invalid Shopify OAuth state.");
    }

    const tokenPayload = await exchangeShopifyCode({
      shop: req.query.shop,
      code: req.query.code
    });

    const shopDoc = await saveShopifyInstall({
      shop: req.query.shop,
      tokenPayload
    });

    req.session.shopify = {
      shop: shopDoc.shop,
      scope: shopDoc.scope
    };

    delete req.session.shopifyOauthState;

    return req.session.save((error) => {
      if (error) {
        console.error("Could not save Shopify session:", error);

        return res
          .status(500)
          .send(
            "Shopify authentication completed, but the session could not be saved."
          );
      }

      return res.redirect("/dashboard");
    });
  } catch (error) {
    console.error("Shopify auth callback error:", error);
    return res.status(500).send("Shopify authentication failed.");
  }
});

/* -------------------------------------------------------------------------- */
/* Root                                                                        */
/* -------------------------------------------------------------------------- */

app.get("/", (req, res) => {
  if (req.query.shop && !res.locals.auth.isLoggedIn) {
    return res.redirect(
      `/auth/shopify?shop=${encodeURIComponent(req.query.shop)}`
    );
  }

  if (res.locals.auth.isLoggedIn) {
    return res.redirect("/dashboard");
  }

  return res.redirect("/login");
});

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

app.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);

    const recentRuns = await safelyGetRecentRuns(ownerKey);
    const timeline = await getDashboardTimeline(ownerKey, 30);
    const history = await getAuditHistory(ownerKey, 2);

    const current = history[0] || null;
    const previous = history[1] || null;
    const insight = buildMovementInsight(current, previous);

    const keywordSnapshots = await getKeywordDashboard(ownerKey, 50);
    const trackedKeywords = await getTrackedKeywords(ownerKey);

    const competitorSnapshots = await getCompetitorDashboard(ownerKey, 50);
    const trackedCompetitors = await getTrackedCompetitors(ownerKey);

    const todos = await getTodosForOwner(ownerKey, {
      limit: 12,
      includeDone: false
    });

    const todoSummary = await getTodoSummaryForOwner(ownerKey);

    return res.render("dashboard", {
      title: "SEO Intelligence Dashboard",
      recentRuns,
      timeline,
      insight,
      keywordSnapshots,
      trackedKeywords,
      competitorSnapshots,
      trackedCompetitors,
      todos,
      todoSummary
    });
  } catch (error) {
    console.error("Dashboard route error:", error);
    return res.status(500).send("Could not load dashboard.");
  }
});

app.get("/api/dashboard/timeline", requireAuth, async (req, res) => {
  try {
    const timeline = await getDashboardTimeline(getOwnerKey(req), 30);

    return res.json({
      timeline
    });
  } catch (error) {
    console.error("Timeline API error:", error);

    return res.status(500).json({
      error: "Could not load timeline."
    });
  }
});

app.post("/dashboard/run-scheduled-now", requireAuth, async (_req, res) => {
  try {
    await runScheduledAudits();
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Manual scheduled run error:", error);
    return res.redirect("/dashboard");
  }
});

/* -------------------------------------------------------------------------- */
/* Keywords                                                                    */
/* -------------------------------------------------------------------------- */

app.get("/keywords", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);

    const trackedKeywords = await getTrackedKeywords(ownerKey);
    const keywordSnapshots = await getKeywordDashboard(ownerKey, 250);
    const trackedCompetitors = await getTrackedCompetitors(ownerKey);
    const competitorSnapshots = await getCompetitorDashboard(ownerKey, 50);

    return res.render("keywords", {
      title: "Keywords",
      trackedKeywords,
      keywordSnapshots,
      trackedCompetitors,
      competitorSnapshots
    });
  } catch (error) {
    console.error("Keywords page error:", error);
    return res.status(500).send("Could not load keywords.");
  }
});

app.post("/keywords", requireAuth, async (req, res) => {
  try {
    await upsertTrackedKeyword({
      ownerKey: getOwnerKey(req),
      keyword: req.body.keyword,
      searchVolume: req.body.searchVolume,
      cpc: req.body.cpc,
      location: req.body.location || "United Kingdom",
      targetUrl: req.body.targetUrl || ""
    });

    return res.redirect("/keywords");
  } catch (error) {
    console.error("Keyword create error:", error);
    return res.redirect("/keywords");
  }
});

app.post("/keywords/snapshot", requireAuth, async (req, res) => {
  try {
    await runKeywordSnapshot(getOwnerKey(req));
    return res.redirect("/keywords");
  } catch (error) {
    console.error("Keyword snapshot error:", error);
    return res.redirect("/keywords");
  }
});

/* -------------------------------------------------------------------------- */
/* Competitors                                                                 */
/* -------------------------------------------------------------------------- */

app.post("/competitors", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);

    const urls = String(req.body.urls || "")
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    const competitor = await upsertTrackedCompetitor({
      ownerKey,
      domain: req.body.domain,
      urls
    });

    const maxUrls = await getCompetitorAuditUrlLimit(ownerKey);

    await runCompetitorSnapshot(ownerKey, {
      domain: competitor.domain,
      maxUrls
    });

    return res.redirect(req.body.returnTo || "/audit");
  } catch (error) {
    console.error("Competitor create error:", error);
    return res.redirect(req.body.returnTo || "/audit");
  }
});

app.post("/competitors/snapshot", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);
    const maxUrls = await getCompetitorAuditUrlLimit(ownerKey);

    await runCompetitorSnapshot(ownerKey, {
      domain: req.body.domain || null,
      maxUrls
    });

    return res.redirect(req.body.returnTo || "/audit");
  } catch (error) {
    console.error("Competitor snapshot error:", error);
    return res.redirect(req.body.returnTo || "/audit");
  }
});

app.post("/competitors/delete", requireAuth, async (req, res) => {
  try {
    await deleteTrackedCompetitor({
      ownerKey: getOwnerKey(req),
      domain: req.body.domain
    });

    return res.redirect(req.body.returnTo || "/audit");
  } catch (error) {
    console.error("Competitor delete error:", error);
    return res.redirect(req.body.returnTo || "/audit");
  }
});

/* -------------------------------------------------------------------------- */
/* To-dos                                                                      */
/* -------------------------------------------------------------------------- */

app.get("/todos", requireAuth, async (req, res) => {
  try {
    const ownerKey = getOwnerKey(req);

    const todos = await getTodosForOwner(ownerKey, {
      limit: 250,
      includeDone: true
    });

    const todoSummary = await getTodoSummaryForOwner(ownerKey);

    return res.render("todos", {
      title: "To-dos",
      todos,
      todoSummary
    });
  } catch (error) {
    console.error("Todos page error:", error);
    return res.status(500).send("Could not load to-dos.");
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
      status: req.body.status || "new",
      priority: req.body.priority || req.body.severity,
      dueDate: req.body.dueDate,
      plannedFor: req.body.plannedFor,
      source: req.body.source || "manual",
      notes: req.body.notes,
      returnTo: req.body.returnTo
    });

    return res.redirect(req.body.returnTo || "/todos");
  } catch (error) {
    console.error("Create todo error:", error);
    return res.redirect(req.body.returnTo || "/todos");
  }
});

app.post("/todos/:id/status", requireAuth, async (req, res) => {
  try {
    await updateTodoStatus({
      todoId: req.params.id,
      status: req.body.status,
      dueDate: req.body.dueDate,
      plannedFor: req.body.plannedFor,
      notes: req.body.notes,
      ownerKey: getOwnerKey(req)
    });

    return res.redirect(req.body.returnTo || "/todos");
  } catch (error) {
    console.error("Update todo status error:", error);
    return res.redirect(req.body.returnTo || "/todos");
  }
});

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

app.get("/audit", requireAuth, async (req, res) => {
  const ownerKey = getOwnerKey(req);

  const recentRuns = await safelyGetRecentRuns(ownerKey);
  const trackedCompetitors = await getTrackedCompetitors(ownerKey).catch(
    () => []
  );

  return res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: null,
    recentRuns,
    trackedCompetitors
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
        recentRuns,
        trackedCompetitors: []
      });
    }

    const todos = await getTodosForAuditRun(req.params.id, ownerKey);
    const todoSummary = await getTodoSummaryForAuditRun(req.params.id, ownerKey);
    const trackedCompetitors = await getTrackedCompetitors(ownerKey).catch(
      () => []
    );

    return res.render("results", {
      title: "Saved Audit Results",
      results: auditRun.results || [],
      siteAudit: auditRun.siteAudit || null,
      competitorAnalysis: auditRun.competitorAnalysis || null,
      auditRun,
      todos,
      todoSummary,
      trackedCompetitors
    });
  } catch (error) {
    console.error("Saved audit route error:", error);

    const recentRuns = await safelyGetRecentRuns(getOwnerKey(req));

    return res.status(500).render("index", {
      title: "Gaming Nectar Site Quality Auditor",
      error: "Could not load the saved audit.",
      recentRuns,
      trackedCompetitors: []
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

      if (!siteUrl) {
        return renderIndexWithError(
          req,
          res,
          "Please enter a site URL before running a full-site crawl."
        );
      }

      const siteAudit = await auditSiteFromSitemap(siteUrl, {
        maxUrls: Math.min(Math.max(maxUrls, 5), 100)
      });

      const auditRun = await saveAuditRun({
        ownerKey,
        type: "site",
        input: {
          siteUrl,
          maxUrls
        },
        results: siteAudit.results,
        siteAudit,
        competitorAnalysis: null
      });

      await createTodosFromAuditResults({
        ownerKey,
        auditRunId: auditRun._id.toString(),
        results: siteAudit.results,
        source: "site-audit"
      });

      const snapshot = buildAuditSnapshot({
        ownerKey,
        siteUrl,
        auditRun
      });

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

      if (!primaryUrl) {
        return renderIndexWithError(
          req,
          res,
          "Please enter your page URL before running competitor analysis."
        );
      }

      if (!competitorUrls.length) {
        return renderIndexWithError(
          req,
          res,
          "Please enter at least one competitor URL."
        );
      }

      const competitorAnalysis = await auditWithCompetitors(
        primaryUrl,
        competitorUrls
      );

      const results = [
        competitorAnalysis.primary,
        ...competitorAnalysis.competitors
      ];

      const auditRun = await saveAuditRun({
        ownerKey,
        type: "competitor",
        input: {
          primaryUrl,
          competitorUrls
        },
        results,
        siteAudit: null,
        competitorAnalysis
      });

      await createTodosFromAuditResults({
        ownerKey,
        auditRunId: auditRun._id.toString(),
        results,
        source: "competitor-audit"
      });

      const snapshot = buildAuditSnapshot({
        ownerKey,
        siteUrl: primaryUrl,
        auditRun
      });

      await saveAuditSnapshot(snapshot);

      return res.redirect(`/audit/${auditRun._id.toString()}`);
    }

    const urls = String(req.body.urls || "")
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!urls.length) {
      return renderIndexWithError(req, res, "Please enter at least one URL.");
    }

    const results = await auditMultipleUrls(urls);

    const auditRun = await saveAuditRun({
      ownerKey,
      type: "standard",
      input: {
        urls
      },
      results,
      siteAudit: null,
      competitorAnalysis: null
    });

    await createTodosFromAuditResults({
      ownerKey,
      auditRunId: auditRun._id.toString(),
      results,
      source: "page-audit"
    });

    const snapshot = buildAuditSnapshot({
      ownerKey,
      siteUrl: urls[0],
      auditRun
    });

    await saveAuditSnapshot(snapshot);

    return res.redirect(`/audit/${auditRun._id.toString()}`);
  } catch (error) {
    console.error("Audit route error:", error);

    return renderIndexWithError(
      req,
      res,
      "Something went wrong while running the audit. Check the Render logs for details."
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

app.get("/health", async (_req, res) => {
  let mongo = "unknown";

  try {
    await ensureIndexes();
    mongo = "connected";
  } catch (error) {
    mongo = `error: ${error.message}`;
  }

  return res.status(200).json({
    status: "ok",
    app: "Gaming Nectar Site Quality Auditor",
    mongo
  });
});

/* -------------------------------------------------------------------------- */
/* 404                                                                         */
/* -------------------------------------------------------------------------- */

app.use(async (req, res) => {
  if (!res.locals.auth.isLoggedIn) {
    return res.status(404).redirect("/login");
  }

  const recentRuns = await safelyGetRecentRuns(getOwnerKey(req));

  return res.status(404).render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: `The page "${req.path}" does not exist. Use the audit form below.`,
    recentRuns,
    trackedCompetitors: []
  });
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function renderIndexWithError(req, res, error) {
  const ownerKey = getOwnerKey(req);
  const recentRuns = await safelyGetRecentRuns(ownerKey);
  const trackedCompetitors = await getTrackedCompetitors(ownerKey).catch(
    () => []
  );

  return res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error,
    recentRuns,
    trackedCompetitors
  });
}

async function safelyGetRecentRuns(ownerKey) {
  try {
    return await getRecentAuditRuns(10, ownerKey);
  } catch (error) {
    console.error("Could not load recent audit runs:", error);
    return [];
  }
}

async function getCompetitorAuditUrlLimit(ownerKey) {
  try {
    const recentRuns = await getRecentAuditRuns(1, ownerKey);
    const latest = recentRuns && recentRuns.length ? recentRuns[0] : null;

    const fromPageCount = Number(latest?.summary?.pageCount || 0);
    const fromInputMax = Number(latest?.input?.maxUrls || 0);

    const bestGuess = Math.max(fromPageCount, fromInputMax, 10);

    return Math.min(Math.max(bestGuess, 5), 100);
  } catch (error) {
    console.error("Could not calculate competitor audit URL limit:", error);
    return 25;
  }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

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