/**
 * thumbnailService.js
 *
 * Generates a YouTube-style thumbnail for the finished video: pulls a hook
 * line from the script's first beat, composites it over a frame grabbed
 * from the video, with bold text — entirely free using node-canvas + ffmpeg
 * (no Canva API, no per-thumbnail cost).
 */

const { createCanvas, loadImage, registerFont } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

/** Grabs a frame from partway through the video to use as the thumbnail background. */
function extractFrame({ videoPath, outputPath, atSeconds = 2 }) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [atSeconds],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "1280x720",
      })
      .on("end", () => resolve(outputPath))
      .on("error", reject);
  });
}

/** Picks a short, punchy hook line out of the first beat's text. */
function extractHookText(firstBeatText) {
  const words = firstBeatText.split(" ").slice(0, 7).join(" ");
  return words.toUpperCase();
}

/**
 * Composites bold hook text over the frame, with a niche-colored accent bar.
 */
async function generateThumbnail({ framePath, hookText, outputPath, accentColor = "#E8B04B" }) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(framePath);
  ctx.drawImage(bg, 0, 0, width, height);

  // Dark gradient at the bottom so white text stays readable over any footage.
  const gradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Accent bar (niche color) on the left edge — visual brand consistency.
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 14, height);

  // Hook text, bold, bottom-left, wrapped to fit.
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 72px sans-serif";
  ctx.textBaseline = "bottom";

  const maxWidth = width - 100;
  const words = hookText.split(" ");
  let lines = [];
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  lines = lines.slice(0, 3); // cap at 3 lines so it never overflows

  const lineHeight = 84;
  const startY = height - 50 - (lines.length - 1) * lineHeight;
  lines.forEach((line, i) => {
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 8;
    ctx.strokeText(line, 50, startY + i * lineHeight);
    ctx.fillText(line, 50, startY + i * lineHeight);
  });

  const buffer = canvas.toBuffer("image/jpeg", { quality: 0.92 });
  require("fs").writeFileSync(outputPath, buffer);
  return outputPath;
}

/** Generates 3 thumbnail variations (different hook framing / accent color) for the user to pick from. */
async function generateThumbnailVariations({ videoPath, firstBeatText, outputDir, jobId }) {
  const framePath = path.join(outputDir, `${jobId}_frame.jpg`);
  await extractFrame({ videoPath, outputPath: framePath, atSeconds: 2 });

  const hook = extractHookText(firstBeatText);
  const variations = [
    { suffix: "v1", accentColor: "#E8B04B", text: hook },
    { suffix: "v2", accentColor: "#5EEAD4", text: hook },
    { suffix: "v3", accentColor: "#FF5A1F", text: `${hook} ?` },
  ];

  const outputs = [];
  for (const v of variations) {
    const outPath = path.join(outputDir, `${jobId}_thumb_${v.suffix}.jpg`);
    await generateThumbnail({ framePath, hookText: v.text, outputPath: outPath, accentColor: v.accentColor });
    outputs.push(outPath);
  }
  return outputs;
}

module.exports = { generateThumbnailVariations };
