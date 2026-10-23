-- MAKE portal attachments may include customer references and internal drawings.
-- Serve them through the authenticated WordPress media proxy rather than public URLs.
UPDATE storage.buckets
SET public = false
WHERE id = 'make-portal-files';
