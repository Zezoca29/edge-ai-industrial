# Database - PostgreSQL + TimescaleDB

Módulo com migrations e seeds do banco de dados.

## Responsabilidades

- Armazenamento de dados temporais (TimescaleDB)
- Histórico de eventos dos sensores
- Dados de usuários e configurações
- Dados de dispositivos registrados

## Tecnologias

- PostgreSQL 16
- TimescaleDB (extensão para time-series)

## Migrations

Versionamento sequencial, aplicado em ordem alfabetica:

```
V001__initial_schema.sql        V006__backfill_pick_event_store.sql
V002__seed_admin_user.sql       V007__seed_real_store.sql
V003__pick_events.sql           V008__alerts_and_push.sql
V004__retail_domain.sql         V009__product_default_min_qty.sql
V005__seed_demo_store.sql
```

## Executar migrations

**Nao ha Flyway nem Liquibase neste projeto.** O backend nao aplica migracao
nenhuma ao subir — ele roda com `spring.jpa.hibernate.ddl-auto: validate` e
apenas *confere* se o schema bate com as entidades.

As migrations sao aplicadas de uma unica forma automatica: o `docker-compose`
monta `./database/migrations` em `/docker-entrypoint-initdb.d` do Postgres, e a
imagem executa esses arquivos **somente quando o volume de dados esta vazio**.

### A armadilha

Se voce ja tem o volume `postgres_data` criado, uma migration nova **nunca sera
aplicada sozinha**. O sintoma nao e um aviso: o backend se recusa a subir, com

```
SchemaManagementException: Schema-validation: missing column [...] in table [...]
```

### Aplicar num banco que ja existe

```bash
make db-migrate
```

Reaplica todos os arquivos `V*.sql` no container `edgeai-postgres`. E seguro
repetir: todas as migrations sao idempotentes (`IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`), verificado reaplicando a serie tres vezes sem
duplicar dados.

### Comecar do zero

```bash
make clean   # derruba containers E volumes
make up      # o initdb roda a serie inteira num volume novo
```
