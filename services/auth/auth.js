import crypto from "crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getCollections } from "../db/mongodb.js";

export function getOwnerKey(req) {
  if (req.session?.shopify?.shop) return `shopify:${req.session.shopify.shop}`;
  if (req.session?.userId) return `user:${req.session.userId}`;
  return "public:anonymous";
}

export function isLoggedIn(req) {
  return Boolean(req.session?.userId || req.session?.shopify?.shop);
}

export function requireAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  const returnTo = encodeURIComponent(req.originalUrl || "/dashboard");
  return res.redirect(`/login?returnTo=${returnTo}`);
}

export function attachAuthLocals(req, res, next) {
  res.locals.auth = {
    isLoggedIn: isLoggedIn(req),
    userId: req.session?.userId || null,
    shopifyShop: req.session?.shopify?.shop || null,
    ownerKey: getOwnerKey(req)
  };
  next();
}

export async function bootstrapAdminUser() {
  const email = normaliseEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  const { users } = await getCollections();
  const existing = await users.findOne({ email });
  if (existing) return existing;

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);

  const doc = {
    email,
    passwordHash,
    role: "admin",
    createdAt: now,
    updatedAt: now
  };

  const result = await users.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function verifyPasswordLogin(email, password) {
  const { users } = await getCollections();
  const user = await users.findOne({ email: normaliseEmail(email) });
  if (!user?.passwordHash) return null;

  const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
  return ok ? user : null;
}

export function buildShopifyInstallUrl(shop) {
  const cleanShop = normaliseShop(shop);
  if (!cleanShop) throw new Error("Missing Shopify shop domain.");

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || "read_products,read_content,read_themes";
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL;
  if (!apiKey || !appUrl) {
    throw new Error("SHOPIFY_API_KEY and SHOPIFY_APP_URL are required for Shopify OAuth.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${appUrl.replace(/\/$/, "")}/auth/shopify/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state
  });

  return {
    state,
    url: `https://${cleanShop}/admin/oauth/authorize?${params.toString()}`
  };
}

export function verifyShopifyHmac(query) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;

  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(",") : rest[key]}`)
    .join("&");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(String(hmac)), Buffer.from(digest));
}

export async function exchangeShopifyCode({ shop, code }) {
  const cleanShop = normaliseShop(shop);
  const response = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function saveShopifyInstall({ shop, tokenPayload }) {
  const { shops } = await getCollections();
  const now = new Date();

  const doc = {
    shop: normaliseShop(shop),
    accessToken: tokenPayload.access_token,
    scope: tokenPayload.scope,
    installedAt: now,
    updatedAt: now,
    status: "installed"
  };

  await shops.updateOne(
    { shop: doc.shop },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return doc;
}

export async function getUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  const { users } = await getCollections();
  return users.findOne({ _id: new ObjectId(id) }, { projection: { passwordHash: 0 } });
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normaliseShop(shop) {
  const value = String(shop || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value) return "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Error("Invalid Shopify shop domain. Use your-store.myshopify.com.");
  }
  return value;
}