namespace Trouve.Tokenization.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Transfer status values.
/// </summary>
public enum TransferStatus
{
    Created,
    Prechecked,
    Approved,
    Rejected,
    Signing,
    Submitted,
    Confirmed,
    Reconciled,
    Settled,
    Failed,
    Expired,
    Cancelled
}

/// <summary>
/// Represents a token transfer.
/// </summary>
public class Transfer
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("tokenId")]
    public string TokenId { get; set; } = string.Empty;

    [JsonPropertyName("fromWallet")]
    public string FromWallet { get; set; } = string.Empty;

    [JsonPropertyName("toWallet")]
    public string ToWallet { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("decisionId")]
    public string? DecisionId { get; set; }

    [JsonPropertyName("txHash")]
    public string? TxHash { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Request to create a transfer.
/// </summary>
public class CreateTransferRequest
{
    [JsonPropertyName("tokenId")]
    public string TokenId { get; set; } = string.Empty;

    [JsonPropertyName("fromWallet")]
    public string FromWallet { get; set; } = string.Empty;

    [JsonPropertyName("toWallet")]
    public string ToWallet { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = string.Empty;

    [JsonPropertyName("fromInvestorId")]
    public string? FromInvestorId { get; set; }

    [JsonPropertyName("toInvestorId")]
    public string? ToInvestorId { get; set; }

    [JsonPropertyName("idempotencyKey")]
    public string? IdempotencyKey { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// Request to execute a full transfer saga.
/// </summary>
public class ExecuteTransferRequest : CreateTransferRequest
{
    [JsonPropertyName("autoApprove")]
    public bool AutoApprove { get; set; } = true;

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "custodial";
}

/// <summary>
/// Result of a transfer compliance check.
/// </summary>
public class ComplianceCheckResult
{
    [JsonPropertyName("allowed")]
    public bool Allowed { get; set; }

    [JsonPropertyName("decision")]
    public string Decision { get; set; } = string.Empty;

    [JsonPropertyName("reasons")]
    public List<string> Reasons { get; set; } = new();

    [JsonPropertyName("restrictions")]
    public List<string> Restrictions { get; set; } = new();
}
