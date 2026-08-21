#!/usr/bin/env python3
"""Resume os resultados JUnit do Gradle numa linha legivel.

Existe porque "BUILD SUCCESSFUL" nao distingue passou de pulou. O
StoreIsolationIntegrationTest roda em Testcontainers e se auto-desabilita com
@EnabledIf("dockerAvailable"): sem este resumo nao da para saber, olhando o log
do CI, se a cobertura contra banco real aconteceu de fato ou evaporou.

Uso:
    python3 scripts/test_summary.py [diretorio-de-resultados]

Sai com codigo 1 se houver falha ou erro, para poder ser usado como gate.
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET


def main() -> int:
    raiz = sys.argv[1] if len(sys.argv) > 1 else "build/test-results/test"
    arquivos = sorted(glob.glob(os.path.join(raiz, "*.xml")))

    if not arquivos:
        print(f"Nenhum resultado de teste em {raiz}")
        return 1

    total = falhas = erros = pulados = 0
    notaveis = []

    for caminho in arquivos:
        raiz_xml = ET.parse(caminho).getroot()
        t = int(raiz_xml.get("tests", 0))
        f = int(raiz_xml.get("failures", 0))
        e = int(raiz_xml.get("errors", 0))
        s = int(raiz_xml.get("skipped", 0))
        total += t
        falhas += f
        erros += e
        pulados += s
        if f or e or s:
            classe = (raiz_xml.get("name") or "?").split(".")[-1]
            notaveis.append((classe, t, f, e, s))

    print(f"## Testes: {total} | falhas {falhas} | erros {erros} | pulados {pulados}")

    if notaveis:
        print()
        print("| classe | testes | falhas | erros | pulados |")
        print("|---|---|---|---|---|")
        for classe, t, f, e, s in notaveis:
            print(f"| {classe} | {t} | {f} | {e} | {s} |")
        print()
        print("Classe pulada por inteiro geralmente significa dependencia ausente "
              "no runner (Docker, para os testes de Testcontainers).")

    return 1 if (falhas or erros) else 0


if __name__ == "__main__":
    sys.exit(main())
