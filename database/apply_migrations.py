#!/usr/bin/env python3
"""Aplica as migracoes num banco que ja existe.

O docker-compose monta database/migrations em /docker-entrypoint-initdb.d, e a
imagem do Postgres executa esses arquivos SOMENTE quando o volume de dados esta
vazio. Num ambiente que ja rodou antes, uma migration nova nunca e aplicada
sozinha, e como o backend usa ddl-auto: validate o sintoma nao e um aviso e sim
recusa de subir.

Este script existe em vez de um laco de shell no Makefile porque `make` escolhe
o shell conforme o ambiente: no Git Bash usa sh, no PowerShell (onde sh nao
esta no PATH) cai no cmd.exe, que nao entende `for f in ...`. Uma chamada unica
a um script funciona nos dois.

Uso:
    python database/apply_migrations.py [--container NOME] [--db NOME] [--user NOME]
"""
import argparse
import glob
import os
import subprocess
import sys


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--container", default="edgeai-postgres")
    p.add_argument("--db", default="edgeai")
    p.add_argument("--user", default="edgeai")
    args = p.parse_args()

    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")
    arquivos = sorted(glob.glob(os.path.join(raiz, "V*.sql")))
    if not arquivos:
        print(f"Nenhuma migration encontrada em {raiz}")
        return 1

    verificar = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", args.container],
        capture_output=True, text=True)
    if verificar.returncode != 0 or verificar.stdout.strip() != "true":
        print(f"Container '{args.container}' nao esta rodando. Suba com: make up")
        return 1

    for caminho in arquivos:
        nome = os.path.basename(caminho)
        with open(caminho, "rb") as fh:
            sql = fh.read()
        r = subprocess.run(
            ["docker", "exec", "-i", args.container,
             "psql", "-U", args.user, "-d", args.db, "-v", "ON_ERROR_STOP=1", "-q"],
            input=sql, capture_output=True)
        if r.returncode != 0:
            print(f"  ERRO {nome}")
            sys.stderr.write(r.stderr.decode(errors="replace"))
            return 1
        # NOTICE de "already exists, skipping" e o caso normal ao reaplicar.
        print(f"  ok   {nome}")

    print("migracoes aplicadas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
