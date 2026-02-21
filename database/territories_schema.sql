-- Schema para Módulo de Territórios (RVM Designações)

-- 1. Bairros (Neighborhoods)
CREATE TABLE public.neighborhoods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Territórios (Territories)
CREATE TABLE public.territories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    number TEXT NOT NULL,
    neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
    description TEXT,
    map_url TEXT,
    last_worked_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Designações de Territórios (Territory Assignments)
CREATE TABLE public.territory_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    territory_id UUID REFERENCES public.territories(id) ON DELETE CASCADE,
    publisher_id TEXT REFERENCES public.publishers(id) ON DELETE CASCADE,
    assigned_at DATE DEFAULT CURRENT_DATE NOT NULL,
    returned_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Quadras (Blocks)
CREATE TABLE public.blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    territory_id UUID REFERENCES public.territories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Casas (Houses)
CREATE TABLE public.houses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    block_id UUID REFERENCES public.blocks(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    complement TEXT,
    status TEXT DEFAULT 'Normal', -- Enum de frontend: Normal, DoNotCall, ForeignLanguage
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Histórico de Visitas (Visits)
CREATE TABLE public.visits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
    publisher_id TEXT REFERENCES public.publishers(id) ON DELETE SET NULL,
    date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    result TEXT NOT NULL, -- Enum de frontend: NotAtHome, Spoke, Revisit, Study
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- Políticas Universais para Usuários Autenticados (Acesso total para simplificar)
CREATE POLICY "Allow authenticated read/write neighborhoods" ON public.neighborhoods FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated read/write territories" ON public.territories FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated read/write territory_assignments" ON public.territory_assignments FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated read/write blocks" ON public.blocks FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated read/write houses" ON public.houses FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated read/write visits" ON public.visits FOR ALL TO authenticated USING (true);
