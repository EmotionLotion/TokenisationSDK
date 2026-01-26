namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing investors and KYC.
/// </summary>
public class InvestorsResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/investors";

    internal InvestorsResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new investor.
    /// </summary>
    public Task<Investor> CreateAsync(CreateInvestorRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Investor>(BasePath, request, cancellationToken);

    /// <summary>
    /// Gets an investor by ID.
    /// </summary>
    public Task<Investor> GetAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Investor>($"{BasePath}/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists investors with optional filters.
    /// </summary>
    public Task<ListResponse<Investor>> ListAsync(
        string? type = null,
        string? status = null,
        string? kycStatus = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (type != null) query["type"] = type;
        if (status != null) query["status"] = status;
        if (kycStatus != null) query["kycStatus"] = kycStatus;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Investor>>(BasePath, query, cancellationToken);
    }

    /// <summary>
    /// Starts a KYC verification session.
    /// </summary>
    public Task<KycSession> StartKycAsync(string id, StartKycRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<KycSession>($"{BasePath}/{id}/kyc", request, cancellationToken);

    /// <summary>
    /// Gets KYC status for an investor.
    /// </summary>
    public Task<ListResponse<KycSession>> GetKycSessionsAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<ListResponse<KycSession>>($"{BasePath}/{id}/kyc", cancellationToken: cancellationToken);

    /// <summary>
    /// Adds a wallet to an investor.
    /// </summary>
    public Task<Wallet> AddWalletAsync(string id, AddWalletRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Wallet>($"{BasePath}/{id}/wallets", request, cancellationToken);

    /// <summary>
    /// Lists wallets for an investor.
    /// </summary>
    public Task<ListResponse<Wallet>> ListWalletsAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<ListResponse<Wallet>>($"{BasePath}/{id}/wallets", cancellationToken: cancellationToken);
}
