namespace Trouve.Tokenization.Utils;

using System.Net;
using System.Text;
using System.Text.Json;
using Trouve.Tokenization.Exceptions;

/// <summary>
/// Internal HTTP service for making API requests.
/// </summary>
internal class HttpService
{
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _jsonOptions;

    public HttpService(HttpClient httpClient, JsonSerializerOptions jsonOptions)
    {
        _httpClient = httpClient;
        _jsonOptions = jsonOptions;
    }

    /// <summary>
    /// Sends a GET request to the specified path.
    /// </summary>
    public async Task<T> GetAsync<T>(string path, Dictionary<string, string>? queryParams = null, CancellationToken cancellationToken = default)
    {
        var url = BuildUrl(path, queryParams);
        var response = await _httpClient.GetAsync(url, cancellationToken);
        return await HandleResponseAsync<T>(response, cancellationToken);
    }

    /// <summary>
    /// Sends a POST request with a JSON body.
    /// </summary>
    public async Task<T> PostAsync<T>(string path, object? body = null, CancellationToken cancellationToken = default)
    {
        var content = body != null
            ? new StringContent(JsonSerializer.Serialize(body, _jsonOptions), Encoding.UTF8, "application/json")
            : null;

        var response = await _httpClient.PostAsync(path, content, cancellationToken);
        return await HandleResponseAsync<T>(response, cancellationToken);
    }

    /// <summary>
    /// Sends a PATCH request with a JSON body.
    /// </summary>
    public async Task<T> PatchAsync<T>(string path, object? body = null, CancellationToken cancellationToken = default)
    {
        var content = body != null
            ? new StringContent(JsonSerializer.Serialize(body, _jsonOptions), Encoding.UTF8, "application/json")
            : null;

        var request = new HttpRequestMessage(HttpMethod.Patch, path) { Content = content };
        var response = await _httpClient.SendAsync(request, cancellationToken);
        return await HandleResponseAsync<T>(response, cancellationToken);
    }

    /// <summary>
    /// Sends a DELETE request.
    /// </summary>
    public async Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        var response = await _httpClient.DeleteAsync(path, cancellationToken);
        await HandleResponseAsync(response, cancellationToken);
    }

    private static string BuildUrl(string path, Dictionary<string, string>? queryParams)
    {
        if (queryParams == null || queryParams.Count == 0)
            return path;

        var query = string.Join("&", queryParams
            .Where(kv => !string.IsNullOrEmpty(kv.Value))
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));

        return string.IsNullOrEmpty(query) ? path : $"{path}?{query}";
    }

    private async Task<T> HandleResponseAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw CreateException(response.StatusCode, content);
        }

        if (string.IsNullOrEmpty(content))
        {
            return default!;
        }

        return JsonSerializer.Deserialize<T>(content, _jsonOptions)
            ?? throw new TokenizationException("Failed to deserialize response");
    }

    private async Task HandleResponseAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            throw CreateException(response.StatusCode, content);
        }
    }

    private static TokenizationException CreateException(HttpStatusCode statusCode, string content)
    {
        var message = TryExtractErrorMessage(content) ?? $"Request failed with status {statusCode}";

        return statusCode switch
        {
            HttpStatusCode.BadRequest => new ValidationException(message),
            HttpStatusCode.Unauthorized => new AuthenticationException(message),
            HttpStatusCode.Forbidden => new AuthorizationException(message),
            HttpStatusCode.NotFound => new NotFoundException(message),
            HttpStatusCode.Conflict => new ConflictException(message),
            HttpStatusCode.TooManyRequests => new RateLimitException(message),
            >= HttpStatusCode.InternalServerError => new ServerException(message),
            _ => new TokenizationException(message)
        };
    }

    private static string? TryExtractErrorMessage(string content)
    {
        if (string.IsNullOrEmpty(content)) return null;

        try
        {
            using var doc = JsonDocument.Parse(content);
            if (doc.RootElement.TryGetProperty("error", out var error))
            {
                if (error.ValueKind == JsonValueKind.String)
                    return error.GetString();
                if (error.TryGetProperty("message", out var msg))
                    return msg.GetString();
            }
            if (doc.RootElement.TryGetProperty("message", out var message))
                return message.GetString();
        }
        catch
        {
            // Ignore JSON parsing errors
        }

        return null;
    }
}
