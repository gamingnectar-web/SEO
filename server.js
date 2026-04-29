import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  auditMultipleUrls,
  auditWithCompetitors,
  auditSiteFromSitemap
} from "./services/audit/crawler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: null
  });
});

app.get("/audit", (req, res) => {
  res.redirect("/");
});

app.post("/audit", async (req, res) => {
  try {
    const mode = req.body.mode || "standard";

    if (mode === "site") {
      const siteUrl = String(req.body.siteUrl || "").trim();
      const maxUrls = Number(req.body.maxUrls || 50);

      if (!siteUrl) {
        return res.render("index", {
          title: "Gaming Nectar Site Quality Auditor",
          error: "Please enter a site URL before running a full-site crawl."
        });
      }

      const siteAudit = await auditSiteFromSitemap(siteUrl, {
        maxUrls: Math.min(Math.max(maxUrls, 5), 100)
      });

      return res.render("results", {
        title: "Full Site Audit Results",
        results: siteAudit.results,
        siteAudit,
        competitorAnalysis: null
      });
    }

    if (mode === "competitor") {
      const primaryUrl = String(req.body.primaryUrl || "").trim();

      const competitorUrls = String(req.body.competitorUrls || "")
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, 5);

      if (!primaryUrl) {
        return res.render("index", {
          title: "Gaming Nectar Site Quality Auditor",
          error: "Please enter your page URL before running competitor analysis."
        });
      }

      if (!competitorUrls.length) {
        return res.render("index", {
          title: "Gaming Nectar Site Quality Auditor",
          error: "Please enter at least one competitor URL."
        });
      }

      const competitorAnalysis = await auditWithCompetitors(
        primaryUrl,
        competitorUrls
      );

      return res.render("results", {
        title: "Competitor Audit Results",
        results: [
          competitorAnalysis.primary,
          ...competitorAnalysis.competitors
        ],
        siteAudit: null,
        competitorAnalysis
      });
    }

    const rawUrls = req.body.urls || "";

    const urls = rawUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!urls.length) {
      return res.render("index", {
        title: "Gaming Nectar Site Quality Auditor",
        error: "Please enter at least one URL."
      });
    }

    const results = await auditMultipleUrls(urls);

    return res.render("results", {
      title: "Audit Results",
      results,
      siteAudit: null,
      competitorAnalysis: null
    });
  } catch (error) {
    console.error("Audit route error:", error);

    return res.status(500).render("index", {
      title: "Gaming Nectar Site Quality Auditor",
      error:
        "Something went wrong while running the audit. Check the Render logs for details."
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "Gaming Nectar Site Quality Auditor"
  });
});

app.use((req, res) => {
  res.status(404).render("index", {
    title: "Gaming Nectar Site Quality Auditor",
    error: `The page "${req.path}" does not exist. Use the audit form below.`
  });
});

app.listen(PORT, () => {
  console.log(`Site Quality Auditor running on port ${PORT}`);
});