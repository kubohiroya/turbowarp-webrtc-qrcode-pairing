/**
 * SHA-256 as unpadded base64url.
 *
 * The digest detects optical transport damage. It is not an authentication
 * mechanism: anyone who can photograph the QR codes can also recompute it.
 */
export async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
