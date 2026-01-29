# Error Reference

All API errors follow a standardized format with machine-readable codes, human-readable messages, and actionable context.

## Error Response Format

```json
{
  "error": {
    "message": "Human-readable description of what went wrong",
    "code": "MACHINE_READABLE_CODE",
    "traceId": "req_abc123def456",
    "correlation_id": "req_abc123def456",
    "spanId": "span_789",
    "receiptId": "receipt_xyz (compliance errors only)",
    "explanation": {
      "summary": "Plain-language explanation for partners",
      "suggestedActions": ["Action 1", "Action 2"],
      "links": {
        "documentation": "https://docs.example.com/relevant-page"
      }
    },
    "details": {}
  }
}
```

## HTTP Status Codes

| Status | Meaning | When It Occurs |
|--------|---------|----------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created |
| 204 | No Content | Resource deleted |
| 400 | Bad Request | Invalid input, validation failure |
| 401 | Unauthorized | Missing or invalid auth credentials |
| 403 | Forbidden | Valid credentials but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource or idempotency conflict |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error |
| 503 | Service Unavailable | Dependency unavailable |

## Error Codes

### Authentication Errors (401)

| Code | Message | Resolution |
|------|---------|------------|
| `UNAUTHORIZED` | Authentication required | Include a valid `Authorization: Bearer` header |
| `UNAUTHENTICATED` | Invalid credentials | Check your API key or JWT token |
| `SESSION_EXPIRED` | Session has expired | Refresh your JWT token or re-authenticate |
| `INVALID_TOKEN` | Token is malformed or expired | Generate a new token |

### Authorization Errors (403)

| Code | Message | Resolution |
|------|---------|------------|
| `FORBIDDEN` | Insufficient permissions | Request additional scopes for your API key |
| `COMPLIANCE_DENIED` | Transfer violates compliance policy | Check compliance requirements (see `explanation.suggestedActions`) |
| `JURISDICTION_BLOCKED` | Action not available in this region | Verify jurisdiction whitelist in your compliance policy |
| `KYC_REQUIRED` | Identity verification required | Complete KYC for the investor |

### Validation Errors (400)

| Code | Message | Resolution |
|------|---------|------------|
| `VALIDATION_ERROR` | Input validation failed | Check `details` for specific field errors |
| `SCHEMA_VALIDATION_FAILED` | Request body doesn't match schema | Verify request body against API docs |
| `INVALID_ADDRESS` | Invalid Ethereum address | Use a valid 0x-prefixed 40-hex-char address |
| `INVALID_AMOUNT` | Invalid token amount | Use a positive integer string (wei) |
| `INVALID_ARGUMENT` | Invalid parameter value | Check parameter constraints in API docs |

### Resource Errors (404, 409)

| Code | Message | Resolution |
|------|---------|------------|
| `NOT_FOUND` | Resource not found | Verify the resource ID exists |
| `CONFLICT` | Resource already exists | Use a different identifier |
| `IDEMPOTENCY_CONFLICT` | Idempotency key reused with different params | Use a unique idempotency key per operation |

### Compliance Errors (403)

| Code | Message | Resolution |
|------|---------|------------|
| `COMPLIANCE_FAILED` | Compliance check failed | Review compliance policy rules |
| `KYC_EXPIRED` | KYC verification has expired | Re-verify the investor's identity |
| `TRANSFER_RESTRICTED` | Transfer restricted by policy | Check time locks, holder limits, and jurisdiction rules |
| `ACCREDITATION_REQUIRED` | Investor must be accredited | Verify investor's accreditation status |

### Blockchain Errors (500)

| Code | Message | Resolution |
|------|---------|------------|
| `CONTRACT_ERROR` | Smart contract execution failed | Check contract address and parameters |
| `TRANSACTION_FAILED` | Transaction reverted | Check gas, nonce, and contract state |
| `INSUFFICIENT_BALANCE` | Insufficient token balance | Verify sender has enough tokens |
| `GAS_ESTIMATION_FAILED` | Gas estimation failed | Verify transaction parameters |

### Network Errors

| Code | Message | Resolution |
|------|---------|------------|
| `NETWORK_ERROR` | Network request failed | Check connectivity and try again |
| `RPC_ERROR` | Blockchain RPC error | Verify RPC URL and try an alternative |
| `RATE_LIMITED` | Too many requests | Wait for `Retry-After` seconds |
| `TIMEOUT` | Request timed out | Retry with exponential backoff |
| `CIRCUIT_OPEN` | Service circuit breaker open | Service is temporarily unavailable, retry later |

### Storage Errors

| Code | Message | Resolution |
|------|---------|------------|
| `STORAGE_ERROR` | Storage operation failed | Check storage provider configuration |
| `UPLOAD_FAILED` | File upload failed | Verify file size and format |
| `DOWNLOAD_FAILED` | File download failed | Verify file exists and permissions |

## SDK Error Classes

The TypeScript SDK provides typed error classes for programmatic handling:

```typescript
import { SDKError, ComplianceError, ValidationError } from '@tokenisation/sdk';

try {
  await client.transfers.create({ ... });
} catch (error) {
  if (error instanceof ComplianceError) {
    console.log('Violations:', error.violations);
    console.log('Receipt ID:', error.receiptId);
  } else if (error instanceof ValidationError) {
    console.log('Field:', error.field);
    console.log('Constraints:', error.constraints);
  } else if (error instanceof SDKError) {
    console.log('Code:', error.code);
    console.log('Request ID:', error.requestId);
  }
}
```

### Error Class Hierarchy

```
SDKError (base)
├── AuthenticationError    — Auth failures
├── ValidationError        — Input validation (field, constraints)
├── ComplianceError        — Compliance violations (violations[])
├── ContractError          — Smart contract issues (contractAddress, method, txHash)
├── NetworkError           — API/network failures (statusCode, url)
├── OracleError            — Oracle data issues (feedId)
├── AssetError             — Asset operation errors (assetId, tokenId)
└── StorageError           — Storage provider errors (provider, key)
```

## Correlation & Tracing

Every API response includes correlation headers for debugging:

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Unique request identifier (use when reporting issues) |
| `X-Trace-ID` | Distributed trace ID (for OpenTelemetry) |
| `X-Span-ID` | Span ID within the trace |

When reporting issues, always include the `X-Request-ID` from the response.
