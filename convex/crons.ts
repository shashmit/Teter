import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Uploads a tab started but never saved (closed mid-save, failed save).
crons.hourly("sweep abandoned uploads", { minuteUTC: 17 }, internal.uploads.sweepAbandoned, {});

export default crons;
