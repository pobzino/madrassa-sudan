const LOCAL_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteUrl(process.env.URL) ??
    normalizeSiteUrl(process.env.DEPLOY_PRIME_URL) ??
    normalizeSiteUrl(process.env.DEPLOY_URL) ??
    LOCAL_SITE_URL
  );
}

export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`;
}
