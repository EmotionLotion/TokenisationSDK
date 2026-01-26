# Trouve.Tokenization

Official .NET SDK for the AHOY Tokenisation Platform. Tokenize real-world assets with compliant security tokens.

## Installation

```bash
dotnet add package Trouve.Tokenization
```

## Quick Start

```csharp
using Trouve.Tokenization;
using Trouve.Tokenization.Models;

// Initialize the client
var client = new TokenizationClient("your_api_key");

// Create an investor
var investor = await client.Investors.CreateAsync(new CreateInvestorRequest
{
    Email = "investor@example.com",
    Type = "accredited",
    CountryCode = "AE",
    Profile = new Dictionary<string, object>
    {
        ["firstName"] = "Ahmed",
        ["lastName"] = "Al Maktoum"
    }
});

// Start KYC verification
var kycSession = await client.Investors.StartKycAsync(investor.Id, new StartKycRequest
{
    Provider = "sumsub",
    Level = "enhanced"
});

// Create a security token
var token = await client.Tokens.CreateAsync(new CreateTokenRequest
{
    Name = "Property Token",
    Symbol = "PROP",
    TotalSupply = "1000000000000000000000000", // 1M tokens with 18 decimals
    ChainId = 137, // Polygon
    Standard = "ERC3643"
});

// Issue tokens to investor
var issuance = await client.Tokens.IssueAsync(token.Id, new IssueTokensRequest
{
    InvestorId = investor.Id,
    WalletAddress = "0x...",
    Amount = "100000000000000000000000" // 100K tokens
});

// Execute a compliant transfer
var transfer = await client.Transfers.ExecuteAsync(new ExecuteTransferRequest
{
    TokenId = token.Id,
    FromWallet = "0x...",
    ToWallet = "0x...",
    Amount = "50000000000000000000000",
    AutoApprove = true
});
```

## Features

- **Assets**: Create and manage tokenizable assets
- **Tokens**: Deploy ERC-3643 compliant security tokens
- **Investors**: Onboard investors with KYC/AML verification
- **Transfers**: Execute compliant token transfers
- **Distributions**: Manage yield distributions
- **Compliance**: Configure and enforce transfer restrictions

## Available Resources

| Resource | Description |
|----------|-------------|
| `client.Assets` | Manage tokenizable assets (real estate, securities, etc.) |
| `client.Tokens` | Create, deploy, and manage security tokens |
| `client.Investors` | Investor onboarding, KYC, and wallet management |
| `client.Transfers` | Request and execute compliant transfers |
| `client.Distributions` | Schedule and execute yield distributions |
| `client.Compliance` | Manage policies and view decisions |

## Error Handling

```csharp
using Trouve.Tokenization.Exceptions;

try
{
    var investor = await client.Investors.GetAsync("inv_123");
}
catch (NotFoundException ex)
{
    Console.WriteLine($"Investor not found: {ex.Message}");
}
catch (ValidationException ex)
{
    Console.WriteLine($"Validation error: {ex.Message}");
}
catch (AuthenticationException ex)
{
    Console.WriteLine($"Auth failed: {ex.Message}");
}
catch (TokenizationException ex)
{
    Console.WriteLine($"API error: {ex.Message}");
}
```

## Configuration

```csharp
// Use a custom base URL (e.g., sandbox)
var client = new TokenizationClient(
    apiKey: "your_api_key",
    baseUrl: "https://sandbox.api.ahoy.fund"
);

// Use a custom HttpClient (for testing or custom configuration)
var httpClient = new HttpClient();
httpClient.Timeout = TimeSpan.FromSeconds(30);

var client = new TokenizationClient(
    apiKey: "your_api_key",
    httpClient: httpClient
);
```

## Requirements

- .NET 6.0 or later

## License

MIT
