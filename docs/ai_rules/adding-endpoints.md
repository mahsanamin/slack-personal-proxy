# Adding New Endpoints

Step-by-step guide for adding a new API endpoint.

## Checklist

1. **Service** — Add method to existing service or create new service class
2. **Controller** — Add handler function in appropriate controller file
3. **Validator** — Add validation rules in `middleware/validator.js` if new param types needed
4. **Route** — Add route with Swagger JSDoc in appropriate route file
5. **Wire up** — If new service, construct in `server.js` and add to `services` object
6. **Test** — Add unit test for service logic, integration test for HTTP behavior
7. **Docs** — Update `docs/endpoints.md`

## Example: Adding a "star message" endpoint

### 1. Service (`src/services/messageService.js`)
```js
async starMessage(channelId, ts) {
  const result = await this.slack.client.stars.add({ channel: channelId, timestamp: ts });
  return { starred: true, ts };
}
```

### 2. Controller (`src/controllers/messageController.js`)
```js
async function starMessage(req, res, next) {
  try {
    const { channelId } = req.params;
    const { ts } = req.body;
    const result = await req.services.messageService.starMessage(channelId, ts);
    res.json(formatSuccessResponse(result));
  } catch (err) {
    next(err);
  }
}
```

### 3. Route (`src/routes/messages.js`)
```js
/**
 * @swagger
 * /api/messages/{channelId}/star:
 *   post:
 *     summary: Star a message
 *     tags: [Messages]
 *     ...
 */
router.post('/:channelId/star', validateChannelId, validateTimestamp, handleValidationErrors, starMessage);
```

### 4. No wiring needed (messageService already exists)

## New Service Checklist

If the endpoint requires a new service:

1. Create `src/services/newService.js` with constructor injection
2. In `server.js`, import, construct with dependencies, add to `services` object
3. Access in controllers via `req.services.newService`

## Slack API Integration

When calling a new Slack API method:

1. Add a thin wrapper in `slackClient.js` (keeps Slack-specific params contained)
2. Call the wrapper from the service, not `this.slack.client.*` directly
3. If the API has pagination, use `paginationService.fetchAll()`
4. If results need thread metadata, use `enrichSearchMatches()`
