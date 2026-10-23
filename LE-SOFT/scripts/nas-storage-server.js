/**
 * Authenticated, encrypted-at-rest file service for LE-SOFT's TrueNAS host.
 *
 * Required environment:
 *   NAS_JWT_SECRET              PostgREST HS256 signing secret (never the JWT itself)
 *   NAS_STORAGE_ENCRYPTION_KEY  32-byte base64 key dedicated to media encryption
 *   PORT                        Optional, defaults to 8080
 *
 * Existing file URLs remain compatible. Reads, uploads, and deletes require a
 * short-lived bearer JWT with role nas_authenticated (or an admin role). Legacy
 * plaintext objects are encrypted and atomically replaced on their first read.
 */
'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const UPLOADS_DIR = path.resolve(process.env.NAS_STORAGE_PATH || path.join(__dirname, 'uploads'));
const INCOMING_DIR = path.join(UPLOADS_DIR, '.incoming');
const MAX_FILE_BYTES = Math.max(1, Number(process.env.NAS_STORAGE_MAX_FILE_MB || 100)) * 1024 * 1024;
const MAGIC = Buffer.from('LEF1');

function getKey() {
  const value = String(process.env.NAS_STORAGE_ENCRYPTION_KEY || '').trim();
  if (!value) throw new Error('NAS_STORAGE_ENCRYPTION_KEY is required');
  let key;
  try { key = Buffer.from(value, 'base64'); } catch {}
  if (!key || key.length !== 32) {
    try { key = Buffer.from(value, 'hex'); } catch {}
  }
  if (!key || key.length !== 32) throw new Error('NAS_STORAGE_ENCRYPTION_KEY must encode exactly 32 bytes (base64 or hex)');
  return key;
}

const jwtSecret = process.env.NAS_JWT_SECRET_B64
  ? Buffer.from(process.env.NAS_JWT_SECRET_B64, 'base64').toString('utf8')
  : String(process.env.NAS_JWT_SECRET || '');
if (jwtSecret.length < 32) throw new Error('NAS_JWT_SECRET must be configured with the PostgREST JWT signing secret');
const encryptionKey = getKey();
fs.mkdirSync(INCOMING_DIR, { recursive: true, mode: 0o700 });

function safeRelativePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) return null;
  return segments.join(path.sep);
}

function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  let header, claims, signature;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    signature = Buffer.from(parts[2], 'base64url');
  } catch { return false; }
  if (header.alg !== 'HS256' || !['nas_authenticated', 'admin', 'service_role'].includes(String(claims.role || ''))) return false;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) return false;
  if (typeof claims.nbf === 'number' && claims.nbf > now) return false;
  const expected = crypto.createHmac('sha256', jwtSecret).update(`${parts[0]}.${parts[1]}`).digest();
  return signature.length === expected.length && crypto.timingSafeEqual(signature, expected);
}

function requireAuth(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!match || !verifyJwt(match[1])) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

function encryptBuffer(input) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBuffer(input) {
  if (input.length < 32 || !input.subarray(0, 4).equals(MAGIC)) throw new Error('Encrypted file header is invalid');
  const iv = input.subarray(4, 16);
  const tag = input.subarray(16, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(input.subarray(32)), decipher.final()]);
}

async function encryptFile(sourcePath, destinationPath) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const temporaryPath = `${destinationPath}.${crypto.randomUUID()}.tmp`;
  const output = fs.createWriteStream(temporaryPath, { mode: 0o600 });
  output.write(Buffer.alloc(32)); // authenticated header patched after the GCM tag is known
  await pipeline(fs.createReadStream(sourcePath), cipher, output);
  const fd = await fsp.open(temporaryPath, 'r+');
  try { await fd.write(Buffer.concat([MAGIC, iv, cipher.getAuthTag()]), 0, 32, 0); await fd.sync(); }
  finally { await fd.close(); }
  await fsp.rename(temporaryPath, destinationPath);
}

