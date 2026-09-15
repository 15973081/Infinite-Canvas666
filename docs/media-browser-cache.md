# Private media browser cache

TOS uploads, including multipart staging uploads, set private, max-age=60, must-revalidate. Browser signed GETs override response-cache-control, so existing objects also benefit without rewriting metadata or versions. Preview-role signed GETs use 300 seconds of freshness and default to a 900-second signature (MEDIA_PREVIEW_URL_TTL). Original images, video and audio retain 60 seconds of freshness and the existing browser signature TTL. Short signing TTLs cap freshness at half the TTL. Upload metadata remains the conservative 60-second default; signed responses override it for previews. Provider URLs use no-store.

Application redirects remain private/no-store and still require member and workspace authorization. Each process reuses signed URLs in a bounded 2048-entry LRU keyed by workspace/member, bucket, object key, version and TTL. URLs renew before remaining lifetime approaches cache freshness. Authorization decisions are not cached.

Fresh bytes can remain in a browser after permission revocation until freshness expires. Downloaded bytes cannot be revoked. TOS URLs remain bearer credentials until expiration. No cross-process URL consistency, CDN caching or cross-session offline cache is promised. Filesystem simulation keeps no-store.

Restart workbench and worker processes when deploying this Python change. Verify real TOS GET response headers and transferred bytes before claiming savings. Mocked SDK tests cover response overrides, upload metadata, scope/version isolation and URL renewal, not live TOS behavior.
