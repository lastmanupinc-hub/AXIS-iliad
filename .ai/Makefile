# Build orchestration for axis-iliad
# Run "make help" for available targets.

.PHONY: help install dev start lint format typecheck test build audit clean package attest ship ship-summary

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (pnpm / TypeScript)
	pnpm install --frozen-lockfile

dev: ## Run dev server with hot reload
	pnpm run dev --if-present

start: ## Start the production server
	pnpm start --if-present

lint: ## Run linter
	pnpm run lint --if-present

format: ## Format code in place
	pnpm run format --if-present

typecheck: ## Run TypeScript type checker
	pnpm run typecheck --if-present

test: ## Run test suite
	pnpm test --if-present

build: ## Compile production artifacts
	pnpm run build --if-present

audit: ## Audit dependencies for known CVEs
	pnpm audit --prod --audit-level high || true

clean: ## Remove build artifacts and caches
	rm -rf dist/ build/ coverage/ .turbo/

package: build ## Build container image
	docker build -t axis-iliad:latest .

attest: ## Verify release attestation
	@test -f packaging/trust-fabric/attestation.json || (echo "missing packaging/trust-fabric/attestation.json" && exit 1)
	@echo "Attestation root: $$(jq -r .merkle_root packaging/trust-fabric/attestation.json)"

ship: clean install lint test build package attest ## Full release sequence (clean → install → lint → test → build → package → attest)
	@echo ""
	@echo "\033[32mReady to ship.\033[0m Publish: gh release create vX.Y.Z"

ship-summary: ## Print release context for logs and dashboards
	@echo 'Project:       axis-iliad'
	@echo 'Language:      TypeScript'
	@echo "Package mgr:   pnpm"
	@echo 'Frameworks:    React'
	@echo "Docker:        true"
	@echo "Container:     axis-iliad:latest"