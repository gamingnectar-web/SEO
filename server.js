import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { auditMultipleUrls, auditWithCompetitors } from "./services/audit/crawler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", {
    title: "Gaming Nectar Site Quality Auditor"
  });
});

app.post("/audit", async (req, res) => {
  const mode = req.body.mode || "standard";

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

    const competitorAnalysis = await auditWithCompetitors(primaryUrl, competitorUrls);

    return res.render("results", {
      title: "Competitor Audit Results",
      results: [competitorAnalysis.primary, ...competitorAnalysis.competitors],
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

  res.render("results", {
    title: "Audit Results",
    results,
    competitorAnalysis: null
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "Gaming Nectar Site Quality Auditor"
  });
});

app.listen(PORT, () => {
  console.log(`Site Quality Auditor running on port ${PORT}`);
});