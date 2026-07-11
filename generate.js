/**
 * routes/generate.js
 *
 * Maps directly to the "Create" panel on the website:
 *   - script (pasted) OR topic+niche (write for me)
 *   - length (1-30 min)
 *   - voice (language + gender)
 *   - style (avatar / stock / image-to-video / mixed)
 *   - frame size (9:16 / 16:9 / 1:1 / 4:5)
 *
 * Uses the in-memory queue (no Redis) — runs the whole pipeline inside
 * the same process as the API server. One platform service, $0 extra cost.
 */

const express = require("express");
const multer = require("multer");
const path = require("path");

const simpleQueue = require("../queue/simpleQueue");
const { runVideoJob } = require("../pipeline/runVideoJob");

simpleQueue.setProcessor(runVideoJob);

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, "..", "storage", "uploads") });

const VALID_ASPECTS = ["9:16", "16:9", "1:1", "4:5"];
const VALID_STYLES = ["avatar", "stock", "image-to-video", "mixed"];

router.post("/generate", upload.array("images", 20), async (req, res) => {
  try {
    const {
      scriptText,
      topic,
      niche,
      durationMinutes,
      language = "English",
      gender = "Male",
      style = "stock",
      aspectRatio = "9:16",
      isOwner,
    } = req.body;

    if (!scriptText && !topic) {
      return res.status(400).json({ error: "Provide either a pasted script or a topic to write one." });
    }
    const duration = Number(durationMinutes);
    if (!duration || duration < 1 || duration > 30) {
      return res.status(400).json({ error: "durationMinutes must be between 1 and 30." });
    }
    if (!VALID_STYLES.includes(style)) {
      return res.status(400).json({ error: `style must be one of: ${VALID_STYLES.join(", ")}` });
    }
    if (!VALID_ASPECTS.includes(aspectRatio)) {
      return res.status(400).json({ error: `aspectRatio must be one of: ${VALID_ASPECTS.join(", ")}` });
    }
    if (style === "avatar" && isOwner !== "true" && isOwner !== true) {
      return res.status(402).json({
        error: "Avatar mode is part of the $10/mo plan. Upgrade to unlock, or choose Stock / Image-to-Video.",
      });
    }

    if (isOwner !== "true" && isOwner !== true) {
      const allowed = await checkAndDeductCredits(req.body.userId, duration);
      if (!allowed) {
        return res.status(402).json({ error: "Not enough credits for this video length on your current plan." });
      }
    }

    const uploadedImagePaths = (req.files || []).map((f) => f.path);

    const jobId = simpleQueue.addJob({
      scriptText,
      topic,
      niche,
      durationMinutes: duration,
      language,
      gender,
      style,
      aspectRatio,
      uploadedImagePaths,
    });

    const estimatedSeconds = Math.round(duration * 48);
    res.status(202).json({ jobId, estimatedSeconds });
  } catch (err) {
    console.error("[POST /api/generate]", err);
    res.status(500).json({ error: "Failed to queue video generation." });
  }
});

router.get("/generate/:jobId/status", async (req, res) => {
  const job = simpleQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });

  res.json({
    jobId: req.params.jobId,
    state: job.state,
    progress: job.progress,
    result: job.state === "completed" ? job.result : null,
    failedReason: job.state === "failed" ? job.failedReason : null,
  });
});

async function checkAndDeductCredits(userId, durationMinutes) {
  // TODO: replace with real DB lookup against the user's plan + remaining minutes.
  return true;
}

module.exports = router;
