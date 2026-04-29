import express from "express";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  let recentRuns = [];

  try {
    recentRuns = await getRecentAuditRuns(10);
  } catch (error) {
    console.warn("Could not load recent audit runs:", error.message);
  }

  return res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: null,
    recentRuns
  });
});

app.get("/audit", (req, res) => {
  res.redirect("/");
});

app.get("/audit/:id", async (req, res) => {
  try {
    const auditRun = await getAuditRunById(req.params.id);

    if (!auditRun) {
      const recentRuns = await safelyGetRecentRuns();

      return res.status(404).render("index", {
        title: "Gaming Nectar Site Quality Auditor",
        error: "Audit run not found.",
        recentRuns
      });
    }

    return res.render("results", {
      title: "Saved Audit Results",
      results: auditRun.results || [],
      siteAudit: auditRun.siteAudit || null,
      competitorAnalysis: auditRun.competitorAnalysis || null,
      auditRun
    });
  } catch (error) {
    console.error("Saved audit route error:", error);

    const recentRuns = await safelyGetRecentRuns();

    return res.status(500).render("index", {
      title: "Gaming Nectar Site Quality Auditor",
      error: "Could not load the saved audit.",
      recentRuns
    });
  }
});

app.post("/audit", async (req, res) => {
  try {
    const mode = req.body.mode || "standard";

    if (mode === "site") {
      const siteUrl = String(req.body.siteUrl || "").trim();
      const maxUrls = Number(req.body.maxUrls || 50);

      if (!siteUrl) {
        return renderIndexWithError(
          res,
          "Please enter a site URL before running a full-site crawl."
        );
      }

      const siteAudit = await auditSiteFromSitemap(siteUrl, {
        maxUrls: Math.min(Math.max(maxUrls, 5), 100)
      });

      const auditRun = await saveAuditRun({
        type: "site",
        input: {
          siteUrl,
          maxUrls
        },
        results: siteAudit.results,
        siteAudit,
        competitorAnalysis: null
      });

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
          res,
          "Please enter your page URL before running competitor analysis."
        );
      }

      if (!competitorUrls.length) {
        return renderIndexWithError(
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
        type: "competitor",
        input: {
          primaryUrl,
          competitorUrls
        },
        results,
        siteAudit: null,
        competitorAnalysis
      });

      return res.redirect(`/audit/${auditRun._id.toString()}`);
    }

    const rawUrls = req.body.urls || "";

    const urls = rawUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!urls.length) {
      return renderIndexWithError(res, "Please enter at least one URL.");
    }

    const results = await auditMultipleUrls(urls);

    const auditRun = await saveAuditRun({
      type: "standard",
      input: {
        urls
      },
      results,
      siteAudit: null,
      competitorAnalysis: null
    });

    return res.redirect(`/audit/${auditRun._id.toString()}`);
  } catch (error) {
    console.error("Audit route error:", error);

    return renderIndexWithError(
      res,
      "Something went wrong while running the audit. Check the Render logs for details."
    );
  }
});

app.get("/health", async (req, res) => {
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

app.use(async (req, res) => {
  const recentRuns = await safelyGetRecentRuns();

  return res.status(404).render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: `The page "${req.path}" does not exist. Use the audit form below.`,
    recentRuns
  });
});

async function renderIndexWithError(res, error) {
  const recentRuns = await safelyGetRecentRuns();

  return res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error,
    recentRuns
  });
}

async function safelyGetRecentRuns() {
  try {
    return await getRecentAuditRuns(10);
  } catch {
    return [];
  }
}

ensureIndexes()
  .then(() => {
    console.log("MongoDB indexes ready.");
  })
  .catch((error) => {
    console.warn("MongoDB index setup skipped:", error.message);
  });

app.listen(PORT, () => {
  console.log(`Site Quality Auditor running on port ${PORT}`);
});