/**
 * queue/simpleQueue.js
 *
 * A zero-infrastructure job queue: no Redis, no separate worker process,
 * no extra hosted service. Jobs are processed one-by-one, in memory, in
 * the same Node process as the API server.
 *
 * Trade-off: jobs are lost if the server restarts mid-render, and only
 * one platform service (Render's free Web Service) is needed — which is
 * the right trade for a $0-budget, low-traffic MVP. Swap back to
 * BullMQ + Redis later if/when render volume grows enough to need it.
 */

const { v4: uuid } = require("uuid");

const jobs = new Map(); // jobId -> { state, progress, data, result, failedReason }
const pendingQueue = [];
let isProcessing = false;
let processorFn = null;

/** Registers the function that actually does the work for one job's data. */
function setProcessor(fn) {
  processorFn = fn;
}

function addJob(data) {
  const jobId = uuid();
  jobs.set(jobId, { state: "waiting", progress: { stage: "queued", percent: 0 }, data, result: null, failedReason: null });
  pendingQueue.push(jobId);
  runNext();
  return jobId;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function updateProgress(jobId, progress) {
  const job = jobs.get(jobId);
  if (job) job.progress = progress;
}

async function runNext() {
  if (isProcessing) return; // only one render at a time on a free-tier instance
  const jobId = pendingQueue.shift();
  if (!jobId) return;

  isProcessing = true;
  const job = jobs.get(jobId);
  job.state = "active";

  try {
    const result = await processorFn(jobId, job.data, (progress) => updateProgress(jobId, progress));
    job.state = "completed";
    job.result = result;
  } catch (err) {
    job.state = "failed";
    job.failedReason = err.message;
    console.error(`[queue] job ${jobId} failed:`, err);
  } finally {
    isProcessing = false;
    runNext(); // pick up the next waiting job, if any
  }
}

module.exports = { setProcessor, addJob, getJob, updateProgress };
