namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing compliance policies and decisions.
/// </summary>
public class ComplianceResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/compliance";

    internal ComplianceResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new compliance policy.
    /// </summary>
    public Task<Policy> CreatePolicyAsync(
        string name,
        string type,
        string? description = null,
        List<PolicyRule>? rules = null,
        CancellationToken cancellationToken = default)
    {
        return _http.PostAsync<Policy>($"{BasePath}/policies", new
        {
            name,
            type,
            description,
            rules
        }, cancellationToken);
    }

    /// <summary>
    /// Gets a policy by ID.
    /// </summary>
    public Task<Policy> GetPolicyAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Policy>($"{BasePath}/policies/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists policies.
    /// </summary>
    public Task<ListResponse<Policy>> ListPoliciesAsync(
        string? type = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (type != null) query["type"] = type;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Policy>>($"{BasePath}/policies", query, cancellationToken);
    }

    /// <summary>
    /// Gets a decision by ID.
    /// </summary>
    public Task<Decision> GetDecisionAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Decision>($"{BasePath}/decisions/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists decisions.
    /// </summary>
    public Task<ListResponse<Decision>> ListDecisionsAsync(
        string? type = null,
        string? result = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (type != null) query["type"] = type;
        if (result != null) query["result"] = result;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Decision>>($"{BasePath}/decisions", query, cancellationToken);
    }
}
