# ============================================
# Edge AI Industrial - Makefile
# Comandos úteis para desenvolvimento
# ============================================

.PHONY: help up down backend frontend firmware logs clean db-migrate bancada sim-build sim-build-fleet

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

# Chamada unica a um script: um laco de shell aqui quebraria no PowerShell,
# onde make nao encontra sh e cai no cmd.exe.
PYTHON ?= python

db-migrate: ## Aplica as migracoes num banco JA EXISTENTE (o initdb so roda em volume novo)
	$(PYTHON) database/apply_migrations.py

# === Simulacao / bancada ===

bancada: ## Sobe a bancada interativa e o painel monitor em http://127.0.0.1:8090
	@echo "Bancada interativa: http://127.0.0.1:8090/bancada-interativa.html"
	@echo "Painel monitor:     http://127.0.0.1:8090/live-panel.html"
	@echo "(Ctrl+C para parar)"
	@cd wokwi/shelf && $(PYTHON) -m http.server 8090 --bind 127.0.0.1

sim-build: ## Compila o firmware da bancada (para o Wokwi no VS Code)
	@cd wokwi/shelf && pio run

sim-build-fleet: ## Compila as 4 esteiras (esp32, esp32-2, esp32-3, esp32-4)
	@cd wokwi/shelf && pio run -e esp32 -e esp32-2 -e esp32-3 -e esp32-4

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
