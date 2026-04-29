import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { auditMultipleUrls } from "./services/audit/crawler.js";

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
    results
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