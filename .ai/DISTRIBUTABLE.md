# DISTRIBUTABLE — axis-iliad

This project is packaged for marketplace distribution.

## Ship Checklist

- [ ] `make ship` passes locally
- [ ] CI workflow is green on main
- [ ] release workflow tag tested in dry-run
- [ ] marketplace manifests updated with final publisher IDs
- [ ] legal and trademark review approved

## Included Packaging Assets

- packaging/README.md
- packaging/LICENSE
- Dockerfile
- docker-compose.yml
- .github/workflows/ci.yml
- .github/workflows/release.yml
- packaging/manifests/*
- packaging/trust-fabric/*

## Verify Attestation

```bash
cat packaging/trust-fabric/attestation.json
cat packaging/trust-fabric/merkle-proof.json
```