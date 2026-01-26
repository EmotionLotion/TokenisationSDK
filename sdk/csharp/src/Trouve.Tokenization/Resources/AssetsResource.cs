namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing tokenizable assets.
/// </summary>
public class AssetsResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/assets";

    internal AssetsResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new asset.
    /// </summary>
    public Task<Asset> CreateAsync(CreateAssetRequest request, CancellationToken cancellationToken = default)
        => _http.PostAsync<Asset>(BasePath, request, cancellationToken);

    /// <summary>
    /// Gets an asset by ID.
    /// </summary>
    public Task<Asset> GetAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Asset>($"{BasePath}/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists assets with optional filters.
    /// </summary>
    public Task<ListResponse<Asset>> ListAsync(
        string? type = null,
        string? status = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (type != null) query["type"] = type;
        if (status != null) query["status"] = status;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Asset>>(BasePath, query, cancellationToken);
    }

    /// <summary>
    /// Updates an existing asset.
    /// </summary>
    public Task<Asset> UpdateAsync(string id, UpdateAssetRequest request, CancellationToken cancellationToken = default)
        => _http.PatchAsync<Asset>($"{BasePath}/{id}", request, cancellationToken);

    /// <summary>
    /// Deletes an asset.
    /// </summary>
    public Task DeleteAsync(string id, CancellationToken cancellationToken = default)
        => _http.DeleteAsync($"{BasePath}/{id}", cancellationToken);
}
