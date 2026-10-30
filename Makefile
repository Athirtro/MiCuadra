# MiCuadra — comandos del monorepo. `make help` lista todo.
SHELL := /bin/bash
API := cd apps/api &&

.PHONY: help install dev api web db-migrate db-seed db-reset seed-clean lint typecheck test gen-types token check

help: ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

install: ## Instala dependencias de API (uv) y web (pnpm)
	$(API) uv sync
	pnpm install

dev: ## Levanta API (:8000) y web (:5173) juntos
	@trap 'kill 0' INT TERM EXIT; \
	 ($(API) uv run uvicorn app.main:app --reload --port 8000) & \
	 pnpm --filter @micuadra/web dev & \
	 wait

api: ## Solo el API
	$(API) uv run uvicorn app.main:app --reload --port 8000

web: ## Solo la web
	pnpm --filter @micuadra/web dev

db-migrate: ## Aplica migraciones pendientes de /supabase/migrations
	$(API) uv run python scripts/db.py migrar

db-seed: ## Carga datos [DEMO] (idempotente)
	$(API) uv run python scripts/db.py seed

db-reset: ## SOLO local: recrea la base, migra y carga el seed
	$(API) uv run python scripts/db.py reset
	$(API) uv run python scripts/db.py seed

seed-clean: ## Borra todos los negocios y usuarios [DEMO]
	$(API) uv run python scripts/db.py seed-clean

lint: ## ruff + eslint
	$(API) uv run ruff check . && uv run ruff format --check .
	pnpm -r lint

typecheck: ## mypy + tsc
	$(API) uv run mypy
	pnpm -r typecheck

test: ## pytest + vitest
	$(API) uv run pytest
	pnpm -r test

gen-types: ## Regenera packages/shared/src/api.ts desde el OpenAPI del API
	pnpm gen:types

token: ## JWT de desarrollo: make token U=admin
	@$(API) uv run python scripts/firmar_token.py $(or $(U),admin)

check: lint typecheck test ## Todo lo que corre CI
