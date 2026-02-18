import os
import json
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Configurar encoding para evitar erros no Windows
sys.stdout.reconfigure(encoding='utf-8')

# Carregar variáveis de ambiente (procurar no diretório atual ou pai)
# Se rodando de rvm-designacoes-unified/
if os.path.exists('.env'):
    load_dotenv('.env')
elif os.path.exists('../.env'):
    load_dotenv('../.env')

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERRO: SUPABASE_URL e SUPABASE_KEY sao necessarios no arquivo .env")
    # Tenta imprimir o que encontrou para debug (mas cuidado com secrets, imprime apenas se achou ou nao)
    print(f"URL encontrada: {'SIM' if SUPABASE_URL else 'NAO'}")
    print(f"KEY encontrada: {'SIM' if SUPABASE_KEY else 'NAO'}")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fix_sister_privileges():
    print("Buscando TODOS os publicadores (tabela usa coluna JSONB 'data')...")
    
    # Busca all publishers
    try:
        response = supabase.table("publishers").select("*").execute()
    except Exception as e:
        print(f"Erro ao buscar publicadores: {e}")
        return

    all_publishers = response.data
    print(f"Total de registros encontrados: {len(all_publishers)}")
    
    updates_count = 0
    errors_count = 0
    sisters_found = 0
    
    for record in all_publishers:
        # A estrutura real está dentro de 'data'
        pub_data = record.get('data')
        
        # Se 'data' for string, parsear. Se for dict, usar direto.
        if isinstance(pub_data, str):
            try:
                pub_data = json.loads(pub_data)
            except:
                print(f"[WARN] Erro ao parsear JSON para ID {record.get('id')}")
                continue
        elif not isinstance(pub_data, dict):
            # Se for None ou outro tipo
            continue
            
        # Verificar se é irmã
        if pub_data.get('gender') != 'sister':
            continue
            
        sisters_found += 1
        name = pub_data.get('name', 'N/A')
        needs_update = False
        
        # --- Normalizar e Verificar ---
        
        privileges = pub_data.get('privileges')
        # Load JSON fields if needed (mas dentro do JSONB 'data', eles já devem ser dicts)
        if not isinstance(privileges, dict):
             privileges = {
                "canGiveTalks": False,
                "canGiveStudentTalks": False,
                "canConductCBS": False,
                "canReadCBS": False,
                "canPray": False,
                "canPreside": False
            }
             pub_data['privileges'] = privileges
             needs_update = True
             
        privileges_by_section = pub_data.get('privilegesBySection') or pub_data.get('privileges_by_section')
        if not isinstance(privileges_by_section, dict):
            privileges_by_section = {
                "canParticipateInTreasures": False,
                "canParticipateInMinistry": True,
                "canParticipateInLife": False
            }
            # Padronizar para privilegesBySection (camelCase como no frontend)
            pub_data['privilegesBySection'] = privileges_by_section
            # Remover snake_case se existir para evitar duplicação
            if 'privileges_by_section' in pub_data:
                del pub_data['privileges_by_section']
            needs_update = True
        else:
             # Garantir que estamos usando a chave correta no objeto final
             pub_data['privilegesBySection'] = privileges_by_section
             if 'privileges_by_section' in pub_data:
                del pub_data['privileges_by_section']
                needs_update = True # Mudou a estrutura

        # --- Verificação de Regras ---
        
        # 1. Seções
        if privileges_by_section.get('canParticipateInTreasures') != False:
            privileges_by_section['canParticipateInTreasures'] = False
            needs_update = True
            
        if privileges_by_section.get('canParticipateInLife') != False:
            privileges_by_section['canParticipateInLife'] = False
            needs_update = True
            
        if privileges_by_section.get('canParticipateInMinistry') != True:
            privileges_by_section['canParticipateInMinistry'] = True
            needs_update = True

        # 2. Privilégios de Irmãos (OFF)
        brother_privileges = ['canGiveTalks', 'canPray', 'canPreside', 'canConductCBS', 'canReadCBS']
        for priv in brother_privileges:
            if privileges.get(priv) != False:
                privileges[priv] = False
                needs_update = True

        # 3. Discurso de Estudante (OFF)
        if privileges.get('canGiveStudentTalks') != False:
            privileges['canGiveStudentTalks'] = False
            needs_update = True

        if needs_update:
            try:
                # Atualizar a coluna 'data' com o objeto modificado
                supabase.table("publishers").update({"data": pub_data}).eq("id", record['id']).execute()
                print(f"[OK] Atualizado: {name}")
                updates_count += 1
            except Exception as e:
                print(f"[ERRO] Falha ao atualizar {name}: {e}")
                errors_count += 1
        else:
            # print(f"[SKIP] {name} ja esta correto.")
            pass

    print("\n" + "="*30)
    print("Resumo da Operacao (JSONB)")
    print("="*30)
    print(f"Total de irmas encontradas: {sisters_found}")
    print(f"Atualizadas: {updates_count}")
    print(f"Erros: {errors_count}")
    print("="*30)

    print("\n" + "="*30)
    print("Concluido.")
    print("="*30)

if __name__ == "__main__":
    fix_sister_privileges()
