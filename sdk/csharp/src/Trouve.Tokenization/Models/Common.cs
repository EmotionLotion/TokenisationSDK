namespace Trouve.Tokenization.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Generic list response with pagination.
/// </summary>
public class ListResponse<T>
{
    [JsonPropertyName("data")]
    public List<T> Data { get; set; } = new();

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("total")]
    public int? Total { get; set; }

    [JsonPropertyName("limit")]
    public int? Limit { get; set; }

    [JsonPropertyName("offset")]
    public int? Offset { get; set; }
}

/// <summary>
/// Compliance policy.
/// </summary>
public class Policy
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("rules")]
    public List<PolicyRule>? Rules { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// A rule within a compliance policy.
/// </summary>
public class PolicyRule
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("field")]
    public string Field { get; set; } = string.Empty;

    [JsonPropertyName("op")]
    public string Op { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public object? Value { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("code")]
    public string? Code { get; set; }
}

/// <summary>
/// Compliance decision.
/// </summary>
public class Decision
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("result")]
    public string Result { get; set; } = string.Empty;

    [JsonPropertyName("reasons")]
    public List<DecisionReason>? Reasons { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Reason for a compliance decision.
/// </summary>
public class DecisionReason
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("ruleId")]
    public string? RuleId { get; set; }
}

/// <summary>
/// Distribution schedule.
/// </summary>
public class DistributionSchedule
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("tokenId")]
    public string TokenId { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("frequency")]
    public string Frequency { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public string Amount { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("nextExecutionDate")]
    public DateTime? NextExecutionDate { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Distribution execution.
/// </summary>
public class Distribution
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("scheduleId")]
    public string ScheduleId { get; set; } = string.Empty;

    [JsonPropertyName("totalAmount")]
    public string TotalAmount { get; set; } = string.Empty;

    [JsonPropertyName("recipientCount")]
    public int RecipientCount { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("executedAt")]
    public DateTime? ExecutedAt { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }
}
