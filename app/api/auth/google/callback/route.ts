import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { exchangeCodeForTokens, getOAuthClient } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=missing_code", req.url));
  }

  const tokens = await exchangeCodeForTokens(code);

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email) {
    return NextResponse.redirect(new URL("/settings?error=no_email", req.url));
  }

  const user = await prisma.user.upsert({
    where: { email: profile.email },
    update: { name: profile.name ?? profile.email },
    create: { name: profile.name ?? profile.email, email: profile.email },
  });

  await prisma.emailAccount.upsert({
    where: { email: profile.email },
    update: {
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      accessStatus: "CONNECTED",
    },
    create: {
      userId: user.id,
      provider: "GMAIL",
      email: profile.email,
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      accessStatus: "CONNECTED",
    },
  });

  return NextResponse.redirect(new URL("/settings?connected=1", req.url));
}
