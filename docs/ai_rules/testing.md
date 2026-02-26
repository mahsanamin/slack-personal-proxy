# Testing Rules

## Framework

Jest with Supertest for integration tests. Config in `jest.config.js`.

## Running

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- path      # Run specific test file
```

## Test Structure

```
tests/
  integration/api/    # HTTP-level tests (Supertest against Express app)
  unit/
    middleware/        # Middleware function tests
    services/         # Service class tests
    utils/            # Utility function tests
```

## Conventions

### Unit Tests
- Mock all external dependencies (`jest.mock`)
- Mock `../config`, `../utils/logger`, and Slack client before importing the module under test
- Test both success and error paths
- Test edge cases (empty results, missing fields, API errors)

### Integration Tests
- Mock Slack WebClient at the module level before importing server
- Build Express app with mocked services
- Use Supertest for HTTP assertions
- Test auth (valid key, missing key, invalid key)
- Test 404 handling

### Mocking Pattern
```js
jest.mock('../../src/config', () => ({ /* mock config */ }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// Then import the module under test
const MyService = require('../../src/services/myService');
```

### Assertions
- Check response structure matches `{ success, data, meta }` or `{ success, error }`
- Verify HTTP status codes
- Verify service method calls and arguments
- Do NOT test Slack API behavior — only test our logic around it

## What to Test

- **Service methods**: Core logic, filtering, caching interactions, error handling
- **Controllers**: Not typically unit-tested (thin wrappers); covered by integration tests
- **Middleware**: Auth validation, error mapping
- **Utilities**: Pure functions in helpers.js

## What NOT to Test

- Slack API responses (mock them)
- Express framework behavior
- Third-party library internals