async function readProtectedFile(relativePath) {
  const absolutePath = path.resolve(UPLOADS_DIR, relativePath);
  if (!absolutePath.startsWith(`${UPLOADS_DIR}${path.sep}`)) return null;
  const encryptedPath = `${absolutePath}.enc`;
  try {
    const stat = await fsp.stat(encryptedPath);
    if (!stat.isFile()) return null;
    const encrypted = await fsp.readFile(encryptedPath);
    return { data: decryptBuffer(encrypted), path: encryptedPath };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Migrate older files in place. The plaintext filename is removed only after
  // the encrypted file has been completely written and synced.
  try {
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    await encryptFile(absolutePath, encryptedPath);
    const encrypted = await fsp.readFile(encryptedPath);
    const data = decryptBuffer(encrypted);
    await fsp.unlink(absolutePath);
    return { data, path: encryptedPath };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function encryptExistingFiles() {
  let migrated = 0;
  let alreadyEncrypted = 0;
  let errors = 0;
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.incoming' || entry.name.endsWith('.tmp')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(absolute); continue; }
      if (!entry.isFile() || entry.name.endsWith('.enc')) continue;
      const target = `${absolute}.enc`;
      try {
        try {
          const encrypted = await fsp.readFile(target);
          decryptBuffer(encrypted); // only remove plaintext when the ciphertext is valid
          await fsp.unlink(absolute);
          alreadyEncrypted++;
          continue;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await encryptFile(absolute, target);
        const originalHash = crypto.createHash('sha256').update(await fsp.readFile(absolute)).digest('hex');
        const encryptedData = await fsp.readFile(target);
        const plaintext = decryptBuffer(encryptedData);
        const migratedHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        if (migratedHash !== originalHash) throw new Error('Integrity check failed');
        await fsp.unlink(absolute);
        migrated++;
      } catch { errors++; }
    }
  }
  await visit(UPLOADS_DIR);
  console.log(`[Storage Server] Legacy-media migration complete: migrated=${migrated} already_encrypted=${alreadyEncrypted} errors=${errors}`);
  if (errors) process.exitCode = 1;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, INCOMING_DIR),
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID())
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

app.disable('x-powered-by');
app.use(cors({ origin: true, methods: ['GET', 'HEAD', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Subfolder'] }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'healthy', protectedStorage: true, encryption: 'AES-256-GCM' }));

app.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  const incoming = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const subfolder = safeRelativePath(req.headers['x-subfolder'] || '');
    const filename = path.basename(req.file.originalname || 'upload.bin').replace(/[\x00-\x1f<>:"|?*]/g, '_').slice(0, 180);
    if (!filename || !subfolder) return res.status(400).json({ success: false, error: 'Invalid storage path' });
    const relative = path.join(subfolder, filename);
    const targetPath = path.resolve(UPLOADS_DIR, relative);
    if (!targetPath.startsWith(`${UPLOADS_DIR}${path.sep}`)) return res.status(400).json({ success: false, error: 'Invalid storage path' });
    await fsp.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await encryptFile(incoming, `${targetPath}.enc`);
    const sha256 = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(incoming);
      stream.on('error', reject); stream.on('data', chunk => hash.update(chunk)); stream.on('end', () => resolve(hash.digest('hex')));
    });
    const urlPath = relative.split(path.sep).join('/');
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || `${req.hostname}:${PORT}`).split(',')[0].trim();
    const forwardedProtocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const publicOrigin = `${forwardedProtocol}://${forwardedHost}`;
    res.json({ success: true, filename, urlPath, url: `${publicOrigin}/files/${encodeURI(urlPath)}`, sha256 });
  } catch (error) { next(error); }
  finally { if (incoming) await fsp.unlink(incoming).catch(() => {}); }
});

app.post('/delete', requireAuth, async (req, res, next) => {
  try {
    const relative = safeRelativePath(req.body?.filePath);
    if (!relative) return res.status(400).json({ success: false, error: 'Invalid storage path' });
    const target = path.resolve(UPLOADS_DIR, `${relative}.enc`);
    if (!target.startsWith(`${UPLOADS_DIR}${path.sep}`)) return res.status(400).json({ success: false, error: 'Access denied' });
    try { await fsp.unlink(target); return res.json({ success: true }); }
    catch (error) { if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' }); throw error; }
  } catch (error) { next(error); }
});

app.get(/^\/(?:files\/)?(.+)$/, requireAuth, async (req, res, next) => {
  try {
    const decoded = decodeURIComponent(req.params[0] || '');
    const relative = safeRelativePath(decoded);
    if (!relative) return res.status(404).end();
    const stored = await readProtectedFile(relative);
    if (!stored) return res.status(404).end();
    const ext = path.extname(relative).toLowerCase();
    res.set({
      'Content-Type': ({ '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.pdf':'application/pdf', '.svg':'image/svg+xml' })[ext] || 'application/octet-stream',
      'Content-Length': String(stored.data.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(relative))}`
    });
    if (req.method === 'HEAD') return res.status(200).end();
    res.status(200).end(stored.data);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  res.status(status).json({ success: false, error: status === 413 ? 'File exceeds the configured upload limit' : 'Storage operation failed' });
});

if (process.argv.includes('--encrypt-existing')) {
  encryptExistingFiles().catch(() => { console.error('[Storage Server] Legacy-media migration failed.'); process.exitCode = 1; });
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Storage Server] Authenticated encrypted storage listening on port ${PORT}`);
    console.log(`[Storage Server] Protected files root: ${UPLOADS_DIR}`);
  });
}
