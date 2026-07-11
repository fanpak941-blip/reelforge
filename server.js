require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const generateRoutes = require("./routes/generate");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the website itself (public/index.html) — frontend + backend in
// ONE service, so deployment is just "one platform" (Render free tier).
app.use(express.static(path.join(__dirname, "public")));

// Serve finished videos/thumbnails so the website can play/download them.
app.use("/storage", express.static(path.join(__dirname, "storage")));

app.use("/api", generateRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ReelForge running on http://localhost:${PORT}`);
  console.log(`Website: http://localhost:${PORT}/  |  API: http://localhost:${PORT}/api`);
});
