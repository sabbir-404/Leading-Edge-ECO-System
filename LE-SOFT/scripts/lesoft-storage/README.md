# LE-SOFT TrueNAS media service

The service requires a signed, unexpired `nas_authenticated` bearer JWT for file
reads, uploads, and deletes. Uploaded media is stored as AES-256-GCM ciphertext.
Legacy files are encrypted and the plaintext is removed on the first authenticated
read. Health checks reveal only service health and the protection mode.

## TrueNAS deployment

1. Create `/root/lesoft-storage.env` with owner `root` and mode `0600`.
2. Set `NAS_JWT_SECRET_B64` to the base64 encoding of the PostgREST JWT signing
   secret from the database container environment. Set a different random 32-byte base64 value for
   `NAS_STORAGE_ENCRYPTION_KEY`.
3. Protect the environment file with owner-only permissions and keep it out of snapshots or
   shared folders that non-administrators can read.
4. Copy `nas-storage-server.js` to the storage app directory, then recreate the
   storage container using its existing compose project.
5. Confirm unauthenticated `GET /files/...`, `HEAD /files/...`, `POST /upload`,
   and `POST /delete` return 401. Confirm the authenticated application can read
   and upload, and verify stored objects have the `LEF1` encrypted-file header.

Keep a protected copy of the encryption key in the NAS recovery backup before
restarting the service. Existing DB URLs remain stable. If the key is lost, the
stored media cannot be decrypted.
