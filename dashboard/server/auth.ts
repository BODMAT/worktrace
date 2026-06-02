import { OAuth2Client } from "google-auth-library";
import { SignJWT } from "jose";
import { prisma } from "@/server/db";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const googleClient = new OAuth2Client();

async function verifyGoogleToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: requireEnv("GOOGLE_CLIENT_ID"),
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) {
    throw new Error("Invalid token payload: missing sub or email");
  }
  return {
    googleId: payload.sub,
    email:    payload.email,
    name:     payload.name    ?? null,
    picture:  payload.picture ?? null,
  };
}

async function upsertUser(data: {
  googleId: string;
  email:    string;
  name:     string | null;
  picture:  string | null;
}) {
  return prisma.user.upsert({
    where:  { googleId: data.googleId },
    update: { email: data.email, name: data.name, picture: data.picture },
    create: { googleId: data.googleId, email: data.email,
              name: data.name, picture: data.picture },
  });
}

async function issueJWT(userId: string, email: string): Promise<string> {
  const secret    = requireEnv("JWT_SECRET");
  const expiresIn = process.env["JWT_EXPIRES_IN"] ?? "7d";
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export async function authenticateGoogleUser(googleIdToken: string): Promise<string> {
  const googleUser = await verifyGoogleToken(googleIdToken);
  const user       = await upsertUser(googleUser);
  return issueJWT(user.id, user.email);
}
