CREATE INDEX workspace_history_page ON workspace_documents (
    workspace_id,
    (CASE WHEN jsonb_typeof(value->'timestamp')='number' THEN (value->>'timestamp')::numeric ELSE 0 END) DESC,
    id DESC
) WHERE kind='history';
