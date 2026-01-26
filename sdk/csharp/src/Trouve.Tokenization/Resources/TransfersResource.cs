namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing token transfers.
/// </summary>
public class TransfersResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/transfers";

    internal TransfersResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new transfer request.
    /// </summary>
    public Task<Transfer> CreateAsync(CreateTransferRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Transfer>(BasePath, request, cancellationToken);

    /// <summary>
    /// Executes a full transfer saga (create + precheck + approve + sign).
    /// </summary>
    public Task<Transfer> ExecuteAsync(ExecuteTransferRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Transfer>($"{BasePath}/execute", request, cancellationToken);

    /// <summary>
    /// Gets a transfer by ID.
    /// </summary>
    public Task<Transfer> GetAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Transfer>($"{BasePath}/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists transfers with optional filters.
    /// </summary>
    public Task<ListResponse<Transfer>> ListAsync(
        string? tokenId = null,
        string? status = null,
        string? fromWallet = null,
        string? toWallet = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (tokenId != null) query["tokenId"] = tokenId;
        if (status != null) query["status"] = status;
        if (fromWallet != null) query["fromWallet"] = fromWallet;
        if (toWallet != null) query["toWallet"] = toWallet;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Transfer>>(BasePath, query, cancellationToken);
    }

    /// <summary>
    /// Checks transfer compliance without creating a transfer.
    /// </summary>
    public Task<ComplianceCheckResult> CheckAsync(
        string tokenId,
        string fromWallet,
        string toWallet,
        string amount,
        CancellationToken cancellationToken = default)
    {
        return _http.PostAsync<ComplianceCheckResult>($"{BasePath}/check", new
        {
            tokenId,
            fromWallet,
            toWallet,
            amount
        }, cancellationToken);
    }

    /// <summary>
    /// Prechecks transfer compliance.
    /// </summary>
    public Task<Transfer> PrecheckAsync(string id, CancellationToken cancellationToken = default)
        => _http.PostAsync<Transfer>($"{BasePath}/{id}/precheck", null, cancellationToken);

    /// <summary>
    /// Approves a transfer.
    /// </summary>
    public Task<Transfer> ApproveAsync(string id, CancellationToken cancellationToken = default)
        => _http.PostAsync<Transfer>($"{BasePath}/{id}/approve", null, cancellationToken);

    /// <summary>
    /// Cancels a transfer.
    /// </summary>
    public Task<Transfer> CancelAsync(string id, string? reason = null, CancellationToken cancellationToken = default)
        => _http.PostAsync<Transfer>($"{BasePath}/{id}/cancel", new { reason }, cancellationToken);
}
