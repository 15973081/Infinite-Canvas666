# Private media browser cache

All TOS browser media (previews, original images, video and audio) use private, max-age=300, must-revalidate. Single and multipart uploads set this metadata; signed GET response overrides also cover existing objects. Browser signatures default to 900 seconds (MEDIA_BROWSER_URL_TTL for originals, MEDIA_PREVIEW_URL_TTL for previews). Explicit shorter TTLs cap freshness at half the signing TTL. Provider URLs remain no-store. Video/audio Range cache behavior needs separate live browser validation; five-minute freshness does not guarantee that every range or playback is cached.

Application redirects remain private/no-store and still require member and workspace authorization. Each process reuses signed URLs in a bounded 2048-entry LRU keyed by workspace/member, bucket, object key, version and TTL. URLs renew before remaining lifetime approaches cache freshness. Authorization decisions are not cached.

Fresh bytes can remain in a browser after permission revocation until freshness expires. Downloaded bytes cannot be revoked. TOS URLs remain bearer credentials until expiration. No cross-process URL consistency, CDN caching or cross-session offline cache is promised. Filesystem simulation keeps no-store.

Restart workbench and worker processes when deploying this Python change. Verify real TOS GET response headers and transferred bytes before claiming savings. Mocked SDK tests cover response overrides, upload metadata, scope/version isolation and URL renewal, not live TOS behavior.
