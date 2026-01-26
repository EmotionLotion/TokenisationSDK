namespace Trouve.Tokenization;

using System.Net.Http.Headers;
using Trouve.Tokenization.Resources;
using Trouve.Tokenization.Utils;

/// <summary>
/// Main client for the AHOY Tokenisation API.
/// Provides access to all platform resources for tokenizing real-world assets.
/// </summary>
/// <example>
/// <code>
/// var client = new TokenizationClient("your_api_key");
///
/// // Create an investor
/// var investor = await client.Investors.CreateAsync(new CreateInvestorRequest
/// {
///     Email = "investor@example.com",
///     Type = InvestorType.Accredited,
///     CountryCode = "AE"
/// });
///
/// // Create a token
/// var token = await client.Tokens.CreateAsync(new CreateTokenRequest
/// {
///     Name = "Property Token",
///     Symbol = "PROP",
///     TotalSupply = "1000000000000000000000000"
/// });
/// </code>
/// </example>
public class TokenizationClient : IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _jsonOptions;
    private bool _disposed;

    /// <summary>
    /// Default base URL for the AHOY API.
    /// </summary>
    public const string DefaultBaseUrl = "https://api.ahoy.fund";

    /// <summary>
    /// Gets the Assets resource for managing tokenizable assets.
    /// </summary>
    public AssetsResource Assets { get; }

    /// <summary>
    /// Gets the Tokens resource for managing security tokens.
    /// </summary>
    public TokensResource Tokens { get; }

    /// <summary>
    /// Gets the Investors resource for managing investor onboarding and KYC.
    /// </summary>
    public InvestorsResource Investors { get; }

    /// <summary>
    /// Gets the Transfers resource for managing token transfers.
    /// </summary>
    public TransfersResource Transfers { get; }

    /// <summary>
    /// Gets the Distributions resource for managing yield distributions.
    /// </summary>
    public DistributionsResource Distributions { get; }

    /// <summary>
    /// Gets the Compliance resource for managing policies and decisions.
    /// </summary>
    public ComplianceResource Compliance { get; }

    /// <summary>
    /// Creates a new TokenizationClient with the specified API key.
    /// </summary>
    /// <param name="apiKey">Your AHOY API key</param>
    /// <param name="baseUrl">Optional custom base URL (defaults to production)</param>
    /// <param name="httpClient">Optional custom HttpClient for testing</param>
    public TokenizationClient(
        string apiKey,
        string? baseUrl = null,
        HttpClient? httpClient = null)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new ArgumentNullException(nameof(apiKey), "API key is required");

        _httpClient = httpClient ?? new HttpClient();
        _httpClient.BaseAddress = new Uri(baseUrl ?? DefaultBaseUrl);
        _httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", apiKey);
        _httpClient.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/json"));
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "Trouve.Tokenization/0.1.0");

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };

        var httpService = new HttpService(_httpClient, _jsonOptions);

        // Initialize resources
        Assets = new AssetsResource(httpService);
        Tokens = new TokensResource(httpService);
        Investors = new InvestorsResource(httpService);
        Transfers = new TransfersResource(httpService);
        Distributions = new DistributionsResource(httpService);
        Compliance = new ComplianceResource(httpService);
    }

    /// <summary>
    /// Disposes the client and releases resources.
    /// </summary>
    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    /// <summary>
    /// Disposes managed resources.
    /// </summary>
    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;
        if (disposing)
        {
            _httpClient.Dispose();
        }
        _disposed = true;
    }
}
