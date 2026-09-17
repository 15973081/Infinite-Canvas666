-- Upload credentials may remain valid after publication; cleanup is deferred.
ALTER TABLE canvas_cloud.media_uploads
 ADD COLUMN cleanup_state text NOT NULL DEFAULT 'pending'
   CHECK (cleanup_state IN ('pending','running','failed','complete')),
 ADD COLUMN cleanup_token uuid,
 ADD COLUMN cleanup_lease_until timestamptz,
 ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN cleanup_attempted_at timestamptz,
 ADD COLUMN cleanup_error jsonb,
 ADD COLUMN cleanup_report jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN cleanup_bytes bigint NOT NULL DEFAULT 0;
-- Old TOS cleanup only checked HEAD, which cannot exclude hidden versions.
-- Re-audit only DB-owned staging keys, under the normal expiration safeguards.
UPDATE canvas_cloud.media_uploads SET cleaned_at=NULL WHERE backend='tos';
UPDATE canvas_cloud.media_uploads SET cleanup_state='complete' WHERE cleaned_at IS NOT NULL;
