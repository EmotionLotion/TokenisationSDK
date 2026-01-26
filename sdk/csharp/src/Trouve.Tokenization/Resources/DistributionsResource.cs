namespace Trouve.Tokenization.Resources;

using Trouve.Tokenization.Models;
using Trouve.Tokenization.Utils;

/// <summary>
/// Resource for managing yield distributions.
/// </summary>
public class DistributionsResource
{
    private readonly HttpService _http;
    private const string BasePath = "/api/v1/distributions";

    internal DistributionsResource(HttpService http) => _http = http;

    /// <summary>
    /// Creates a new distribution schedule.
    /// </summary>
    public Task<DistributionSchedule> CreateScheduleAsync(
        string tokenId,
        string type,
        string frequency,
        string amount,
        string? paymentCurrency = null,
        CancellationToken cancellationToken = default)
    {
        return _http.PostAsync<DistributionSchedule>($"{BasePath}/schedules", new
        {
            tokenId,
            type,
            frequency,
            amount,
            paymentCurrency
        }, cancellationToken);
    }

    /// <summary>
    /// Gets a distribution schedule by ID.
    /// </summary>
    public Task<DistributionSchedule> GetScheduleAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<DistributionSchedule>($"{BasePath}/schedules/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists distribution schedules.
    /// </summary>
    public Task<ListResponse<DistributionSchedule>> ListSchedulesAsync(
        string? tokenId = null,
        string? status = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (tokenId != null) query["tokenId"] = tokenId;
        if (status != null) query["status"] = status;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<DistributionSchedule>>($"{BasePath}/schedules", query, cancellationToken);
    }

    /// <summary>
    /// Executes a distribution.
    /// </summary>
    public Task<Distribution> ExecuteAsync(string scheduleId, string? overrideAmount = null, CancellationToken cancellationToken = default)
        => _http.PostAsync<Distribution>($"{BasePath}/schedules/{scheduleId}/execute", new { overrideAmount }, cancellationToken);

    /// <summary>
    /// Gets a distribution by ID.
    /// </summary>
    public Task<Distribution> GetAsync(string id, CancellationToken cancellationToken = default)
        => _http.GetAsync<Distribution>($"{BasePath}/{id}", cancellationToken: cancellationToken);

    /// <summary>
    /// Lists distributions.
    /// </summary>
    public Task<ListResponse<Distribution>> ListAsync(
        string? scheduleId = null,
        string? status = null,
        int? limit = null,
        int? offset = null,
        CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string>();
        if (scheduleId != null) query["scheduleId"] = scheduleId;
        if (status != null) query["status"] = status;
        if (limit.HasValue) query["limit"] = limit.Value.ToString();
        if (offset.HasValue) query["offset"] = offset.Value.ToString();

        return _http.GetAsync<ListResponse<Distribution>>(BasePath, query, cancellationToken);
    }
}
