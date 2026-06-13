-- Migration: 20260613164400_onboarding_tokens.sql
-- Description: Creates the onboarding_tokens table and the RPC for consuming the token.

-- Create the onboarding_tokens table
CREATE TABLE IF NOT EXISTS public.onboarding_tokens (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id TEXT NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '14 days') NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Secure the table
ALTER TABLE public.onboarding_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read tokens (needed for the frontend to verify if a token is valid before forcing login)
-- Or better, we only allow access via RPC to keep it completely secure.
-- We will restrict direct table access and use Security Definer functions.
CREATE POLICY "Deny all direct access to onboarding_tokens"
    ON public.onboarding_tokens
    FOR ALL
    USING (false);

-- RPC to consume the token
CREATE OR REPLACE FUNCTION consume_onboarding_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token_record RECORD;
    v_uid UUID;
    v_profile_exists BOOLEAN;
BEGIN
    -- Get the authenticated user ID
    v_uid := auth.uid();
    
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch the token record
    SELECT * INTO v_token_record
    FROM public.onboarding_tokens
    WHERE token = p_token;

    -- Validate token existence
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido ou inexistente';
    END IF;

    -- Validate if used
    IF v_token_record.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'Este convite já foi utilizado';
    END IF;

    -- Validate expiration
    IF now() > v_token_record.expires_at THEN
        RAISE EXCEPTION 'Este convite expirou';
    END IF;

    -- Check if the profile exists for the authenticated user
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_uid) INTO v_profile_exists;

    -- Link the account
    IF v_profile_exists THEN
        -- Update existing profile
        UPDATE public.profiles
        SET 
            publisher_id = v_token_record.publisher_id,
            phone = v_token_record.phone,
            whatsapp_verified = true,
            updated_at = now()
        WHERE id = v_uid;
    ELSE
        -- Should not happen normally if they just signed up via Google (trigger creates profile), 
        -- but just in case, we insert it.
        INSERT INTO public.profiles (id, email, publisher_id, phone, whatsapp_verified)
        VALUES (
            v_uid, 
            (SELECT email FROM auth.users WHERE id = v_uid), 
            v_token_record.publisher_id, 
            v_token_record.phone, 
            true
        );
    END IF;

    -- Mark token as used
    UPDATE public.onboarding_tokens
    SET used_at = now()
    WHERE token = p_token;

    RETURN jsonb_build_object('success', true, 'publisher_id', v_token_record.publisher_id);
END;
$$;
