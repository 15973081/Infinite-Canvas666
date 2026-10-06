"""Canvas directory covers use existing node media, never generate thumbnails."""
import re

VIDEO = r'\.(mp4|webm|mov|m4v|ogv|ogg)([?#].*)?$'
IMAGE = r'\.(png|jpg|jpeg|webp|gif|avif|bmp|svg)([?#].*)?$'


def media_url(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return next((value[k] for k in ('url', 'src', 'path') if isinstance(value.get(k), str) and value[k]), '')
    return ''


def cover_candidates(nodes):
    for node in nodes or []:
        if not isinstance(node, dict) or not node.get('id'):
            continue
        values = [(-1, node)] if node.get('type') in ('image', 'video') else []
        values += list(enumerate(node.get('images') or []))
        for index, value in values:
            url = media_url(value).strip()
            if not re.match(r'^(https?://|/(?!/))', url) or len(url) > 4096:
                continue
            explicit = str((value.get('kind') or value.get('mediaKind') or value.get('type') or '') if isinstance(value, dict) else '').lower()
            kind = 'video' if 'video' in explicit or re.search(VIDEO, url, re.I) else 'image' if explicit == 'image' or re.search(IMAGE, url, re.I) else ''
            if kind:
                thumbnail = next((value[k] for k in ('thumbnail_url', 'preview_url', 'thumbnail', 'poster')
                                  if isinstance(value, dict) and isinstance(value.get(k), str)
                                  and re.match(r'^(https?://|/(?!/))', value[k]) and len(value[k])<=4096
                                  and re.search(IMAGE, value[k], re.I)), '')
                yield {'node_id': str(node['id']), 'index': index, 'kind': kind, 'url': url, 'thumbnail': thumbnail}


def resolve_cover(nodes, selection=None):
    first = video = None
    for candidate in cover_candidates(nodes):
        first = first or candidate
        if candidate['kind'] == 'video':
            video = video or candidate
            if not selection or not selection.get('node_id'):
                return candidate
        if selection and candidate['node_id'] == selection.get('node_id') and candidate['index'] == selection.get('index', -1):
            return candidate
    return video or first


def cover_sql(nodes, selection):
    """Trusted SQL expressions only. Return one compact cover, not graph payloads.

    Resolve at read time so old documents and asynchronous task results work
    without backfills, stale caches, new tables or extra directory requests.
    """
    return f"""(WITH candidates AS (
        SELECT n.value->>'id' AS node_id,n.ordinality AS node_order,v.idx,
            btrim(CASE WHEN jsonb_typeof(v.item)='string' THEN v.item#>>'{{}}'
                ELSE coalesce(nullif(v.item->>'url',''),nullif(v.item->>'src',''),v.item->>'path') END) AS url,
            lower(coalesce(nullif(v.item->>'kind',''),nullif(v.item->>'mediaKind',''),v.item->>'type','')) AS explicit,
            coalesce((SELECT p.url FROM (VALUES (v.item->>'thumbnail_url'),(v.item->>'preview_url'),
                (v.item->>'thumbnail'),(v.item->>'poster')) p(url)
                WHERE p.url ~ '^(https?://|/[^/])' AND length(p.url)<=4096 AND p.url ~* '{IMAGE}' LIMIT 1),'') AS thumbnail
        FROM jsonb_array_elements(coalesce({nodes},'[]'::jsonb)) WITH ORDINALITY AS n(value,ordinality)
        CROSS JOIN LATERAL (
            SELECT n.value AS item,-1::bigint AS idx WHERE n.value->>'type' IN ('image','video')
            UNION ALL SELECT i.value,i.ordinality-1 FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(n.value->'images')='array' THEN n.value->'images' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS i(value,ordinality)
        ) v
    ), media AS (
        SELECT *,CASE WHEN position('video' in explicit)>0 OR url ~* '{VIDEO}' THEN 'video'
            WHEN explicit='image' OR url ~* '{IMAGE}' THEN 'image' END AS kind FROM candidates
        WHERE node_id<>'' AND url ~ '^(https?://|/[^/])' AND length(url)<=4096
    ) SELECT jsonb_build_object('node_id',node_id,'index',idx,'kind',kind,'url',url,'thumbnail',thumbnail)
        FROM media WHERE kind IS NOT NULL
        ORDER BY CASE WHEN node_id={selection}->>'node_id' AND idx=coalesce(({selection}->>'index')::bigint,-1) THEN 0
            WHEN kind='video' THEN 1 ELSE 2 END,node_order,idx LIMIT 1)"""
