#!/usr/bin/env python3
"""Gera rm_seed.sql a partir do ODS + xlsx para inserção via MCP Supabase."""
from __future__ import annotations
import json, unicodedata, sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    sys.exit("pip install pandas odfpy")

ODS = Path(r"C:\Antigravity - RVM Designações\docs\RM Desacoplado\9fe36d.Relatório Mensal v03 (New).ods")
OUT = Path(r"C:\Antigravity - RVM Designações\rvm-designacoes-unified\scripts\_rm_seed.sql")

# ── helpers ──────────────────────────────────────────────────────────────────
def norm_key(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return "".join(c for c in s.lower() if c.isalnum())

def col(row: dict, *candidates: str) -> str | None:
    idx = {norm_key(k): str(v).strip() for k, v in row.items()}
    for c in candidates:
        v = idx.get(norm_key(c))
        if v and v not in ("nan", "None", ""):
            return v
    return None

def esc(s: str | None) -> str:
    return ("'" + s.replace("'", "''") + "'") if s else "NULL"

def to_date(v: str | None) -> str:
    if not v: return "NULL"
    # ISO 8601: 1998-12-21T12:00:00.000Z → pega só a parte da data
    raw = v.strip().split("T")[0].split(" ")[0]
    for sep in ("/", "-"):
        if sep in raw:
            parts = raw.split(sep)
            if len(parts) == 3:
                a, b, c_ = parts
                try:
                    if len(a) == 4: return f"'{int(a):04d}-{int(b):02d}-{int(c_):02d}'"
                    d, m, y = int(a), int(b), int(c_)
                    if m > 12: d, m = m, d
                    return f"'{y:04d}-{m:02d}-{d:02d}'"
                except ValueError: pass
    return "NULL"

def gender(v: str | None) -> str:
    if not v: return "NULL"
    u = v.strip().upper()
    return "'M'" if u.startswith("M") else ("'F'" if u.startswith("F") else "NULL")

def status_norm(v: str | None) -> str:
    if not v: return "NULL"
    u = norm_key(v)
    for st in ("ATIVO","IRREGULAR","QUASEINATIVO","INATIVO"):
        if norm_key(st) in u:
            return f"'{'QUASE-INATIVO' if st=='QUASEINATIVO' else st}'"
    return "NULL"

# ── leitura ODS ───────────────────────────────────────────────────────────────
xl     = pd.ExcelFile(ODS, engine="odf")
congs  = xl.parse("Congregação",   dtype=str).fillna("").to_dict("records")
grupos = xl.parse("Grupos",        dtype=str).fillna("").to_dict("records")
pubs   = xl.parse("PublicadorReal",dtype=str).fillna("").to_dict("records")

print(f"Lidos: {len(congs)} congs | {len(grupos)} grupos | {len(pubs)} pubs")

lines: list[str] = ["-- rm_seed.sql — gerado por _gen_rm_sql.py", "BEGIN;", ""]

# ── 1) Congregações ───────────────────────────────────────────────────────────
lines.append("-- 1) Congregações")
for r in congs:
    gid  = col(r, "id_Congregação","id_Congregacao")
    name = col(r, "Nome")
    num  = col(r, "Número","Numero")
    if not name: continue
    lines.append(
        f"INSERT INTO rm.congregations (name, number, glide_id, is_active) "
        f"VALUES ({esc(name)},{esc(num)},{esc(gid)},true) "
        f"ON CONFLICT (glide_id) DO UPDATE SET name=EXCLUDED.name,number=EXCLUDED.number;"
    )

lines.append("")

# ── 2) Grupos (sem líderes ainda) ─────────────────────────────────────────────
lines.append("-- 2) Grupos")
for r in grupos:
    gid      = col(r,"id_Grupo")
    cong_gid = col(r,"fk_id_Congregação","fk_id_Congregacao")
    num      = col(r,"Número","Numero") or "0"
    name     = col(r,"Nome do Grupo","Nome")
    gl       = col(r,"id_SuperDeGrupo")
    ga       = col(r,"id_SuperAJDeGrupo")
    try: gnum = int(num.strip())
    except ValueError: gnum = 0
    if not cong_gid: continue
    lines.append(
        f"INSERT INTO rm.field_groups "
        f"(congregation_id, group_number, name, glide_id, glide_leader_id, glide_assistant_id, is_active) "
        f"SELECT c.id,{gnum},{esc(name)},{esc(gid)},{esc(gl)},{esc(ga)},true "
        f"FROM rm.congregations c WHERE c.glide_id={esc(cong_gid)} "
        f"ON CONFLICT (congregation_id,group_number) DO UPDATE SET "
        f"name=EXCLUDED.name,glide_id=EXCLUDED.glide_id,"
        f"glide_leader_id=EXCLUDED.glide_leader_id,glide_assistant_id=EXCLUDED.glide_assistant_id;"
    )

lines.append("")

# ── 3) Publicadores ───────────────────────────────────────────────────────────
lines.append("-- 3) Publicadores")
for r in pubs:
    gid      = col(r,"id_Publicador")
    name     = col(r,"Nome Completo","NomeCompleto","Nome")
    cong_gid = col(r,"fk_id_Congregação","fk_id_Congregacao")
    grp_gid  = col(r,"id_Grupo")
    if not name: continue
    funcao   = col(r,"Função","Funcao","Privilégio","Privilegio")
    sex      = gender(col(r,"Sexo"))
    nasc     = to_date(col(r,"Data de Nascimento","DataNascimento"))
    status   = status_norm(col(r,"Status do Último Relatório","Status"))
    lines.append(
        f"INSERT INTO rm.publishers "
        f"(glide_id, congregation_id, current_group_id, name, funcao, gender, birth_date, field_service_status, is_active) "
        f"SELECT {esc(gid)},"
        f"(SELECT id FROM rm.congregations WHERE glide_id={esc(cong_gid)} LIMIT 1),"
        f"(SELECT id FROM rm.field_groups WHERE glide_id={esc(grp_gid)} LIMIT 1),"
        f"{esc(name)},{esc(funcao)},{sex},{nasc},{status},true "
        f"ON CONFLICT (glide_id) DO UPDATE SET name=EXCLUDED.name,funcao=EXCLUDED.funcao,"
        f"congregation_id=EXCLUDED.congregation_id,current_group_id=EXCLUDED.current_group_id;"
    )

lines.append("")

# ── 4) Resolver líderes ───────────────────────────────────────────────────────
lines.append("-- 4) Resolver líderes de grupo")
lines.append(
    "UPDATE rm.field_groups fg "
    "SET leader_id=(SELECT id FROM rm.publishers WHERE glide_id=fg.glide_leader_id LIMIT 1),"
    "assistant_leader_id=(SELECT id FROM rm.publishers WHERE glide_id=fg.glide_assistant_id LIMIT 1) "
    "WHERE fg.glide_leader_id IS NOT NULL OR fg.glide_assistant_id IS NOT NULL;"
)

lines.append("")

# ── 5) sync_map ───────────────────────────────────────────────────────────────
lines.append("-- 5) sync_map base")
lines.append(
    "INSERT INTO rm.publisher_sync_map (rm_publisher_id, match_status) "
    "SELECT id,'unmatched' FROM rm.publishers "
    "ON CONFLICT (rm_publisher_id) DO NOTHING;"
)

lines.append("")
lines.append("COMMIT;")

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"SQL gravado em: {OUT}")
print(f"Linhas: {len(lines)}")
