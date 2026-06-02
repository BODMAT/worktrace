import { prisma } from "./db";
import { decryptSecret, encryptSecret, last4 } from "./crypto";

export type UserSettingsView = {
  hasGroqApiKey: boolean;
  last4:         string | null;
};

export async function getUserSettingsView(userId: string): Promise<UserSettingsView> {
  const row = await prisma.userSetting.findUnique({
    where:  { userId },
    select: { groqApiKey: true, groqApiKeyLast4: true },
  });
  if (!row?.groqApiKey) return { hasGroqApiKey: false, last4: null };
  return { hasGroqApiKey: true, last4: row.groqApiKeyLast4 ?? null };
}

export async function getDecryptedGroqApiKey(userId: string): Promise<string | null> {
  const row = await prisma.userSetting.findUnique({
    where:  { userId },
    select: { groqApiKey: true },
  });
  if (!row?.groqApiKey) return null;
  try {
    return decryptSecret(row.groqApiKey);
  } catch {
    return null;
  }
}

export async function setGroqApiKey(
  userId: string,
  plaintext: string | null,
): Promise<UserSettingsView> {
  if (plaintext === null) {
    await prisma.userSetting.upsert({
      where:  { userId },
      create: { userId, groqApiKey: null, groqApiKeyLast4: null },
      update: { groqApiKey: null, groqApiKeyLast4: null },
    });
    return { hasGroqApiKey: false, last4: null };
  }

  const ciphertext = encryptSecret(plaintext);
  const tail       = last4(plaintext);
  await prisma.userSetting.upsert({
    where:  { userId },
    create: { userId, groqApiKey: ciphertext, groqApiKeyLast4: tail },
    update: { groqApiKey: ciphertext, groqApiKeyLast4: tail },
  });
  return { hasGroqApiKey: true, last4: tail };
}
