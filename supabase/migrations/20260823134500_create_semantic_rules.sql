-- Criação da tabela para armazenar as regras semânticas geradas pela IA
CREATE TABLE IF NOT EXISTS public.semantic_rules (
    week_id text PRIMARY KEY,
    rule_yaml text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.semantic_rules ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- Apenas usuários autenticados (qualquer membro logado) podem LER as regras
CREATE POLICY "Membros podem ler regras semanticas" 
    ON public.semantic_rules
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Apenas Editores e Admins podem INSERIR ou ATUALIZAR as regras
CREATE POLICY "Editores podem criar regras" 
    ON public.semantic_rules
    FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated' AND (public.is_editor() = true OR public.is_admin() = true));

CREATE POLICY "Editores podem atualizar regras" 
    ON public.semantic_rules
    FOR UPDATE 
    USING (auth.role() = 'authenticated' AND (public.is_editor() = true OR public.is_admin() = true));

-- Trigger para updated_at
CREATE TRIGGER handle_updated_at_semantic_rules
    BEFORE UPDATE ON public.semantic_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.moddatetime (updated_at);
