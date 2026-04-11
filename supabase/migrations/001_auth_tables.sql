-- ============================================================
-- Auth Tables for RVM Designações
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Profiles (vincula auth.users ao app)
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    role text NOT NULL DEFAULT 'publicador' CHECK (role IN ('admin', 'publicador')),
    phone text,
    whatsapp_verified boolean DEFAULT false,
    publisher_id text,  -- FK opcional para publishers.id (vincula ao publicador existente)
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index para busca por email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. Auth Requests (2FA WhatsApp)
CREATE TABLE IF NOT EXISTS auth_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    phone text NOT NULL,
    code text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE auth_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own requests" ON auth_requests FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own requests" ON auth_requests FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admin can manage all requests" ON auth_requests FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Auth Logs (histórico de logins/logouts)
CREATE TABLE IF NOT EXISTS auth_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    email text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('login', 'logout', '2fa_request', '2fa_verified', '2fa_failed')),
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

ALTER TABLE auth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view all logs" ON auth_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can view own logs" ON auth_logs FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Authenticated can insert logs" ON auth_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Index para consultas do admin
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_profile ON auth_logs(profile_id);

-- 4. Transaction Logs (histórico de transações)
CREATE TABLE IF NOT EXISTS transaction_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    email text,
    action text NOT NULL,
    entity_type text,      -- 'publisher', 'workbook_part', 'week', etc.
    entity_id text,
    description text,
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE transaction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view all transactions" ON transaction_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated can insert transactions" ON transaction_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_transaction_logs_created ON transaction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_profile ON transaction_logs(profile_id);

-- 5. Trigger: auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, role, whatsapp_verified)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        CASE 
            WHEN LOWER(COALESCE(NEW.email, '')) = 'zico.josias@gmail.com' THEN 'admin'
            ELSE 'publicador'
        END,
        CASE 
            WHEN LOWER(COALESCE(NEW.email, '')) = 'zico.josias@gmail.com' THEN true
            ELSE false
        END
    );
    
    -- Se for o admin seed, já configura o WhatsApp
    IF LOWER(COALESCE(NEW.email, '')) = 'zico.josias@gmail.com' THEN
        UPDATE profiles SET phone = '27981470002' WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
