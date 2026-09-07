-- 000014_fix_social_trigger.sql

CREATE OR REPLACE FUNCTION public.enforce_social_update_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_moderator BOOLEAN;
    v_old_json JSONB;
    v_new_json JSONB;
BEGIN
    v_is_moderator := has_role('ADMIN') OR has_role('SUPER_ADMIN') OR has_role('MODERATOR');

    IF TG_OP = 'INSERT' THEN
        IF NEW.is_deleted <> false OR NEW.deleted_by IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
            IF NOT v_is_moderator THEN
                RAISE EXCEPTION 'Users cannot create pre-deleted content.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NOT v_is_moderator THEN
        v_old_json := to_jsonb(OLD);
        v_new_json := to_jsonb(NEW);

        -- Allow author to soft-delete their own content
        IF (v_old_json->>'is_deleted')::boolean = false AND (v_new_json->>'is_deleted')::boolean = true THEN
            -- Make sure they are setting themselves as deleted_by
            IF v_new_json->>'deleted_by' IS DISTINCT FROM (auth.uid())::text THEN
                RAISE EXCEPTION 'Users can only mark content as deleted by themselves.';
            END IF;
        ELSE
            -- If they are NOT deleting it right now, they cannot change moderation fields
            IF v_old_json->>'is_deleted' IS DISTINCT FROM v_new_json->>'is_deleted'
               OR v_old_json->>'deleted_by' IS DISTINCT FROM v_new_json->>'deleted_by'
               OR v_old_json->>'deleted_at' IS DISTINCT FROM v_new_json->>'deleted_at'
               OR v_old_json->>'delete_reason' IS DISTINCT FROM v_new_json->>'delete_reason'
               THEN
                RAISE EXCEPTION 'Only moderators/admins can change moderation fields.';
            END IF;
        END IF;

        IF TG_TABLE_NAME = 'comments' THEN
            IF v_old_json->>'post_id' IS DISTINCT FROM v_new_json->>'post_id'
               OR v_old_json->>'parent_comment_id' IS DISTINCT FROM v_new_json->>'parent_comment_id' THEN
                RAISE EXCEPTION 'Cannot change structural relations of comments.';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;
