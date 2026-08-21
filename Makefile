# ============================================
# Edge AI Industrial - Makefile
# Comandos úteis para desenvolvimento
# ============================================

.PHONY: help up down backend frontend firmware logs clean db-migrate

help: ## Mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Infraestrutura ===

up: ## Sobe todos os containers Docker
	docker-compose up -d

down: ## Para todos os containers Docker
	docker-compose down

logs: ## Mostra logs dos containers
	docker-compose logs -f

clean: ## Remove containers e volumes
	docker-compose down -v

db-migrate: ## Aplica as migracoes num banco JA EXISTENTE (o initdb so roda em volume novo)
	@for f in database/migrations/V*.sql; do echo "  aplicando $$(basename $$f)"; docker exec -i edgeai-postgres psql -U edgeai -d edgeai -v ON_ERROR_STOP=1 -q < $$f || exit 1; done
	@echo "migracoes aplicadas"

# === Backend ===

backend-run: ## Roda o backend Spring Boot
	cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'

backend-test: ## Executa testes do backend
	cd backend && ./gradlew test

backend-build: ## Build do backend
	cd backend && ./gradlew build

# === Frontend ===

frontend-dev: ## Roda o frontend em modo dev
	cd frontend && npm run dev

frontend-build: ## Build do frontend
	cd frontend && npm run build

frontend-lint: ## Lint do frontend
	cd frontend && npm run lint

# === Firmware ===

firmware-build: ## Compila o firmware (ESP32)
	cd firmware && pio run -e esp32

firmware-upload: ## Upload do firmware para o dispositivo
	cd firmware && pio run -e esp32 --target upload

firmware-monitor: ## Monitor serial do dispositivo
	cd firmware && pio device monitor
