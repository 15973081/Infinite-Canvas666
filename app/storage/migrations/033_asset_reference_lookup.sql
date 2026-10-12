-- A lossless candidate index avoids expanding every scalar in large historical
-- snapshots. Callers must validate matches with media.id_from_ref/contains_ref;
-- substrings and object keys are candidates, never proof of a reference.
CREATE FUNCTION canvas_cloud.asset_reference_candidates(document jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT coalesce(array_agg(DISTINCT matches[1]), ARRAY[]::text[])
    FROM regexp_matches(document::text, '(ast_[a-f0-9]{32})', 'g') AS matches;
$$;

CREATE INDEX canvases_reference_ids ON canvas_cloud.canvases USING gin
    (canvas_cloud.asset_reference_candidates(document));
CREATE INDEX documents_reference_ids ON canvas_cloud.workspace_documents USING gin
    (canvas_cloud.asset_reference_candidates(value));
CREATE INDEX tasks_reference_ids ON canvas_cloud.tasks USING gin
    ((canvas_cloud.asset_reference_candidates(request) || canvas_cloud.asset_reference_candidates(result)
      || canvas_cloud.asset_reference_candidates(input_asset_ids) || canvas_cloud.asset_reference_candidates(output_asset_ids)
      || canvas_cloud.asset_reference_candidates(legacy_metadata)));
CREATE INDEX works_reference_ids ON canvas_cloud.online_works USING gin
    ((ARRAY[asset_id] || canvas_cloud.asset_reference_candidates(snapshot)))
    WHERE state NOT IN ('purging','purged');
