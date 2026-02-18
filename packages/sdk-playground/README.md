# @tokenisation/sdk-playground

Zero-friction playground for the Tokenisation SDK - run a full real-estate tokenization demo with a single command.

## Quick Start

```bash
npx @tokenisation/sdk-playground
```

This will:
1. Start a local server
2. Open your browser to the Real Estate tokenization showcase
3. Let you walk through a complete tokenization flow

## Features

The playground includes guided showcases for multiple verticals:

- **Real Estate**: Full Dubai property tokenization with compliance
- **Airline**: Ticket tokenization with boarding passes
- **Car Rental**: Vehicle sharing with time-based tokens
- **Hotel**: Room booking with NFT room keys
- **Concert**: Event tickets with resale controls

## No Setup Required

- No wallet connection needed
- No API keys required
- No NDA to sign
- Works entirely in your browser

## Development

If you're working on the SDK:

```bash
# From the monorepo root
cd packages/sdk-playground
npm run dev
```

This will use the UI from the `ui/` package in the monorepo.

## Publishing

Before publishing to npm:

```bash
# Build the UI first
cd ui && npm run build && cd ..

# Build and bundle
cd packages/sdk-playground
npm run build:bundle
npm publish
```

## License

MIT
