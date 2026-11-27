import { SignJWT, jwtVerify } from "jose";

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface CreateSessionTokenInput {
  userId: string;
  secret: string;
  now?: Date;
}

interface ReadSessionTokenInput {
  token: string;
  secret: string;
  now?: Date;
}

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function createSessionToken({
  userId,
  secret,
  now = new Date(),
}: CreateSessionTokenInput): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(new Date(now.getTime() + SESSION_DURATION_MS))
    .sign(toKey(secret));
}

export async function readSessionToken({
  token,
  secret,
  now = new Date(),
}: ReadSessionTokenInput): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, toKey(secret), {
      algorithms: ["HS256"],
      currentDate: now,
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
