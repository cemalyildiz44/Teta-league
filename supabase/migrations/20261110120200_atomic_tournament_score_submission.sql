-- 20261110120200_atomic_tournament_score_submission.sql
-- Team representatives submitted Night Cup scores with direct table writes, but RLS only lets admins
-- UPDATE tournament_matches and DELETE submissions/goals. Those writes matched 0 rows without an error,
-- so the match never left SCHEDULED/REJECTED, no score was stored on it and the same match could be
-- reported again and again. This RPC performs the whole representative flow atomically under a row lock.

CREATE OR REPLACE FUNCTION public.submit_tournament_match_score(
    p_tournament_id UUID,
    p_match_id UUID,
    p_home_score INTEGER,
    p_away_score INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile RECORD;
    v_match RECORD;
    v_tournament_status TEXT;
    v_team_application_id UUID;
    v_submission_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Skor bildirimi yapabilmek için giriş yapmalısınız.';
    END IF;

    SELECT status, is_active INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.status <> 'ACTIVE' OR v_profile.is_active = false THEN
        RAISE EXCEPTION 'Hesabınız askıya alındığı veya kısıtlandığı için işlem yapamazsınız.';
    END IF;

    IF p_home_score IS NULL OR p_away_score IS NULL
       OR p_home_score < 0 OR p_away_score < 0
       OR p_home_score > 50 OR p_away_score > 50 THEN
        RAISE EXCEPTION 'Skorlar 0 ile 50 arasında bir tam sayı olmalıdır.';
    END IF;

    -- Lock the match so both representatives cannot report it at the same time
    SELECT * INTO v_match
    FROM public.tournament_matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maç bulunamadı.';
    END IF;

    IF v_match.tournament_id IS DISTINCT FROM p_tournament_id THEN
        RAISE EXCEPTION 'Maç turnuva ile eşleşmiyor.';
    END IF;

    SELECT status INTO v_tournament_status
    FROM public.tournaments
    WHERE id = p_tournament_id;

    IF v_tournament_status IS NULL THEN
        RAISE EXCEPTION 'Turnuva bulunamadı.';
    END IF;

    IF v_tournament_status IN ('COMPLETED', 'ARCHIVED') THEN
        RAISE EXCEPTION 'Bu turnuva tamamlanmış veya arşivlenmiş olduğundan yeni skor bildirimi kabul edilmemektedir.';
    END IF;

    -- The caller must be the approved applicant of the home or away team (home wins if both)
    SELECT ta.id INTO v_team_application_id
    FROM public.tournament_applications ta
    WHERE ta.id IN (v_match.home_application_id, v_match.away_application_id)
      AND ta.applicant_id = v_user_id
      AND ta.status = 'APPROVED'
    ORDER BY (ta.id = v_match.home_application_id) DESC
    LIMIT 1;

    IF v_team_application_id IS NULL THEN
        RAISE EXCEPTION 'Yalnızca bu maçta mücadele eden takımların onaylı temsilcileri sonuç bildirebilir.';
    END IF;

    IF v_match.status = 'PENDING_REVIEW' THEN
        RAISE EXCEPTION 'Bu maç için zaten inceleme bekleyen bir skor bildirimi bulunmaktadır.';
    END IF;

    IF v_match.status IN ('APPROVED', 'COMPLETED') THEN
        RAISE EXCEPTION 'Bu maçın sonucu zaten onaylanmıştır. Yeni bildirim gönderilemez.';
    END IF;

    IF v_match.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Bu maç iptal edildiği için skor bildirimi yapılamaz.';
    END IF;

    -- Clean up an earlier rejected submission (and its goals) before re-submitting
    DELETE FROM public.tournament_match_goals
    WHERE match_id = p_match_id;

    DELETE FROM public.tournament_match_submissions
    WHERE match_id = p_match_id
      AND status = 'REJECTED';

    -- screenshot_url is NOT NULL in the schema; MANUAL_ENTRY marks a score without uploaded proof
    INSERT INTO public.tournament_match_submissions (
        tournament_id,
        match_id,
        submitted_by,
        submitted_team_application_id,
        home_score,
        away_score,
        screenshot_url,
        notes,
        status
    ) VALUES (
        p_tournament_id,
        p_match_id,
        v_user_id,
        v_team_application_id,
        p_home_score,
        p_away_score,
        'MANUAL_ENTRY',
        'Kaptan tarafından doğrulanmış skor bildirimi.',
        'PENDING_REVIEW'
    )
    RETURNING id INTO v_submission_id;

    UPDATE public.tournament_matches
    SET status = 'PENDING_REVIEW',
        home_score = p_home_score,
        away_score = p_away_score,
        screenshot_url = NULL,
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = p_match_id;

    RETURN jsonb_build_object('success', true, 'submission_id', v_submission_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tournament_match_score(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_tournament_match_score(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- Reconcile matches reported through the old flow: a pending submission exists but the match row was
-- never moved to PENDING_REVIEW. Use the latest pending submission's score so the public page matches
-- what the admin will review. Duplicate pending submissions are left for the admin to resolve.
UPDATE public.tournament_matches tm
SET status = 'PENDING_REVIEW',
    home_score = latest.home_score,
    away_score = latest.away_score,
    rejection_reason = NULL,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (match_id) match_id, home_score, away_score
    FROM public.tournament_match_submissions
    WHERE status = 'PENDING_REVIEW'
    ORDER BY match_id, created_at DESC
) latest
WHERE tm.id = latest.match_id
  AND tm.status IN ('SCHEDULED', 'PLAYING', 'REJECTED');
