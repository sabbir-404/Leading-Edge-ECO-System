/**
 * ═══════════════════════════════════════════════════════════════════════════
 * electron/credentials.ts — Encrypted Supabase Credential Store
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These are AES-256-GCM encrypted blobs of the Supabase project URL and
 * anon key. They are safe to commit to source control — without the
 * GENERATION_SECRET (held only by the developer) they are indistinguishable
 * from random bytes.
 *
 * HOW THEY WERE GENERATED:
 *   node tools/encrypt-credentials.cjs
 *   Key derivation: PBKDF2(GENERATION_SECRET, CREDENTIAL_SALT, 100_000, sha512) → 32-byte AES key
 *   Encryption: AES-256-GCM
 *   Format: base64( IV[12] + AuthTag[16] + Ciphertext )
 *
 * HOW THEY ARE DECRYPTED:
 *   On first launch, when the user enters a valid license key:
 *     1. supabase.ts calls decryptEmbeddedCredentials()
 *     2. The same PBKDF2 derivation reproduces the AES key
 *     3. GCM decryption + auth tag verification gives the plaintext
 *     4. Credentials are saved to userData/supabase-config.json
 *
 * TO REGENERATE (e.g., if you rotate your Supabase anon key):
 *   node tools/encrypt-credentials.cjs
 *   Replace ENCRYPTED_URL and ENCRYPTED_ANON_KEY below with the new output.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Generated: 2026-05-08
// Regenerate with: node tools/encrypt-credentials.cjs
export const ENCRYPTED_URL      = 'MfOND3IzV1VKJRtFlLbBkYsbXXqWK7uuDIdzU8/bKKmh3RHbTSPLD2EYNBeEDRURUJbwGcrAqomXCkNWbzpECDBgC9Y=';
export const ENCRYPTED_ANON_KEY = '+Gw67afv/kPm9+BoZgDkz3diFGjvpJFe0pmPbF81/xrlU3N8q8emCb1C4sI92YjM0SNFGwUIoxpcjbmB2H+wKhHljR9fjW6zmIJhEOpQwK3yfErSdvdk3241oje3XiUaBbyi/90i7Uj9pV2SUJhDXBTvunyr0djjTlrmYwtpWlS9ocf4KuwOBg+LpmRznhfmObG1/VszM5p2Pkgx9LXk0Q9zZNa7N5/AR2zIt3MUInhSTo9hQO9zkarpjDKnVM/pz760yaaRizQ9aGQgcZl2HOo1LqPgnjeLI1iuFRlfCn3cwEDpuLddsFDt8Wc=';
