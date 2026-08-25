import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    environment: process.env.VERCEL_ENV || "unknown",
  });
}
