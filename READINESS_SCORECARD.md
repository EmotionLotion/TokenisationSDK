# Readiness Scorecard

Comprehensive checklist for TokenisationSDK production readiness.

## Core SDK

- [ ] All unit tests pass (`npm run test --workspace=sdk`)
- [ ] Code coverage ≥ 80%
- [ ] TypeScript strict mode enabled
- [ ] No `any` types in public API surface
- [ ] All public exports have JSDoc comments

## Security

- [ ] `npm audit` passes with no high/critical vulnerabilities
- [ ] Slither analysis run on contracts (no critical findings)
- [ ] OWASP top 10 reviewed for API endpoints
- [ ] Rate limiting configured on server
- [ ] Input validation on all public methods

## Performance

- [ ] SDK bundle size < 150KB gzipped
- [ ] UI Lighthouse score ≥ 90 (Performance)
- [ ] No synchronous blocking calls in hot paths
- [ ] Tree-shaking verified (no dead code in production bundle)

## Documentation

- [ ] JSDoc on all exported functions and types
- [ ] README.md up to date with getting started guide
- [ ] CHANGELOG.md maintained via changesets
- [ ] API reference generated from types
- [ ] Architecture diagrams current

## CI/CD

- [ ] CI pipeline green on main branch
- [ ] E2E tests pass (Playwright)
- [ ] Changesets configured for versioning
- [ ] Build artifacts uploaded
- [ ] Coverage reports uploaded to Codecov

## Developer Experience

- [ ] Time to First Token < 10 minutes
- [ ] Code snippets from playground compile without errors
- [ ] Sandbox runs without environment variables
- [ ] Persona permissions are consistent across UI
- [ ] Headless demo works without UI framework
- [ ] Export to ZIP produces runnable project
