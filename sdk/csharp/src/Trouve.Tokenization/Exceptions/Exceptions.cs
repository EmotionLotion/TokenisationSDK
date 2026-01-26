namespace Trouve.Tokenization.Exceptions;

/// <summary>
/// Base exception for all AHOY Tokenisation SDK errors.
/// </summary>
public class TokenizationException : Exception
{
    public TokenizationException(string message) : base(message) { }
    public TokenizationException(string message, Exception innerException) : base(message, innerException) { }
}

/// <summary>
/// Thrown when request validation fails (400 Bad Request).
/// </summary>
public class ValidationException : TokenizationException
{
    public ValidationException(string message) : base(message) { }
}

/// <summary>
/// Thrown when authentication fails (401 Unauthorized).
/// </summary>
public class AuthenticationException : TokenizationException
{
    public AuthenticationException(string message) : base(message) { }
}

/// <summary>
/// Thrown when authorization fails (403 Forbidden).
/// </summary>
public class AuthorizationException : TokenizationException
{
    public AuthorizationException(string message) : base(message) { }
}

/// <summary>
/// Thrown when a resource is not found (404 Not Found).
/// </summary>
public class NotFoundException : TokenizationException
{
    public NotFoundException(string message) : base(message) { }
}

/// <summary>
/// Thrown when there's a conflict (409 Conflict).
/// </summary>
public class ConflictException : TokenizationException
{
    public ConflictException(string message) : base(message) { }
}

/// <summary>
/// Thrown when rate limit is exceeded (429 Too Many Requests).
/// </summary>
public class RateLimitException : TokenizationException
{
    public RateLimitException(string message) : base(message) { }
}

/// <summary>
/// Thrown when the server returns an error (5xx).
/// </summary>
public class ServerException : TokenizationException
{
    public ServerException(string message) : base(message) { }
}
