# Error Handling Rules

## Error Codes

All error codes are defined in `src/utils/constants.js` as frozen objects:

```js
{ code: 'ERROR_CODE', status: 400, message: 'Human-readable message.' }
```

### Current codes

| Code | Status | When |
|------|--------|------|
| `MISSING_API_KEY` | 401 | No X-API-Key header |
| `INVALID_API_KEY` | 401 | Wrong API key |
| `VALIDATION_ERROR` | 400 | express-validator failure |
| `INVALID_CHANNEL_ID` | 400 | Bad channel ID format |
| `INVALID_COUNT` | 400 | Count out of range |
| `INVALID_TIMESTAMP` | 400 | Bad Slack timestamp |
| `WRITE_CHANNEL_NOT_WHITELISTED` | 403 | Channel not in write list |
| `USER_NOT_WHITELISTED` | 403 | User not in DM list |
| `WRITE_OPS_DISABLED` | 403 | ENABLE_WRITE_OPS=false |
| `CHANNEL_NOT_FOUND` | 404 | Slack says channel_not_found |
| `USER_NOT_FOUND` | 404 | Slack says user_not_found |
| `THREAD_NOT_FOUND` | 404 | Slack says thread_not_found |
| `SLACK_API_ERROR` | 502 | Unrecognized Slack error |
| `INTERNAL_ERROR` | 500 | Unhandled exception |
| `NOT_FOUND` | 404 | Unknown endpoint |

## Adding New Error Codes

1. Add to `ERROR_CODES` in `src/utils/constants.js`
2. Use it in service/controller: `throw { ...ERROR_CODES.NEW_CODE, details: { ... } }`
3. The global `errorHandler` middleware catches and formats it automatically

## Error Flow

```
Service throws structured error
  -> Controller's catch calls next(err)
    -> errorHandler middleware
      -> if err.code && err.status: use directly
      -> if Slack API error: map known errors (channel_not_found, etc.)
      -> else: INTERNAL_ERROR (500)
      -> formatErrorResponse() -> JSON response
```

## Rules

- Never swallow errors silently in services. Catch only when you have a meaningful fallback.
- Use `logger.warn()` for degraded-but-recoverable paths (e.g. failed to fetch one thread in a batch).
- Use `logger.error()` for unexpected failures.
- Never expose stack traces or internal details in API responses.
- Never return raw Slack error strings to clients — map them in `errorHandler.js`.
