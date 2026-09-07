-- Migration: 20260908000002_admin_add_player_rpc.sql

CREATE OR REPLACE FUNCTION public.admin_add_player_to_team(
    p_player_id UUID,
    p_team_id UUID,
    p_league_id UUID,
    p_season_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_membership RECORD;
    v_league_team RECORD;
BEGIN
    -- 1. Yetki Kontrolü
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Requires ADMIN or SUPER_ADMIN role';
    END IF;

    -- 2. League-Team ilişkisini kontrol et
    SELECT team_id INTO v_league_team
    FROM public.league_teams
    WHERE team_id = p_team_id
      AND league_id = p_league_id
      AND season_id = p_season_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Geçerli bir aktif lig-takım (league_teams) ilişkisi bulunamadı.';
    END IF;

    -- 3. Oyuncunun mevcut aktif üyeliğini kitle (Row Lock)
    SELECT id, team_id INTO v_existing_membership
    FROM public.team_memberships
    WHERE player_id = p_player_id
      AND left_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        -- Eğer zaten aynı takımdaysa
        IF v_existing_membership.team_id = p_team_id THEN
            RAISE EXCEPTION 'Bu oyuncu zaten bu takıma ekli durumda.';
        END IF;

        -- Farklı bir takımdaysa eski üyeliği kapat
        UPDATE public.team_memberships
        SET left_at = CURRENT_TIMESTAMP
        WHERE id = v_existing_membership.id;
    END IF;

    -- 4. Yeni üyeliği oluştur
    INSERT INTO public.team_memberships (
        player_id,
        team_id,
        league_id,
        season_id,
        joined_at
    ) VALUES (
        p_player_id,
        p_team_id,
        p_league_id,
        p_season_id,
        CURRENT_TIMESTAMP
    );

END;
$$;

-- Anonim erişimi engelle
REVOKE ALL ON FUNCTION public.admin_add_player_to_team(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_player_to_team(UUID, UUID, UUID, UUID) TO authenticated;
