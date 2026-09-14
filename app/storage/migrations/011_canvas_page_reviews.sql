-- An operator review applies only to the observed report sequence.
ALTER TABLE canvas_cloud.canvas_page_reports
    ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN reviewed_sequence bigint,
    ADD COLUMN reviewed_by text REFERENCES canvas_cloud.members(id),
    ADD COLUMN reviewed_at timestamptz,
    ADD COLUMN review_outcome text,
    ADD COLUMN review_note text,
    ADD CONSTRAINT canvas_page_report_id UNIQUE(id),
    ADD CONSTRAINT canvas_page_report_review CHECK (
        (reviewed_sequence IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_outcome IS NULL AND review_note IS NULL)
        OR (reviewed_sequence IS NOT NULL AND reviewed_sequence>0 AND reviewed_sequence<=sequence
            AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
            AND review_outcome IS NOT NULL AND review_outcome IN ('member_confirmed_saved','draft_exported','member_discarded')
            AND review_note IS NOT NULL AND length(btrim(review_note)) BETWEEN 1 AND 1000));
