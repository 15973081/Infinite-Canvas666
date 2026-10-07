-- Independent, workspace-scoped online works. Existing media is never copied.
CREATE TABLE canvas_cloud.online_works (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES canvas_cloud.workspaces(id),
    history_id text NOT NULL,
    image_index integer NOT NULL CHECK (image_index >= 0),
    asset_id text,
    task_id text,
    owner_id text REFERENCES canvas_cloud.members(id),
    name text NOT NULL,
    folder text NOT NULL DEFAULT '',
    tags jsonb NOT NULL DEFAULT '[]',
    snapshot jsonb NOT NULL,
    state text NOT NULL DEFAULT 'inbox' CHECK (state IN ('inbox','saved','trash','purging','purged')),
    previous_state text NOT NULL DEFAULT 'inbox' CHECK (previous_state IN ('inbox','saved')),
    revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    trashed_at timestamptz,
    purged_at timestamptz,
    UNIQUE(workspace_id,id),
    UNIQUE(workspace_id,history_id,image_index),
    FOREIGN KEY(workspace_id,asset_id) REFERENCES canvas_cloud.assets(workspace_id,id),
    FOREIGN KEY(task_id) REFERENCES canvas_cloud.tasks(id)
);
CREATE INDEX online_works_page ON canvas_cloud.online_works(workspace_id,state,created_at DESC,id DESC);
CREATE INDEX online_works_owner ON canvas_cloud.online_works(workspace_id,owner_id,state,created_at DESC,id DESC);
CREATE INDEX online_works_asset ON canvas_cloud.online_works(workspace_id,asset_id);
-- Unknown historical authors stay unknown. Canvas/orphan canvas tasks are excluded.
INSERT INTO canvas_cloud.online_works(id,workspace_id,history_id,image_index,asset_id,task_id,owner_id,name,snapshot,created_at)
SELECT 'work_' || md5(d.workspace_id || ':' || d.id || ':' || (im.ordinality-1)::text),
       d.workspace_id,d.id,(im.ordinality-1)::integer,a.id,t.id,t.requested_by,
       left(coalesce(nullif(d.value->>'prompt',''),'在线生成作品'),100),
       jsonb_build_object('images',jsonb_build_array(CASE WHEN jsonb_typeof(im.value)='string' THEN im.value ELSE im.value->'url' END),
         'prompt',coalesce(d.value->>'prompt',''),'timestamp',d.value->'timestamp','type','online',
         'model',d.value->'model','provider_name',d.value->'provider_name','provider_id',d.value->'provider_id',
         'params',coalesce(d.value->'params','{}'::jsonb)),
       CASE WHEN jsonb_typeof(d.value->'timestamp')='number' AND (d.value->>'timestamp')::numeric BETWEEN 0 AND 32503680000
         THEN to_timestamp((d.value->>'timestamp')::double precision) ELSE d.created_at END
FROM (
  SELECT workspace_id,id,value,created_at,kind FROM canvas_cloud.workspace_documents WHERE kind='history'
  UNION ALL
  -- Recover manageable outputs even when an old delete removed only history.
  SELECT t.workspace_id,'task:' || t.id,t.result,t.created_at,'history' FROM canvas_cloud.tasks t
  WHERE t.kind='online-image' AND t.status='succeeded' AND t.result->>'type'='online'
    AND NOT EXISTS (SELECT 1 FROM canvas_cloud.workspace_documents d WHERE d.workspace_id=t.workspace_id AND d.kind='history' AND d.id='task:' || t.id)
) d
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.value->'images')='array' THEN d.value->'images' ELSE '[]'::jsonb END) WITH ORDINALITY im(value,ordinality)
LEFT JOIN canvas_cloud.tasks t ON t.workspace_id=d.workspace_id AND d.id='task:' || t.id
LEFT JOIN canvas_cloud.assets a ON a.workspace_id=d.workspace_id AND a.id=coalesce(
  substring(CASE WHEN jsonb_typeof(im.value)='string' THEN im.value #>> '{}' ELSE im.value->>'url' END FROM '/api/media/(ast_[a-f0-9]{32})'),
  (SELECT al.asset_id FROM canvas_cloud.asset_aliases al WHERE al.workspace_id=d.workspace_id
    AND al.source_namespace='local' AND al.legacy_ref=CASE WHEN jsonb_typeof(im.value)='string' THEN im.value #>> '{}' ELSE im.value->>'url' END LIMIT 1))
WHERE d.kind='history' AND d.value->>'type'='online'
  AND (t.id IS NULL OR (t.canvas_id IS NULL AND coalesce(t.request->>'canvas_id','')='' AND coalesce(t.legacy_metadata->>'canvas_id','')=''))
  AND coalesce(CASE WHEN jsonb_typeof(im.value)='string' THEN im.value #>> '{}' ELSE im.value->>'url' END,'')<>''
  AND (a.id IS NULL OR a.status='ready')
ON CONFLICT DO NOTHING;
