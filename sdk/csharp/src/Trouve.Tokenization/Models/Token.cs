namespace Trouve.Tokenization.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Token standard types.
/// </summary>
public enum TokenStandard
{
    ERC3643,
    ERC1400,
    ERC20
}

/// <summary>
/// Token status values.
/// </summary>
public enum TokenStatus
{
    Draft,
    Deploying,
    Deployed,
    Active,
    Paused,
    Frozen
}

/// <summary>
/// Represents a security token.
/// </summary>
public class Token
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("decimals")]
    public int Decimals { get; set; } = 18;

    [JsonPropertyName("totalSupply")]
    public string TotalSupply { get; set; } = string.Empty;

    [JsonPropertyName("issuedSupply")]
    public string? IssuedSupply { get; set; }

    [JsonPropertyName("standard")]
    public string Standard { get; set; } = "ERC3643";

    [JsonPropertyName("chainId")]
    public int ChainId { get; set; }

    [JsonPropertyName("contractAddress")]
    public string? ContractAddress { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Request to create a new token.
/// </summary>
public class CreateTokenRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("totalSupply")]
    public string TotalSupply { get; set; } = string.Empty;

    [JsonPropertyName("decimals")]
    public int Decimals { get; set; } = 18;

    [JsonPropertyName("standard")]
    public string? Standard { get; set; }

    [JsonPropertyName("chainId")]
    public int ChainId { get; set; }

    [JsonPropertyName("projectId")]
    public string? ProjectId { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// Request to issue tokens to an investor.
/// </summary>
public class IssueTokensRequest
{
    [JsonPropertyName("investorId")]
    public string InvestorId { get; set; } = string.Empty;

    [JsonPropertyName("walletAddress")]
    public string WalletAddress { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// Token issuance response.
/// </summary>
public class TokenIssuance
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("tokenId")]
    public string TokenId { get; set; } = string.Empty;

    [JsonPropertyName("investorId")]
    public string InvestorId { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("txHash")]
    public string? TxHash { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}
