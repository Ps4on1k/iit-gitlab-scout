.PHONY: install build test lint typecheck run dev migrate migrate-down

install:
	cd backend && npm install
	cd frontend && npm install
	pip install pre-commit
	pre-commit install

build:
	cd backend && npm run build
	cd frontend && npm run build

test:
	cd backend && npm test

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

typecheck:
	cd backend && npm run typecheck
	cd frontend && npm run typecheck

run:
	cd backend && npm start

dev:
	docker compose up --build

migrate:
	docker compose exec backend npm run migrate

migrate-down:
	docker compose exec backend npm run migrate:down

migrate:create:
	docker compose exec backend npm run migrate:create $(name)
