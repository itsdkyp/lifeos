.PHONY: dev backend frontend proxy install check clean

install:
	cd backend && bun install
	cd frontend && bun install
	@echo "LiteLLM: pip install 'litellm[proxy]'  (or use docker-compose)"

dev:
	@echo "Run in 3 terminals — or use: docker compose up"
	@echo "  1) make proxy      (LiteLLM :4000)"
	@echo "  2) make backend    (Hono    :8787)"
	@echo "  3) make frontend   (Next.js :3000)"

backend:
	cd backend && bun run dev

frontend:
	cd frontend && bun run dev

proxy:
	cd llm-proxy && litellm --config config.yaml --port 4000

check:
	cd backend && bun run check

clean:
	rm -rf backend/node_modules frontend/node_modules frontend/.next backend/*.db
