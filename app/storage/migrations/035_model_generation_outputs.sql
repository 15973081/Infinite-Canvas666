ALTER TABLE canvas_cloud.generation_outputs DROP CONSTRAINT generation_outputs_media_kind_check;
ALTER TABLE canvas_cloud.generation_outputs ADD CONSTRAINT generation_outputs_media_kind_check CHECK(media_kind IN ('image','video','audio','model'));
