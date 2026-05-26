import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
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

function issueJWT(userId: string, email: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    { sub: userId, email },
    requireEnv("JWT_SECRET"),
    { expiresIn },
  );
}

export async function authenticateGoogleUser(googleIdToken: string): Promise<string> {
  const googleUser = await verifyGoogleToken(googleIdToken);
  const user       = await upsertUser(googleUser);
  return issueJWT(user.id, user.email);
}
