import { describe, expect, it } from "vitest";

import { createSessionToken, readSessionToken } from "./session-token.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const signedInAt = new Date("2026-11-24T10:00:00.000Z");

function hoursAfterSignIn(hours: number): Date {
  return new Date(signedInAt.getTime() + hours * 60 * 60 * 1000);
}

function readPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(
    Buffer.from(payload ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

function createToken(): Promise<string> {
  return createSessionToken({ userId: "user-1", secret, now: signedInAt });
}

describe("session token", () => {
  it("returns the user id from a valid token", async () => {
    const token = await createToken();

    await expect(
      readSessionToken({ token, secret, now: signedInAt }),
    ).resolves.toBe("user-1");
  });

  it("carries only the user id and its times, never the role", async () => {
    const token = await createToken();

    expect(Object.keys(readPayload(token)).sort()).toEqual([
      "exp",
      "iat",
      "sub",
    ]);
  });

  it("accepts a token used less than 8 hours after it was issued", async () => {
    const token = await createToken();

    await expect(
      readSessionToken({ token, secret, now: hoursAfterSignIn(7.9) }),
    ).resolves.toBe("user-1");
  });

  it("rejects a token used more than 8 hours after it was issued", async () => {
    const token = await createToken();

    await expect(
      readSessionToken({ token, secret, now: hoursAfterSignIn(8.1) }),
    ).resolves.toBeNull();
  });

  it("rejects a token whose content was changed", async () => {
    const token = await createToken();
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...readPayload(token), sub: "another-user" }),
    ).toString("base64url");
    const forgedToken = `${header}.${forgedPayload}.${signature}`;

    await expect(
      readSessionToken({ token: forgedToken, secret, now: signedInAt }),
    ).resolves.toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken({
      userId: "user-1",
      secret: "another-secret-that-is-also-long-enough",
      now: signedInAt,
    });

    await expect(
      readSessionToken({ token, secret, now: signedInAt }),
    ).resolves.toBeNull();
  });

  it("rejects a value that is not a token", async () => {
    await expect(
      readSessionToken({ token: "not-a-token", secret, now: signedInAt }),
    ).resolves.toBeNull();
  });
});
