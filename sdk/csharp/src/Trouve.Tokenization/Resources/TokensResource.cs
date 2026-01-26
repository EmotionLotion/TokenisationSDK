namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing security tokens.
/// </summary>
public class TokensResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/tokens";

    internal TokensResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new token.
    /// </summary>
    public Task<Token> CreateAsync(CreateTokenRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Token>(BasePath, request, cancellationToken);

    /// <summary>
    /// Gets a token by ID.
    /// </summary>
    public Task<Token> GetAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Token>($"{BasePath}/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists tokens with optional filters.
    /// </summary>
    public Task<ListResponse<Token>> ListAsync(
        string? projectId = null,
        string? status = null,
        int? chainId = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (projectId != null) query["projectId"] = projectId;
        if (status != null) query["status"] = status;
        if (chainId.HasValue) query["chainId"] = chainId.Value.ToString();
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Token>>(BasePath, query, cancellationToken);
    }

    /// <summary>
    /// Deploys a token to the blockchain.
    /// </summary>
    public Task<Token> DeployAsync(string id, string deployerAddress, CancellationToken cancellationToken = default)
        => _http.PostAsync<Token>($"{BasePath}/{id}/deploy", new { deployerAddress }, cancellationToken);

    /// <summary>
    /// Issues tokens to an investor.
    /// </summary>
    public Task<TokenIssuance> IssueAsync(string id, IssueTokensRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<TokenIssuance>($"{BasePath}/{id}/issue", request, cancellationToken);

    /// <summary>
    /// Pauses a token.
    /// </summary>
    public Task<Token> PauseAsync(string id, string? reason = null, CancellationToken cancellationToken = default)
        => _http.PostAsync<Token>($"{BasePath}/{id}/pause", new { reason }, cancellationToken);

    /// <summary>
    /// Unpauses a token.
    /// </summary>
    public Task<Token> UnpauseAsync(string id, CancellationToken cancellationToken = default)
        => _http.PostAsync<Token>($"{BasePath}/{id}/unpause", null, cancellationToken);
}
