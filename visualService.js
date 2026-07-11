/**
 * visualService.js
 *
 * Supplies the visual half of each 5-second beat. Three modes, matching
 * the "Style" choice on the frontend create panel:
 *
 *  - "stock"          -> pull a matching clip from Pexels (free) per beat
 *  - "image-to-video"  -> take a user-uploaded image and animate it with a
 *                         slow pan/zoom (Ken Burns effect) to fill 5 seconds
 *  - "avatar"          -> placeholder hook for a paid avatar API (HeyGen/
 *                         Synthesia) — not part of the free MVP, wired in
 *                         later behind the same interface
 */

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { BEAT_SECONDS } = require("../utils/segmentSplitter");

/**
 * Pulls 1-2 keywords out of a beat's text to search stock footage with.
 * Very lightweight — strips common stop-words, keeps nouns/verbs-ish tokens.
 */
function extractKeywords(text) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "in", "on",
    "and", "for", "you", "your", "it", "this", "that", "with", "as", "at",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(" ")
    .filter((w) => w.length > 3 && !stopWords.has(w));
  return words.slice(0, 2).join(" ") || "lifestyle";
}

async function fetchStockClipForBeat({ beat, outputDir, aspectRatio }) {
  const query = extractKeywords(beat.text);
  const orientation = aspectRatio === "16:9" ? "landscape" : aspectRatio === "1:1" ? "square" : "portrait";

  const response = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: { query, orientation, per_page: 1 },
  });

  const video = response.data?.videos?.[0];
  if (!video) {
    throw new Error(`No stock footage found for beat ${beat.index} (query: "${query}")`);
  }

  // Pick the smallest file that still covers our target resolution to keep
  // downloads fast and cheap on bandwidth.
  const bestFile =
    video.video_files.find((f) => f.quality === "sd") || video.video_files[0];

  const outputPath = path.join(outputDir, `beat_${String(beat.index).padStart(3, "0")}_visual.mp4`);
  const writer = fs.createWriteStream(outputPath);
  const videoStream = await axios.get(bestFile.link, { responseType: "stream" });
  videoStream.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  // Trim/loop to exactly BEAT_SECONDS so every beat is a uniform length —
  // this is what makes the "5s visual, 5s visual, ..." rhythm consistent.
  const trimmedPath = outputPath.replace(".mp4", "_trimmed.mp4");
  await trimOrLoopToLength(outputPath, trimmedPath, BEAT_SECONDS);

  return trimmedPath;
}

/**
 * Animates a static image into a 5-second clip with a slow zoom/pan
 * (Ken Burns effect) so user-uploaded images become usable video beats.
 */
async function animateImageForBeat({ imagePath, beatIndex, outputDir, aspectRatio }) {
  const dims =
    aspectRatio === "16:9" ? "1920x1080" : aspectRatio === "1:1" ? "1080x1080" : "1080x1920";
  const outputPath = path.join(outputDir, `beat_${String(beatIndex).padStart(3, "0")}_visual.mp4`);

  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(BEAT_SECONDS)
      .videoFilters([
        `scale=${dims}:force_original_aspect_ratio=increase,crop=${dims}`,
        // slow zoom-in over the 5s beat for the "image brought to life" effect
        `zoompan=z='min(zoom+0.0015,1.15)':d=${BEAT_SECONDS * 25}:s=${dims}`,
      ])
      .fps(25)
      .duration(BEAT_SECONDS)
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

function trimOrLoopToLength(inputPath, outputPath, seconds) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-stream_loop", "-1"])
      .duration(seconds)
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

/**
 * Resolves visuals for every beat according to the chosen style.
 * `style` is one of: "stock", "image-to-video", "avatar", "mixed"
 * For "image-to-video", `images` is an ordered array of uploaded file paths
 * that get cycled/looped across beats if there are fewer images than beats.
 */
async function generateVisualsForAllBeats({ beats, style, outputDir, aspectRatio, images = [] }) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const enriched = [];
  for (const beat of beats) {
    let visualPath;

    if (style === "image-to-video" && images.length > 0) {
      const img = images[beat.index % images.length]; // loop through uploaded images
      visualPath = await animateImageForBeat({
        imagePath: img,
        beatIndex: beat.index,
        outputDir,
        aspectRatio,
      });
    } else if (style === "avatar") {
      // Not implemented in the free MVP — throw a clear error so the queue
      // surfaces it instead of silently producing a broken video.
      throw new Error("Avatar mode requires a paid provider (HeyGen/Synthesia) — not available on the free tier yet.");
    } else {
      visualPath = await fetchStockClipForBeat({ beat, outputDir, aspectRatio });
    }

    enriched.push({ ...beat, visualPath });
  }
  return enriched;
}

module.exports = { generateVisualsForAllBeats, extractKeywords };
