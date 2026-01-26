# Contributing to Tokenisation SDK

Thank you for your interest in contributing to the Tokenisation SDK! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to security@ahoy.fund.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
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
   npm install
   ```

5. **Build the SDK**

   ```bash
   npm run build --workspace=sdk
   ```

6. **Run tests to verify setup**

   ```bash
   npm test --workspace=sdk
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
   # Run tests
   npm test --workspace=sdk

   # Run linting
   npm run lint --workspace=sdk

   # Build to check for errors
   npm run build --workspace=sdk
   ```

4. **Push and create PR**

   ```bash
   git push origin feature/your-feature-name
   ```

   Then open a Pull Request on GitHub.

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

## Coding Standards

### TypeScript (SDK & Server)

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Document public APIs with JSDoc comments

```typescript
/**
 * Creates a new tokenized asset.
 * @param input - Asset creation parameters
 * @returns The created asset with generated ID
 * @throws {ValidationError} If input validation fails
 */
export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  // Implementation
}
```

### Solidity (Contracts)

- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use NatSpec comments for all public functions
- Prefer explicit visibility modifiers
- Use custom errors over require strings

```solidity
/// @notice Transfers tokens with compliance check
/// @param to Recipient address
/// @param amount Amount to transfer
/// @return success Whether transfer succeeded
function transfer(address to, uint256 amount) external returns (bool success) {
    // Implementation
}
```

### File Organization

```
src/
├── modules/          # Feature modules
├── services/         # Business logic
├── utils/            # Shared utilities
├── types/            # Type definitions
└── index.ts          # Public exports
```

## Testing Requirements

### SDK Tests

- Unit tests for all public functions
- Integration tests for module interactions
- Use Vitest for testing

```bash
# Run tests
npm test --workspace=sdk

# Run with coverage
npm run test:coverage --workspace=sdk
```

### Contract Tests

- Unit tests for all contract functions
- Fuzz tests for critical paths
- Use Foundry for testing

```bash
cd contracts
forge test
forge coverage
```

### Conformance Tests

For changes affecting SDK-Server integration:

```bash
# Start server
cd server && npm run dev &

# Start local chain
anvil &

# Run conformance tests
npm test --workspace=@tokenisation/conformance-suite
```

## Documentation

### When to Update Docs

- New features require documentation
- API changes require updated references
- Bug fixes may need troubleshooting updates

### Documentation Locations

| Content | Location |
|---------|----------|
| API Reference | `docs/reference/` |
| Guides | `docs/guides/` |
| Architecture | `docs/architecture/` |
| Operations | `docs/operations/` |

### Documentation Style

- Use clear, concise language
- Include code examples
- Keep examples up-to-date with actual API

## Questions?

- **Bug reports**: Open a [GitHub Issue](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Feature requests**: Open a [GitHub Discussion](https://github.com/EmotionLotion/TokenisationSDK/discussions)
- **Security issues**: See [SECURITY.md](SECURITY.md)

Thank you for contributing!
