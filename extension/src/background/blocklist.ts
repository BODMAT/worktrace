export const BLOCKLIST_KEY = "blockedDomains";

/**
 * Extracts the hostname from a URL string.
 * Returns null if the URL is unparseable (e.g. chrome://, about:blank).
 */
export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export async function getBlocklist(): Promise<string[]> {
  const r = await chrome.storage.local.get(BLOCKLIST_KEY);
  return (r[BLOCKLIST_KEY] as string[] | undefined) ?? [];
}

export async function addDomain(domain: string): Promise<void> {
  const current = await getBlocklist();
  if (current.includes(domain)) return;
  await chrome.storage.local.set({ [BLOCKLIST_KEY]: [...current, domain] });
}

export async function removeDomain(domain: string): Promise<void> {
  const current = await getBlocklist();
  await chrome.storage.local.set({
    [BLOCKLIST_KEY]: current.filter((d) => d !== domain),
  });
}

/**
 * Returns true if the given URL's hostname matches any blocked domain.
 * Subdomain matching: blocking "google.com" also blocks "mail.google.com".
 */
export async function isDomainBlocked(url: string): Promise<boolean> {
  const hostname = extractHostname(url);
  if (!hostname) return false;
  const blocklist = await getBlocklist();
  return blocklist.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}
