import { NextResponse } from "next/server";

/**
 * GET /api/version
 *
 * Returns build/deploy info for debugging which commit is live.
 */
export async function GET() {
  return NextResponse.json({
    appName: "gobii-results-manager",
    env: process.env.NODE_ENV,
    gitCommit:
      process.env.RENDER_GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT ??
      null,
    buildTime: new Date().toISOString(),
  });
}
