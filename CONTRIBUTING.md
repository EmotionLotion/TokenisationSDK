# Contributing to Tokenisation SDK

Thank you for your interest in contributing to the Tokenisation SDK! This document provides guidelines and information for contributors.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to conduct@ahoy.fund.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Git
- Foundry (for smart contract development)

### Development Setup

1. **Fork the repository**

   Click the "Fork" button on GitHub to create your own copy.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/TokenisationSDK.git
   cd TokenisationSDK
   ```

3. **Add upstream remote**

   ```bash
   git remote add upstream https://github.com/EmotionLotion/TokenisationSDK.git
   ```

4. **Install dependencies**

   ```bash
   pnpm install
   ```

5. **Build the SDK**

   ```bash
   pnpm --filter @tokenisation/sdk build
   ```

6. **Run tests to verify setup**

   ```bash
   pnpm --filter @tokenisation/sdk test
   ```

## Making Changes

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/add-erc1400-support`)
- `fix/` - Bug fixes (e.g., `fix/token-transfer-validation`)
- `docs/` - Documentation changes (e.g., `docs/update-api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-compliance-module`)
- `test/` - Test additions/improvements (e.g., `test/add-integration-tests`)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting (no code change)
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Scopes:** `sdk`, `server`, `contracts`, `ui`, `ui-kit`, `sdk-react`, `sdk-react-native`, `examples`, `deploy`

**Examples:**
```
feat(sdk): add ERC-1400 partition support

fix(server): resolve SQLite date handling for timestamps

docs(readme): update quick start instructions
```

### Keeping Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

## Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

   - Write clean, documented code
   - Add tests for new functionality
   - Update documentation as needed

3. **Run checks locally**

   ```bash
   # SDK tests + type check
   pnpm --filter @tokenisation/sdk test
   cd sdk && npx tsc --noEmit

   # Server type check
   cd server && npx tsc --noEmit

   # Contract tests
   cd contracts && forge test

   # UI type check
   cd ui && npx tsc --noEmit
   ```

4. **Push and create PR**

   ```bash
   git push origin feature/your-feature-name
   ```

   Then open a Pull Request on GitHub using the [PR template](.github/pull_request_template.md).

5. **PR Requirements**

   - [ ] Tests pass
   - [ ] Code follows style guidelines
   - [ ] Documentation updated (if applicable)
   - [ ] Commits follow conventional format
   - [ ] PR description explains changes
   - [ ] No merge conflicts

6. **Review Process**

   - A maintainer will review your PR
   - Address any feedback
   - Once approved, a maintainer will merge

## Monorepo Structure

This project uses pnpm workspaces. Key packages:

| Package | Path | Description |
|---------|------|-------------|
| `@tokenisation/sdk` | `sdk/` | Core TypeScript SDK |
| `@tokenisation/sdk-react` | `sdk-react/` | React bindings |
| `@tokenisation/sdk-react-native` | `sdk-react-native/` | React Native bindings |
| Server | `server/` | Express API server |
| Contracts | `contracts/` | Solidity smart contracts |
| UI Dashboard | `ui/` | Admin dashboard |
| UI Kit | `ui-kit/` | Shared component library |
| `@tokenisation/conformance-suite` | `packages/conformance-suite/` | Integration tests |
| `create-tokenised-asset` | `packages/create-tokenised-asset/` | Scaffolding CLI |

## Coding Standards

### TypeScript (SDK & Server)

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Document public APIs with JSDoc comments

### Solidity (Contracts)

- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use NatSpec comments for all public functions
- Prefer explicit visibility modifiers
- Use custom errors over require strings

## Testing Requirements

### SDK Tests

```bash
pnpm --filter @tokenisation/sdk test
```

### Contract Tests

```bash
cd contracts
forge test          # Run all 108 tests
forge test -vvv     # Verbose output
forge coverage      # Coverage report
```

### Conformance Tests

For changes affecting SDK-Server integration:

```bash
# Start server
cd server && pnpm dev &

# Start local chain
anvil &

# Run conformance tests
pnpm --filter @tokenisation/conformance-suite test
```

## Questions?

- **Bug reports**: Open a [GitHub Issue](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Feature requests**: Open a [GitHub Issue](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Security issues**: See [SECURITY.md](SECURITY.md)

Thank you for contributing!
