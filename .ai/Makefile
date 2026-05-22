.PHONY: build test package attest ship

build:
	npm run build --if-present

test:
	npm test --if-present

package:
	docker build -t product-release:latest .

attest:
	@echo "Attestation bundle: packaging/trust-fabric/attestation.json"

ship: build test package attest
	@echo "Ready to ship: run release workflow and publish marketplace manifests"

ship-summary:
	@echo "Project: axis-iliad | Language: TypeScript | Docker: true"