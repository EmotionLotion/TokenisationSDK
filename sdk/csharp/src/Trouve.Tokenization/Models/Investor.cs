namespace Trouve.Tokenization.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Investor types.
/// </summary>
public enum InvestorType
{
    Retail,
    Accredited,
    Qualified,
    Institutional
}

/// <summary>
/// KYC status values.
/// </summary>
public enum KycStatus
{
    NotStarted,
    Pending,
    Approved,
    Rejected,
    Expired
}

/// <summary>
/// Represents an investor.
/// </summary>
public class Investor
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("countryCode")]
    public string CountryCode { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("kycStatus")]
    public string KycStatus { get; set; } = string.Empty;

    [JsonPropertyName("profile")]
    public Dictionary<string, object>? Profile { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Request to create a new investor.
/// </summary>
public class CreateInvestorRequest
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "accredited";

    [JsonPropertyName("countryCode")]
    public string CountryCode { get; set; } = string.Empty;

    [JsonPropertyName("externalId")]
    public string? ExternalId { get; set; }

    [JsonPropertyName("profile")]
    public Dictionary<string, object>? Profile { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// Represents a KYC verification session.
/// </summary>
public class KycSession
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("investorId")]
    public string InvestorId { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("verificationUrl")]
    public string? VerificationUrl { get; set; }

    [JsonPropertyName("expiresAt")]
    public DateTime? ExpiresAt { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Request to start a KYC session.
/// </summary>
public class StartKycRequest
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "sumsub";

    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("redirectUrl")]
    public string? RedirectUrl { get; set; }
}

/// <summary>
/// Represents an investor's wallet.
/// </summary>
public class Wallet
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("address")]
    public string Address { get; set; } = string.Empty;

    [JsonPropertyName("chainId")]
    public int ChainId { get; set; }

    [JsonPropertyName("label")]
    public string? Label { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Request to add a wallet.
/// </summary>
public class AddWalletRequest
{
    [JsonPropertyName("address")]
    public string Address { get; set; } = string.Empty;

    [JsonPropertyName("chainId")]
    public int ChainId { get; set; }

    [JsonPropertyName("label")]
    public string? Label { get; set; }
}
