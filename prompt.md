# Slack Read-Only API Proxy - Complete Technical Specification

## 🎯 Project Overview

Build a secure, production-ready Dockerized REST API proxy that exposes intelligent wrapper methods for Slack operations. This service accepts Slack session cookies/tokens and provides a clean REST API for read operations with smart features like automatic pagination, thread fetching, and mention tracking.

**Key Philosophy**: "Smart wrappers, not raw endpoints" - Abstract Slack's complexity into simple, powerful use-case-driven endpoints.

---

## 📋 Table of Contents

1. [Technology Stack](#technology-stack)
2. [Project Structure](#project-structure)
3. [API Endpoints Specification](#api-endpoints-specification)
4. [Authentication Methods](#authentication-methods)
5. [Service Layer Architecture](#service-layer-architecture)
6. [Response Formats](#response-formats)
7. [Caching Strategy](#caching-strategy)
8. [Error Handling](#error-handling)
9. [Docker Setup](#docker-setup)
10. [Deployment Script](#deployment-script)
11. [Environment Configuration](#environment-configuration)
12. [Testing Requirements](#testing-requirements)
13. [Security Requirements](#security-requirements)
14. [Documentation Requirements](#documentation-requirements)

---

## 🛠 Technology Stack

### Required
- **Runtime**: Node.js 20 (Alpine Linux)
- **Framework**: Express.js 4.x
- **Slack SDK**: `@slack/web-api` (latest)
- **Validation**: `express-validator` or `joi`
- **Caching**: `node-cache`
- **Rate Limiting**: `express-rate-limit`
- **Security**: `helmet`
- **Logging**: `winston` or `pino`
- **Containerization**: Docker + Docker Compose

### Optional (Nice to Have)
- **Metrics**: `prom-client` for Prometheus metrics
- **Testing**: `jest` for unit tests, `supertest` for integration tests
- **Documentation**: `swagger-jsdoc` + `swagger-ui-express`

---

## 📁 Project Structure

```
slack-readonly-proxy/
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── .env.example
├── .gitignore
├── package.json
├── README.md
│
├── src/
│   ├── server.js                    # Main application entry point
│   │
│   ├── config/
│   │   └── index.js                 # Configuration management
│   │
│   ├── routes/
│   │   ├── index.js                 # Main router
│   │   ├── channels.js              # Channel endpoints
│   │   ├── users.js                 # User endpoints
│   │   ├── messages.js              # Message/write endpoints
│   │   ├── search.js                # Search endpoints
│   │   ├── conversations.js         # Context/thread endpoints
│   │   ├── mentions.js              # Mention tracking endpoints
│   │   ├── activity.js              # Activity/notification endpoints
│   │   └── admin.js                 # Admin/debug endpoints
│   │
│   ├── controllers/
│   │   ├── channelController.js     # Channel request handlers
│   │   ├── userController.js        # User request handlers
│   │   ├── searchController.js      # Search request handlers
│   │   ├── conversationController.js
│   │   ├── mentionController.js
│   │   ├── activityController.js
│   │   └── adminController.js       # Admin endpoints
│   │
│   ├── services/
│   │   ├── channelService.js        # Channel business logic
│   │   ├── messageService.js        # Message/thread logic
│   │   ├── searchService.js         # Search logic
│   │   ├── mentionService.js        # Mention tracking logic
│   │   ├── activityService.js       # Activity tracking logic
│   │   ├── whitelistService.js      # Whitelist management
│   │   ├── paginationService.js     # Reusable pagination handlers
│   │   └── cacheService.js          # Cache management
│   │
│   ├── clients/
│   │   └── slackClient.js           # Thin Slack SDK wrapper
│   │
│   ├── middleware/
│   │   ├── auth.js                  # API key validation
│   │   ├── rateLimiter.js           # Rate limiting
│   │   ├── validator.js             # Input validation
│   │   └── errorHandler.js          # Global error handling
│   │
│   └── utils/
│       ├── logger.js                # Structured logging
│       ├── helpers.js               # Common utilities
│       └── constants.js             # Application constants
│
└── tests/
    ├── unit/
    │   ├── services/
    │   └── utils/
    └── integration/
        └── api/
```

---

## 🔌 API Endpoints Specification

### Base URL
`http://localhost:3000`

### Authentication
All endpoints require `X-API-Key` header.

---

### 📢 Channel Operations

#### `GET /api/channels/list`
List all channels with basic info.

**Query Parameters**: None

**Behavior**:
- Auto-paginate internally to fetch ALL channels
- Cache results for 5 minutes
- No user-facing pagination

**Response**:
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "id": "C12345",
        "name": "engineering",
        "is_private": false,
        "is_archived": false,
        "member_count": 150,
        "purpose": {
          "value": "Engineering team discussions",
          "creator": "U67890"
        },
        "topic": {
          "value": "Daily standups at 10am",
          "creator": "U67890"
        }
      }
    ],
    "total_count": 45
  },
  "meta": {
    "timestamp": "2024-02-19T10:30:00Z",
    "cached": true,
    "api_calls_made": 2
  }
}
```

---

#### `GET /api/channels/:channelId/recent-messages`
Fetch recent messages with complete threads.

**Path Parameters**:
- `channelId` (required) - Channel ID (e.g., C12345)

**Query Parameters**:
- `count` (optional, default: 5, min: 1, max: 10) - Number of parent messages
- `includeThreads` (optional, default: true) - Auto-fetch thread replies

**Behavior**:
- Fetches `count` parent messages from channel
- If `includeThreads=true`:
  - For each message with replies, fetch ENTIRE thread
  - Handle pagination internally (no limit on thread replies)
  - Cache thread data for 2 minutes
- Maximum 10 parent messages allowed (hard limit)
- Each thread fetch limited to 10 API calls max (safety)

**Response**:
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "ts": "1708340000.123456",
        "user": "U12345",
        "user_name": "alice",
        "text": "Let's discuss the new API design",
        "reply_count": 5,
        "reply_users_count": 3,
        "latest_reply": "1708341000.234567",
        "is_thread_parent": true,
        "thread_replies": [
          {
            "ts": "1708340100.234567",
            "user": "U67890",
            "user_name": "bob",
            "text": "I think we should use REST",
            "thread_ts": "1708340000.123456"
          },
          {
            "ts": "1708340200.345678",
            "user": "U11111",
            "user_name": "carol",
            "text": "GraphQL might be better",
            "thread_ts": "1708340000.123456"
          }
        ],
        "reactions": [
          {
            "name": "thumbsup",
            "count": 3,
            "users": ["U67890", "U11111", "U22222"]
          }
        ]
      }
    ],
    "channel_id": "C12345",
    "channel_name": "engineering"
  },
  "meta": {
    "timestamp": "2024-02-19T10:30:00Z",
    "parent_message_count": 5,
    "threads_fetched": 3,
    "total_thread_replies": 12,
    "cached": false,
    "api_calls_made": 8
  }
}
```

**Error Cases**:
- `400` - Invalid count (>10 or <1)
- `404` - Channel not found
- `403` - No access to private channel

---

#### `GET /api/channels/:channelId/info`
Get detailed channel information.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "C12345",
    "name": "engineering",
    "created": 1600000000,
    "creator": "U12345",
    "is_private": false,
    "is_archived": false,
    "is_general": false,
    "member_count": 150,
    "purpose": {
      "value": "Engineering discussions",
      "creator": "U12345",
      "last_set": 1600000000
    },
    "topic": {
      "value": "Daily standups at 10am",
      "creator": "U67890",
      "last_set": 1605000000
    },
    "pins": 5,
    "files_count": 245
  },
  "meta": {
    "cached": true,
    "cache_ttl_seconds": 300
  }
}
```

---

#### `GET /api/channels/:channelId/search-in-channel`
Search messages within specific channel.

**Query Parameters**:
- `query` (required) - Search text
- `count` (optional, default: 20, max: 50)
- `includeThreads` (optional, default: true)

**Response**: Similar to recent-messages but filtered by search query

---

### 👥 User Operations

#### `GET /api/users/list`
List all workspace users.

**Behavior**:
- Auto-paginate to fetch ALL users
- Cache for 5 minutes
- Filter out deleted/bot users by default

**Response**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "U12345",
        "name": "alice",
        "real_name": "Alice Johnson",
        "email": "alice@wego.com",
        "is_admin": false,
        "is_owner": false,
        "is_bot": false,
        "deleted": false,
        "profile": {
          "display_name": "Alice",
          "status_text": "In a meeting",
          "status_emoji": ":calendar:",
          "avatar_hash": "abc123",
          "image_72": "https://..."
        },
        "tz": "Asia/Singapore",
        "tz_offset": 28800
      }
    ],
    "total_count": 250
  },
  "meta": {
    "cached": true,
    "api_calls_made": 3
  }
}
```

---

#### `GET /api/users/:userId/profile`
Get detailed user profile.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "U12345",
    "name": "alice",
    "real_name": "Alice Johnson",
    "email": "alice@wego.com",
    "title": "Senior Engineer",
    "phone": "+65 1234 5678",
    "skype": "alice.j",
    "profile": {
      "display_name": "Alice",
      "status_text": "In a meeting",
      "status_emoji": ":calendar:",
      "first_name": "Alice",
      "last_name": "Johnson",
      "fields": {
        "Xf12345": {
          "label": "Department",
          "value": "Engineering"
        }
      }
    },
    "is_admin": false,
    "is_owner": false,
    "presence": "active"
  },
  "meta": {
    "cached": true
  }
}
```

---

### 🔍 Search Operations

#### `GET /api/search/messages`
Global message search with thread context.

**Query Parameters**:
- `query` (required) - Search text
- `count` (optional, default: 10, max: 20)
- `includeThreads` (optional, default: true)
- `sortOrder` (optional, default: 'timestamp', values: 'timestamp', 'score')

**Behavior**:
- Uses Slack's `search.messages` API
- If result is in thread AND includeThreads=true:
  - Fetch parent message
  - Fetch complete thread
- Deduplicate if multiple thread replies match

**Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "message": {
          "ts": "1708340000.123456",
          "user": "U12345",
          "user_name": "alice",
          "text": "We need to fix the **bug** in production",
          "channel_id": "C12345",
          "channel_name": "engineering",
          "permalink": "https://wego.slack.com/archives/C12345/p1708340000123456"
        },
        "is_in_thread": false,
        "match_score": 0.95
      },
      {
        "message": {
          "ts": "1708340100.234567",
          "user": "U67890",
          "user_name": "bob",
          "text": "I found the **bug**, it's in the auth module",
          "channel_id": "C12345",
          "channel_name": "engineering",
          "permalink": "https://wego.slack.com/archives/C12345/p1708340100234567?thread_ts=1708340000.123456"
        },
        "is_in_thread": true,
        "thread_context": {
          "parent_ts": "1708340000.123456",
          "parent_text": "Discussion about production issues",
          "reply_number": 3
        },
        "complete_thread": {
          "parent": { /* ... */ },
          "replies": [ /* ... */ ]
        },
        "match_score": 0.89
      }
    ],
    "total_matches": 45
  },
  "meta": {
    "query": "bug",
    "searched_channels": "all",
    "api_calls_made": 5
  }
}
```

---

#### `GET /api/search/channels`
Search for channels by name/topic.

**Query Parameters**:
- `query` (required) - Search text

**Response**:
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "id": "C12345",
        "name": "engineering-frontend",
        "name_normalized": "engineering-frontend",
        "is_private": false,
        "member_count": 45,
        "purpose": "Frontend team discussions",
        "match_type": "name"
      },
      {
        "id": "C67890",
        "name": "random",
        "topic": "Engineering memes and fun",
        "match_type": "topic"
      }
    ]
  }
}
```

---

### 💬 Conversation Context Operations

#### `GET /api/conversations/:channelId/context`
Get conversation context around a specific message.

**Query Parameters**:
- `messageTs` (required) - Target message timestamp
- `before` (optional, default: 5, max: 10) - Messages before target
- `after` (optional, default: 5, max: 10) - Messages after target

**Behavior**:
- Fetch messages before target
- Fetch messages after target
- If target is in thread, return entire thread instead
- Handle pagination internally

**Response**:
```json
{
  "success": true,
  "data": {
    "target_message": {
      "ts": "1708340500.123456",
      "user": "U12345",
      "text": "This is the target message",
      "is_in_thread": true,
      "thread_ts": "1708340000.123456"
    },
    "context_type": "thread",
    "messages": {
      "before": [ /* 5 messages before target */ ],
      "after": [ /* 5 messages after target */ ]
    },
    "thread_context": {
      "parent": { /* parent message */ },
      "all_replies": [ /* complete thread */ ],
      "target_position": 7
    }
  },
  "meta": {
    "api_calls_made": 3
  }
}
```

---

#### `GET /api/conversations/:channelId/thread/:threadTs`
Fetch complete thread by parent timestamp.

**Behavior**:
- Fetch parent message
- Fetch ALL replies (handle pagination internally)
- No limit on number of replies
- Cache for 2 minutes

**Response**:
```json
{
  "success": true,
  "data": {
    "parent": {
      "ts": "1708340000.123456",
      "user": "U12345",
      "user_name": "alice",
      "text": "Let's discuss the API design",
      "reply_count": 15,
      "reply_users_count": 5,
      "latest_reply": "1708350000.999999"
    },
    "replies": [
      {
        "ts": "1708340100.234567",
        "user": "U67890",
        "user_name": "bob",
        "text": "I think REST is better",
        "thread_ts": "1708340000.123456"
      }
      // ... all 15 replies
    ],
    "participants": ["U12345", "U67890", "U11111", "U22222", "U33333"],
    "reply_count": 15
  },
  "meta": {
    "cached": false,
    "api_calls_made": 2,
    "complete": true
  }
}
```

---

### 🔔 Mention & Notification Operations

#### `GET /api/mentions/all`
Get all messages where you are mentioned.

**Query Parameters**:
- `count` (optional, default: 20, max: 50) - Number of mentions
- `includeThreads` (optional, default: true) - Fetch thread context
- `onlyUnread` (optional, default: false) - Only unread mentions

**Behavior**:
- Get current user ID from auth.test on startup
- Search for `<@USER_ID>` across workspace
- For thread mentions, fetch complete thread
- Sort by timestamp (newest first)
- Group by channel for statistics

**Response**:
```json
{
  "success": true,
  "data": {
    "mentions": [
      {
        "message_ts": "1708340000.123456",
        "channel_id": "C12345",
        "channel_name": "engineering",
        "text": "Hey <@U12345>, can you review this PR?",
        "user_id": "U67890",
        "user_name": "alice",
        "is_thread_reply": false,
        "thread_ts": null,
        "permalink": "https://wego.slack.com/archives/C12345/p1708340000123456",
        "created_at": "2024-02-19T10:30:00Z",
        "is_read": false
      },
      {
        "message_ts": "1708340100.234567",
        "channel_id": "C12345",
        "channel_name": "engineering",
        "text": "<@U12345> this is ready for your input",
        "user_id": "U11111",
        "user_name": "bob",
        "is_thread_reply": true,
        "thread_ts": "1708340000.123456",
        "thread_context": {
          "parent_message": "Starting discussion about new API...",
          "reply_count": 8,
          "mention_at_reply_number": 5
        },
        "complete_thread": {
          "parent": { /* full parent message */ },
          "replies": [ /* all 8 replies */ ]
        },
        "permalink": "https://wego.slack.com/archives/C12345/p1708340100234567?thread_ts=1708340000123456",
        "created_at": "2024-02-19T11:15:00Z",
        "is_read": true
      }
    ],
    "grouped_by_channel": {
      "engineering": 5,
      "general": 2,
      "random": 1
    }
  },
  "meta": {
    "total_mentions": 8,
    "unread_mentions": 3,
    "threads_with_mentions": 4,
    "api_calls_made": 6,
    "cached": false
  }
}
```

---

#### `GET /api/mentions/threads`
Get threads where you were mentioned.

**Query Parameters**:
- `count` (optional, default: 20, max: 50)
- `onlyActive` (optional, default: false) - Only threads with recent activity

**Behavior**:
- Search for mentions in threads
- Fetch complete thread for each
- Identify mention position in thread
- Show if thread has new activity since mention
- Deduplicate threads (show once even if mentioned multiple times)

**Response**:
```json
{
  "success": true,
  "data": {
    "threads": [
      {
        "thread_ts": "1708340000.123456",
        "channel_id": "C12345",
        "channel_name": "engineering",
        "parent_message": {
          "ts": "1708340000.123456",
          "user_id": "U99999",
          "user_name": "carol",
          "text": "Let's discuss the database migration strategy"
        },
        "your_mentions": [
          {
            "reply_number": 3,
            "ts": "1708340500.111111",
            "text": "<@U12345> what do you think about this approach?",
            "user_id": "U88888",
            "user_name": "dave"
          },
          {
            "reply_number": 7,
            "ts": "1708340800.222222",
            "text": "Thanks <@U12345> for the feedback!",
            "user_id": "U88888",
            "user_name": "dave"
          }
        ],
        "complete_thread": {
          "parent": { /* ... */ },
          "replies": [ /* all 12 replies */ ]
        },
        "thread_stats": {
          "total_replies": 12,
          "participants": ["U99999", "U88888", "U12345", "U77777"],
          "participant_names": ["carol", "dave", "you", "eve"],
          "last_reply_ts": "1708341000.333333",
          "last_reply_user": "eve",
          "has_new_activity": true,
          "you_participated": true
        },
        "permalink": "https://wego.slack.com/archives/C12345/p1708340000123456"
      }
    ]
  },
  "meta": {
    "total_threads": 4,
    "threads_with_new_activity": 2,
    "total_mentions_in_threads": 8
  }
}
```

---

#### `GET /api/mentions/by-channel/:channelId`
Get mentions within specific channel.

**Query Parameters**:
- `count` (optional, default: 20, max: 50)
- `includeThreads` (optional, default: true)

**Response**: Similar to `/api/mentions/all` but filtered to one channel

---

#### `GET /api/mentions/unread`
Get only unread mentions.

**Query Parameters**:
- `includeThreads` (optional, default: true)
- `groupByChannel` (optional, default: true)

**Response**:
```json
{
  "success": true,
  "data": {
    "mentions": [ /* array of unread mentions */ ],
    "count": 5,
    "by_channel": {
      "engineering": 3,
      "general": 1,
      "random": 1
    }
  },
  "meta": {
    "fetched_at": "2024-02-19T12:00:00Z"
  }
}
```

---

#### `GET /api/activity/unreads`
Get all unread activity across workspace.

**Query Parameters**:
- `fetchMessages` (optional, default: false) - Fetch actual messages vs just counts
- `includeThreads` (optional, default: true)

**Behavior**:
- Fetch unread counts per channel
- Optionally fetch actual unread messages
- Group by type: DMs, Channels, Threads
- Show which unreads have mentions

**Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_unread_channels": 12,
      "total_unread_messages": 47,
      "unread_mentions": 5,
      "unread_dms": 3
    },
    "by_type": {
      "dms": [
        {
          "channel_id": "D12345",
          "user_id": "U67890",
          "user_name": "alice",
          "unread_count": 2,
          "latest_message": {
            "text": "Quick question about the deployment",
            "ts": "1708340000.123456",
            "preview": "Quick question about..."
          }
        }
      ],
      "channels": [
        {
          "channel_id": "C12345",
          "channel_name": "engineering",
          "unread_count": 15,
          "has_mentions": true,
          "mention_count": 2,
          "latest_message": {
            "text": "The build is failing on staging...",
            "ts": "1708340100.123456",
            "user_name": "bob"
          }
        }
      ],
      "threads": [
        {
          "channel_id": "C12345",
          "channel_name": "engineering",
          "thread_ts": "1708340000.123456",
          "parent_text": "Database migration discussion...",
          "unread_reply_count": 3,
          "you_are_mentioned": true,
          "latest_reply_ts": "1708340200.123456"
        }
      ]
    }
  },
  "meta": {
    "fetched_at": "2024-02-19T12:00:00Z",
    "includes_message_preview": true,
    "api_calls_made": 8
  }
}
```

---

#### `GET /api/activity/threads-im-in`
Get threads you participated in.

**Query Parameters**:
- `count` (optional, default: 20, max: 50)
- `onlyActive` (optional, default: true) - Threads with recent activity
- `withNewReplies` (optional, default: false) - Only threads with new replies since you last read

**Behavior**:
- Search for messages from current user
- Filter for thread replies
- Fetch complete thread state
- Check for new activity since your last message

**Response**:
```json
{
  "success": true,
  "data": {
    "threads": [
      {
        "thread_ts": "1708340000.123456",
        "channel_id": "C12345",
        "channel_name": "engineering",
        "parent_message": { /* ... */ },
        "your_messages": [
          {
            "ts": "1708340200.234567",
            "text": "I can help with that",
            "reply_number": 3
          }
        ],
        "complete_thread": { /* ... */ },
        "thread_stats": {
          "total_replies": 15,
          "your_reply_count": 3,
          "new_replies_since_your_last": 5,
          "last_activity_ts": "1708341000.999999"
        }
      }
    ]
  },
  "meta": {
    "total_threads": 12,
    "threads_with_new_activity": 5
  }
}
```

---

#### `GET /api/activity/my-threads`
Get threads YOU started (you are the parent message author).

**Query Parameters**:
- `count` (optional, default: 20, max: 50)
- `includeAllReplies` (optional, default: true)

**Response**: Similar structure showing threads you initiated

---

### 🏢 Workspace Operations

#### `GET /api/workspace/info`
Get workspace details.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "T12345",
    "name": "Wego",
    "domain": "wego",
    "email_domain": "wego.com",
    "icon": {
      "image_68": "https://...",
      "image_132": "https://..."
    },
    "user_count": 250,
    "bot_count": 15,
    "created": 1500000000
  }
}
```

---

### 🔐 Authentication & Health

#### `GET /api/auth/test`
Test authentication validity.

**Response**:
```json
{
  "success": true,
  "data": {
    "team_id": "T12345",
    "team_name": "Wego",
    "user_id": "U12345",
    "user_name": "ahsan",
    "auth_method": "cookie",
    "is_valid": true
  }
}
```

---

#### `GET /health`
Health check endpoint.

**Behavior**:
- Test Slack connectivity (call auth.test)
- Cache result for 5 minutes
- Don't fail health check if Slack is temporarily unreachable (log warning)

**Response**:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "slack_auth": "valid",
  "slack_team": "Wego",
  "cache_status": "operational",
  "memory_usage_mb": 45.2,
  "timestamp": "2024-02-19T10:30:00Z"
}
```

---

### 🛠️ Admin & Debug Endpoints

#### `GET /api/admin/whitelist-status`
Get current whitelist configuration and status.

**Response**:
```json
{
  "success": true,
  "data": {
    "enforce": true,
    "read_channels": {
      "configured": true,
      "count": 3,
      "channels": ["engineering", "C12345", "general"]
    },
    "write_channels": {
      "configured": true,
      "count": 1,
      "channels": ["bot-testing"]
    },
    "dm_users": {
      "configured": true,
      "count": 2,
      "users": ["alice", "U67890"]
    }
  }
}
```

---

### ✍️ Write Operations (Phase 2)

#### `POST /api/messages/send`
Send a message to channel or thread.

**IMPORTANT**: 
- Disabled by default. Enable with `ENABLE_WRITE_OPS=true`
- **Whitelist required**: Can only send to channels in `ALLOWED_WRITE_CHANNELS`
- Returns `403 Forbidden` if channel not whitelisted

**Request Body**:
```json
{
  "channel": "C12345",
  "text": "Hello team!",
  "threadTs": "1708340000.123456"
}
```

**Behavior**:
- Accept channel ID or channel name (resolve internally)
- **Check whitelist** before sending
- Validate channel exists before sending
- If threadTs provided, reply to thread
- Support basic text formatting (bold, italic, links)

**Response**:
```json
{
  "success": true,
  "data": {
    "ts": "1708340500.123456",
    "channel": "C12345",
    "text": "Hello team!",
    "permalink": "https://wego.slack.com/archives/C12345/p1708340500123456"
  }
}
```

**Error Response (Not Whitelisted)**:
```json
{
  "success": false,
  "error": {
    "code": "CHANNEL_NOT_WHITELISTED",
    "message": "Channel 'C12345' is not in ALLOWED_WRITE_CHANNELS whitelist",
    "details": {
      "channel": "C12345",
      "whitelisted_channels": ["C99999", "testing"]
    }
  }
}
```

---

#### `POST /api/messages/send-dm`
Send a direct message to a user.

**IMPORTANT**: 
- Disabled by default. Enable with `ENABLE_WRITE_OPS=true`
- **Whitelist required**: Can only send DMs to users in `ALLOWED_DM_USERS`
- Returns `403 Forbidden` if user not whitelisted

**Request Body**:
```json
{
  "user": "U12345",
  "text": "Hi Alice, quick question about the deployment",
  "threadTs": "1708340000.123456"
}
```

**Behavior**:
- Accept user ID or username (resolve internally)
- **Check whitelist** before sending
- Open DM channel if doesn't exist
- Validate user exists before sending
- Support text formatting

**Response**:
```json
{
  "success": true,
  "data": {
    "ts": "1708340500.123456",
    "channel": "D12345",
    "user": "U12345",
    "user_name": "alice",
    "text": "Hi Alice, quick question about the deployment",
    "permalink": "https://wego.slack.com/archives/D12345/p1708340500123456"
  }
}
```

**Error Response (Not Whitelisted)**:
```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_WHITELISTED",
    "message": "User 'alice' (U12345) is not in ALLOWED_DM_USERS whitelist",
    "details": {
      "user_id": "U12345",
      "user_name": "alice",
      "whitelisted_users": ["U99999", "bob"]
    }
  }
}
```

---

## 🔐 Authentication Methods

The service supports two authentication methods:

### Method A: Cookie-Based (Personal Use)
For users without approved Slack App access.

**Required Environment Variables**:
```bash
SLACK_COOKIE=xoxd-xxxxxxxxxxxxx
SLACK_TOKEN=xoxc-xxxxxxxxxxxxx
```

**How to Get**:
1. Open Slack in Chrome/Edge and log in
2. Open DevTools (F12) → Application → Cookies → https://app.slack.com
3. Find cookie named `d` → Copy value (this is SLACK_COOKIE)
4. Go to Network tab → Refresh page
5. Find any request to `api.slack.com`
6. Look at request headers → Find `Authorization: Bearer xoxc-...`
7. Copy the `xoxc-...` token (this is SLACK_TOKEN)

### Method B: Bot Token (Approved App)
For users with approved Slack App.

**Required Environment Variable**:
```bash
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxx
```

**How to Get**:
1. Go to https://api.slack.com/apps
2. Select your app
3. Go to OAuth & Permissions
4. Copy "Bot User OAuth Token"

### Auto-Detection
The service automatically detects which method based on env vars:
```javascript
if (process.env.SLACK_BOT_TOKEN) {
  // Use bot token
  client = new WebClient(process.env.SLACK_BOT_TOKEN);
} else if (process.env.SLACK_COOKIE && process.env.SLACK_TOKEN) {
  // Use cookie-based auth
  client = new WebClient(process.env.SLACK_TOKEN, {
    headers: {
      'Cookie': `d=${process.env.SLACK_COOKIE}`
    }
  });
} else {
  throw new Error('No valid Slack credentials provided');
}
```

---

## 🏗 Service Layer Architecture

### Layered Architecture

```
┌─────────────────────────────────────┐
│         Routes (Express)            │  ← HTTP endpoints
├─────────────────────────────────────┤
│        Controllers                  │  ← Request validation, response formatting
├─────────────────────────────────────┤
│         Services                    │  ← Business logic, wrapper methods
├─────────────────────────────────────┤
│    SlackClient (SDK Wrapper)        │  ← Thin wrapper around @slack/web-api
├─────────────────────────────────────┤
│         Slack API                   │
└─────────────────────────────────────┘
```

### Key Service Classes

#### 1. SlackClient (`clients/slackClient.js`)

Thin wrapper around Slack SDK with automatic auth detection.

```javascript
const { WebClient } = require('@slack/web-api');

class SlackClient {
  constructor() {
    this.client = null;
    this.currentUserId = null;
    this.currentUserName = null;
    this.teamId = null;
    this.teamName = null;
  }

  /**
   * Initialize client and get authenticated user info
   */
  async initialize() {
    // Auto-detect auth method
    if (process.env.SLACK_BOT_TOKEN) {
      this.client = new WebClient(process.env.SLACK_BOT_TOKEN);
      this.authMethod = 'bot_token';
    } else if (process.env.SLACK_COOKIE && process.env.SLACK_TOKEN) {
      this.client = new WebClient(process.env.SLACK_TOKEN, {
        headers: {
          'Cookie': `d=${process.env.SLACK_COOKIE}`
        }
      });
      this.authMethod = 'cookie';
    } else {
      throw new Error('No valid Slack credentials provided. Set either SLACK_BOT_TOKEN or both SLACK_COOKIE and SLACK_TOKEN');
    }

    // Get authenticated user info
    const authTest = await this.client.auth.test();
    this.currentUserId = authTest.user_id;
    this.currentUserName = authTest.user;
    this.teamId = authTest.team_id;
    this.teamName = authTest.team;

    console.log(`✓ Authenticated as ${this.currentUserName} (${this.currentUserId}) via ${this.authMethod}`);
    console.log(`✓ Connected to workspace: ${this.teamName} (${this.teamId})`);
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(channelId, limit = 100, cursor = null) {
    const params = {
      channel: channelId,
      limit: limit
    };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.history(params);
    return {
      messages: result.messages,
      has_more: result.has_more,
      next_cursor: result.response_metadata?.next_cursor
    };
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(channelId, threadTs, limit = 100, cursor = null) {
    const params = {
      channel: channelId,
      ts: threadTs,
      limit: limit
    };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.replies(params);
    return {
      messages: result.messages,
      has_more: result.has_more,
      next_cursor: result.response_metadata?.next_cursor
    };
  }

  /**
   * Search messages
   */
  async searchMessages(query, count = 20, page = 1) {
    const result = await this.client.search.messages({
      query: query,
      count: count,
      page: page,
      sort: 'timestamp',
      sort_dir: 'desc'
    });

    return {
      messages: result.messages.matches,
      total: result.messages.total,
      page: result.messages.pagination.page,
      page_count: result.messages.pagination.page_count
    };
  }

  /**
   * Get user info
   */
  async getUserInfo(userId) {
    const result = await this.client.users.info({ user: userId });
    return result.user;
  }

  /**
   * List channels
   */
  async listChannels(cursor = null, types = 'public_channel,private_channel') {
    const params = {
      types: types,
      exclude_archived: true,
      limit: 200
    };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.list(params);
    return {
      channels: result.channels,
      next_cursor: result.response_metadata?.next_cursor
    };
  }

  /**
   * List users
   */
  async listUsers(cursor = null) {
    const params = { limit: 200 };
    if (cursor) params.cursor = cursor;

    const result = await this.client.users.list(params);
    return {
      users: result.members,
      next_cursor: result.response_metadata?.next_cursor
    };
  }

  /**
   * Get channel info
   */
  async getChannelInfo(channelId) {
    const result = await this.client.conversations.info({ channel: channelId });
    return result.channel;
  }

  /**
   * Post message (write operation)
   */
  async postMessage(channel, text, threadTs = null) {
    const params = {
      channel: channel,
      text: text
    };
    if (threadTs) params.thread_ts = threadTs;

    const result = await this.client.chat.postMessage(params);
    return result;
  }
}

module.exports = SlackClient;
```

---

#### 2. PaginationService (`services/paginationService.js`)

Handles automatic pagination for any Slack API endpoint.

```javascript
class PaginationService {
  constructor(logger) {
    this.logger = logger;
    this.MAX_API_CALLS = process.env.MAX_PAGINATION_CALLS || 10;
  }

  /**
   * Fetch all results with automatic pagination
   * @param {Function} apiFn - Async function that returns { items, next_cursor }
   * @param {Object} initialParams - Initial parameters for API call
   * @param {number} maxCalls - Safety limit on API calls
   * @returns {Promise<Object>} { items: [], truncated: boolean, api_calls: number }
   */
  async fetchAll(apiFn, initialParams = {}, maxCalls = null) {
    const limit = maxCalls || this.MAX_API_CALLS;
    let allItems = [];
    let cursor = null;
    let callCount = 0;
    let truncated = false;

    do {
      callCount++;
      
      if (callCount > limit) {
        this.logger.warn(`Pagination limit reached (${limit} calls). Results may be incomplete.`);
        truncated = true;
        break;
      }

      try {
        const response = await apiFn({ ...initialParams, cursor });
        
        // Handle different response formats
        const items = response.items || response.messages || response.users || response.channels || [];
        allItems = allItems.concat(items);
        
        cursor = response.next_cursor;
        
        // Some APIs return empty string for no more results
        if (cursor === '' || cursor === null || cursor === undefined) {
          cursor = null;
        }

      } catch (error) {
        this.logger.error(`Pagination error on call ${callCount}:`, error.message);
        throw error;
      }

    } while (cursor !== null);

    return {
      items: allItems,
      truncated: truncated,
      api_calls: callCount,
      total_count: allItems.length
    };
  }

  /**
   * Fetch all thread replies
   */
  async fetchAllReplies(slackClient, channelId, threadTs, maxCalls = null) {
    const apiFn = async ({ cursor }) => {
      return await slackClient.getThreadReplies(channelId, threadTs, 100, cursor);
    };

    const result = await this.fetchAll(apiFn, {}, maxCalls);
    
    // Remove first message (parent) as it's duplicated in replies
    if (result.items.length > 0) {
      result.items = result.items.slice(1);
    }

    return result;
  }

  /**
   * Fetch all channels
   */
  async fetchAllChannels(slackClient, maxCalls = null) {
    const apiFn = async ({ cursor }) => {
      return await slackClient.listChannels(cursor);
    };

    return await this.fetchAll(apiFn, {}, maxCalls);
  }

  /**
   * Fetch all users
   */
  async fetchAllUsers(slackClient, maxCalls = null) {
    const apiFn = async ({ cursor }) => {
      return await slackClient.listUsers(cursor);
    };

    return await this.fetchAll(apiFn, {}, maxCalls);
  }
}

module.exports = PaginationService;
```

---

#### 3. MessageService (`services/messageService.js`)

Handles message and thread operations.

```javascript
class MessageService {
  constructor(slackClient, cacheService, paginationService, whitelistService, logger) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
    this.whitelist = whitelistService;
    this.logger = logger;
    this.MAX_PARENT_MESSAGES = parseInt(process.env.MAX_PARENT_MESSAGES) || 5;
  }

  /**
   * Get recent messages with automatic thread fetching
   */
  async getRecentMessages(channelId, count = 5, includeThreads = true) {
    // Check whitelist for READ
    const readCheck = await this.whitelist.canReadChannel(channelId);
    if (!readCheck.allowed) {
      throw readCheck.error;
    }

    // Validate limits
    if (count > 10) {
      throw new Error('Maximum 10 parent messages allowed');
    }
    if (count < 1) {
      throw new Error('Count must be at least 1');
    }

    this.logger.info(`Fetching ${count} recent messages from ${channelId}, includeThreads=${includeThreads}`);

    // Fetch parent messages
    const history = await this.slack.getConversationHistory(channelId, count);
    const messages = history.messages;

    if (!includeThreads) {
      return {
        messages: messages,
        threads_fetched: false,
        parent_count: messages.length
      };
    }

    // Fetch threads for messages that have replies
    let totalApiCalls = 1; // Already made 1 call for history
    const messagesWithThreads = await Promise.all(
      messages.map(async (msg) => {
        // Enrich with user name
        const userName = await this.getUserName(msg.user);
        
        if (msg.reply_count && msg.reply_count > 0) {
          // Check cache first
          const cacheKey = `thread:${channelId}:${msg.ts}`;
          let threadData = this.cache.get(cacheKey);
          
          if (!threadData) {
            this.logger.info(`Fetching thread ${msg.ts} with ${msg.reply_count} replies`);
            
            // Fetch complete thread with automatic pagination
            const result = await this.pagination.fetchAllReplies(
              this.slack,
              channelId,
              msg.ts,
              10 // Max 10 API calls per thread
            );
            
            // Enrich replies with user names
            const enrichedReplies = await Promise.all(
              result.items.map(async (reply) => ({
                ...reply,
                user_name: await this.getUserName(reply.user)
              }))
            );
            
            threadData = {
              replies: enrichedReplies,
              truncated: result.truncated,
              api_calls: result.api_calls
            };
            
            totalApiCalls += result.api_calls;
            
            // Cache for 2 minutes
            this.cache.set(cacheKey, threadData, 120);
          } else {
            this.logger.info(`Using cached thread ${msg.ts}`);
          }
          
          return {
            ...msg,
            user_name: userName,
            is_thread_parent: true,
            thread_replies: threadData.replies,
            thread_truncated: threadData.truncated || false
          };
        }
        
        return {
          ...msg,
          user_name: userName,
          is_thread_parent: false
        };
      })
    );

    return {
      messages: messagesWithThreads,
      threads_fetched: true,
      parent_count: messages.length,
      threads_with_replies: messagesWithThreads.filter(m => m.reply_count > 0).length,
      total_api_calls: totalApiCalls
    };
  }

  /**
   * Get complete thread
   */
  async getCompleteThread(channelId, threadTs) {
    // Check whitelist for READ
    const readCheck = await this.whitelist.canReadChannel(channelId);
    if (!readCheck.allowed) {
      throw readCheck.error;
    }

    const cacheKey = `thread:${channelId}:${threadTs}`;
    let cached = this.cache.get(cacheKey);
    
    if (cached) {
      this.logger.info(`Using cached thread ${threadTs}`);
      return { ...cached, cached: true };
    }

    this.logger.info(`Fetching complete thread ${threadTs}`);

    // Fetch all replies
    const result = await this.pagination.fetchAllReplies(
      this.slack,
      channelId,
      threadTs,
      10
    );

    // First message is parent, rest are replies
    const allMessages = await this.slack.getThreadReplies(channelId, threadTs, 1);
    const parent = allMessages.messages[0];

    // Enrich with user names
    const enrichedReplies = await Promise.all(
      result.items.map(async (reply) => ({
        ...reply,
        user_name: await this.getUserName(reply.user)
      }))
    );

    const threadData = {
      parent: {
        ...parent,
        user_name: await this.getUserName(parent.user)
      },
      replies: enrichedReplies,
      reply_count: enrichedReplies.length,
      participants: [...new Set(enrichedReplies.map(r => r.user))],
      truncated: result.truncated,
      api_calls: result.api_calls + 1
    };

    // Cache for 2 minutes
    this.cache.set(cacheKey, threadData, 120);

    return { ...threadData, cached: false };
  }

  /**
   * Get user name with caching
   */
  async getUserName(userId) {
    if (!userId) return 'Unknown';
    
    const cacheKey = `user:${userId}`;
    let cached = this.cache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
      const user = await this.slack.getUserInfo(userId);
      const name = user.profile.display_name || user.name;
      this.cache.set(cacheKey, name, 300); // Cache 5 min
      return name;
    } catch (error) {
      this.logger.error(`Failed to get user ${userId}:`, error.message);
      return 'Unknown';
    }
  }

  /**
   * Send message to channel (write operation)
   */
  async sendMessage(channel, text, threadTs = null) {
    // Check if write ops enabled
    if (process.env.ENABLE_WRITE_OPS !== 'true') {
      throw {
        code: 'WRITE_OPS_DISABLED',
        message: 'Write operations are disabled. Set ENABLE_WRITE_OPS=true to enable.'
      };
    }

    // Check whitelist for WRITE
    const writeCheck = await this.whitelist.canWriteChannel(channel);
    if (!writeCheck.allowed) {
      throw writeCheck.error;
    }

    this.logger.info(`Sending message to ${channel}`, { threadTs });

    const result = await this.slack.postMessage(channel, text, threadTs);
    
    return {
      ts: result.ts,
      channel: result.channel,
      text: text,
      permalink: `https://${this.slack.teamName}.slack.com/archives/${result.channel}/p${result.ts.replace('.', '')}`
    };
  }

  /**
   * Send direct message to user (write operation)
   */
  async sendDm(userIdOrName, text, threadTs = null) {
    // Check if write ops enabled
    if (process.env.ENABLE_WRITE_OPS !== 'true') {
      throw {
        code: 'WRITE_OPS_DISABLED',
        message: 'Write operations are disabled. Set ENABLE_WRITE_OPS=true to enable.'
      };
    }

    // Check whitelist for DM
    const dmCheck = await this.whitelist.canSendDmToUser(userIdOrName);
    if (!dmCheck.allowed) {
      throw dmCheck.error;
    }

    // Resolve user ID
    const userId = await this.whitelist.resolveUserId(userIdOrName);
    if (!userId) {
      throw {
        code: 'INVALID_USER',
        message: `User '${userIdOrName}' not found`
      };
    }

    this.logger.info(`Sending DM to user ${userIdOrName} (${userId})`);

    // Open DM channel
    const dmChannel = await this.slack.client.conversations.open({ users: userId });
    const channelId = dmChannel.channel.id;

    // Send message
    const result = await this.slack.postMessage(channelId, text, threadTs);
    
    // Get user name for response
    const userName = await this.getUserName(userId);

    return {
      ts: result.ts,
      channel: channelId,
      user: userId,
      user_name: userName,
      text: text,
      permalink: `https://${this.slack.teamName}.slack.com/archives/${channelId}/p${result.ts.replace('.', '')}`
    };
  }
}

module.exports = MessageService;
```

---

#### 4. MentionService (`services/mentionService.js`)

Handles mention tracking and notification operations.

```javascript
class MentionService {
  constructor(slackClient, messageService, cacheService, logger) {
    this.slack = slackClient;
    this.messageService = messageService;
    this.cache = cacheService;
    this.logger = logger;
  }

  /**
   * Get all mentions of current user
   */
  async getAllMentions(count = 20, includeThreads = true, onlyUnread = false) {
    if (count > 50) {
      throw new Error('Maximum 50 mentions allowed per request');
    }

    const userId = this.slack.currentUserId;
    this.logger.info(`Searching mentions for user ${userId}`, { count, includeThreads, onlyUnread });

    // Search for mentions using Slack search API
    const searchQuery = `<@${userId}>`;
    const searchResults = await this.slack.searchMessages(searchQuery, count);

    // Process each mention
    const mentions = await Promise.all(
      searchResults.messages.map(async (msg) => {
        const mention = {
          message_ts: msg.ts,
          channel_id: msg.channel.id,
          channel_name: msg.channel.name,
          text: msg.text,
          user_id: msg.user,
          user_name: await this.messageService.getUserName(msg.user),
          is_thread_reply: msg.thread_ts && msg.thread_ts !== msg.ts,
          thread_ts: msg.thread_ts || null,
          permalink: msg.permalink,
          created_at: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          is_read: !msg.is_unread
        };

        // Fetch thread context if mention is in a thread
        if (includeThreads && mention.is_thread_reply) {
          try {
            const thread = await this.messageService.getCompleteThread(
              mention.channel_id,
              mention.thread_ts
            );

            // Find position of mention in thread
            const mentionPosition = thread.replies.findIndex(r => r.ts === msg.ts) + 1;

            mention.thread_context = {
              parent_message: thread.parent.text.substring(0, 100) + (thread.parent.text.length > 100 ? '...' : ''),
              reply_count: thread.reply_count,
              mention_at_reply_number: mentionPosition
            };

            mention.complete_thread = thread;
          } catch (error) {
            this.logger.error(`Failed to fetch thread ${mention.thread_ts}:`, error.message);
          }
        }

        return mention;
      })
    );

    // Filter for unread if requested
    const filteredMentions = onlyUnread ? mentions.filter(m => !m.is_read) : mentions;

    // Group by channel
    const groupedByChannel = filteredMentions.reduce((acc, mention) => {
      const channel = mention.channel_name;
      acc[channel] = (acc[channel] || 0) + 1;
      return acc;
    }, {});

    return {
      mentions: filteredMentions,
      grouped_by_channel: groupedByChannel,
      total_mentions: filteredMentions.length,
      unread_mentions: filteredMentions.filter(m => !m.is_read).length,
      threads_with_mentions: filteredMentions.filter(m => m.is_thread_reply).length
    };
  }

  /**
   * Get threads where user was mentioned
   */
  async getMentionedThreads(count = 20, onlyActive = false) {
    if (count > 50) {
      throw new Error('Maximum 50 threads allowed per request');
    }

    this.logger.info(`Fetching mentioned threads`, { count, onlyActive });

    // Get all mentions with threads
    const allMentions = await this.getAllMentions(count, true, false);

    // Filter for thread mentions only
    const threadMentions = allMentions.mentions.filter(m => m.is_thread_reply);

    // Group by unique thread
    const threadMap = new Map();

    for (const mention of threadMentions) {
      const key = `${mention.channel_id}:${mention.thread_ts}`;

      if (!threadMap.has(key)) {
        threadMap.set(key, {
          thread_ts: mention.thread_ts,
          channel_id: mention.channel_id,
          channel_name: mention.channel_name,
          parent_message: mention.complete_thread.parent,
          your_mentions: [],
          complete_thread: mention.complete_thread,
          permalink: mention.permalink.split('?')[0]
        });
      }

      const thread = threadMap.get(key);
      thread.your_mentions.push({
        reply_number: mention.thread_context.mention_at_reply_number,
        ts: mention.message_ts,
        text: mention.text,
        user_id: mention.user_id,
        user_name: mention.user_name
      });
    }

    // Convert to array and add thread stats
    let threads = Array.from(threadMap.values()).map(thread => {
      const replies = thread.complete_thread.replies;
      const participants = [...new Set(replies.map(r => r.user))];

      // Check if user participated (not just mentioned)
      const youParticipated = replies.some(r => r.user === this.slack.currentUserId);

      // Check for new activity after last mention
      const lastMentionTs = Math.max(...thread.your_mentions.map(m => parseFloat(m.ts)));
      const lastReplyTs = parseFloat(replies[replies.length - 1].ts);
      const hasNewActivity = lastReplyTs > lastMentionTs;

      return {
        ...thread,
        thread_stats: {
          total_replies: replies.length,
          participants: participants,
          participant_names: replies.map(r => r.user_name).filter((v, i, a) => a.indexOf(v) === i),
          last_reply_ts: replies[replies.length - 1].ts,
          last_reply_user: replies[replies.length - 1].user_name,
          has_new_activity: hasNewActivity,
          you_participated: youParticipated
        }
      };
    });

    // Filter for active threads if requested
    if (onlyActive) {
      threads = threads.filter(t => t.thread_stats.has_new_activity);
    }

    return {
      threads: threads,
      total_threads: threads.length,
      threads_with_new_activity: threads.filter(t => t.thread_stats.has_new_activity).length,
      total_mentions_in_threads: threads.reduce((sum, t) => sum + t.your_mentions.length, 0)
    };
  }

  /**
   * Get mentions in specific channel
   */
  async getMentionsByChannel(channelId, count = 20, includeThreads = true) {
    const userId = this.slack.currentUserId;
    this.logger.info(`Searching mentions in channel ${channelId}`);

    // Search in specific channel
    const searchQuery = `<@${userId}> in:<#${channelId}>`;
    const searchResults = await this.slack.searchMessages(searchQuery, count);

    // Reuse the mention processing logic
    // ... similar to getAllMentions but filtered to one channel
    
    return {
      mentions: [], // processed mentions
      channel_id: channelId,
      count: searchResults.total
    };
  }

  /**
   * Get unread mentions
   */
  async getUnreadMentions(includeThreads = true, groupByChannel = true) {
    this.logger.info(`Fetching unread mentions`);

    const allMentions = await this.getAllMentions(50, includeThreads, false);
    const unreadMentions = allMentions.mentions.filter(m => !m.is_read);

    const byChannel = groupByChannel
      ? unreadMentions.reduce((acc, m) => {
          acc[m.channel_name] = (acc[m.channel_name] || 0) + 1;
          return acc;
        }, {})
      : null;

    return {
      mentions: unreadMentions,
      count: unreadMentions.length,
      by_channel: byChannel
    };
  }
}

module.exports = MentionService;
```

---

#### 5. CacheService (`services/cacheService.js`)

Simple in-memory caching with TTL.

```javascript
const NodeCache = require('node-cache');

class CacheService {
  constructor(logger) {
    this.cache = new NodeCache({
      stdTTL: 300, // Default 5 minutes
      checkperiod: 60, // Check for expired keys every 60 seconds
      useClones: false // Better performance
    });
    this.logger = logger;
  }

  /**
   * Get value from cache
   */
  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }
    return value;
  }

  /**
   * Set value in cache with optional TTL
   */
  set(key, value, ttl = null) {
    const success = ttl 
      ? this.cache.set(key, value, ttl)
      : this.cache.set(key, value);
    
    if (success) {
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl || 'default'}s)`);
    }
    return success;
  }

  /**
   * Delete from cache
   */
  delete(key) {
    const count = this.cache.del(key);
    this.logger.debug(`Cache DEL: ${key} (deleted: ${count})`);
    return count > 0;
  }

  /**
   * Clear all cache
   */
  flush() {
    this.cache.flushAll();
    this.logger.info('Cache flushed');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

module.exports = CacheService;
```

---

#### 6. WhitelistService (`services/whitelistService.js`)

Manages channel and user whitelists for read/write operations.

```javascript
class WhitelistService {
  constructor(slackClient, logger) {
    this.slack = slackClient;
    this.logger = logger;
    this.enforce = process.env.ENFORCE_WHITELIST !== 'false'; // Default true
    
    // Parse whitelists from environment
    this.allowedReadChannels = this.parseList(process.env.ALLOWED_READ_CHANNELS);
    this.allowedWriteChannels = this.parseList(process.env.ALLOWED_WRITE_CHANNELS);
    this.allowedDmUsers = this.parseList(process.env.ALLOWED_DM_USERS);
    
    // Cache for resolved channel/user IDs
    this.channelIdCache = new Map();
    this.userIdCache = new Map();
    
    this.logWhitelistConfig();
  }

  /**
   * Parse comma-separated list from env var
   */
  parseList(envVar) {
    if (!envVar || envVar.trim() === '') {
      return [];
    }
    return envVar.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * Log whitelist configuration on startup
   */
  logWhitelistConfig() {
    this.logger.info('Whitelist Configuration:', {
      enforce: this.enforce,
      allowedReadChannels: this.allowedReadChannels.length > 0 ? this.allowedReadChannels : 'ALL',
      allowedWriteChannels: this.allowedWriteChannels.length > 0 ? this.allowedWriteChannels : 'NONE',
      allowedDmUsers: this.allowedDmUsers.length > 0 ? this.allowedDmUsers : 'NONE'
    });
  }

  /**
   * Resolve channel name to ID
   */
  async resolveChannelId(channelIdOrName) {
    // If already looks like an ID (starts with C or D), return as-is
    if (/^[CD][A-Z0-9]+$/.test(channelIdOrName)) {
      return channelIdOrName;
    }

    // Check cache
    if (this.channelIdCache.has(channelIdOrName)) {
      return this.channelIdCache.get(channelIdOrName);
    }

    // Fetch all channels and find by name
    try {
      const result = await this.slack.listChannels();
      const channel = result.channels.find(
        c => c.name === channelIdOrName || c.name_normalized === channelIdOrName
      );

      if (channel) {
        this.channelIdCache.set(channelIdOrName, channel.id);
        return channel.id;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to resolve channel ${channelIdOrName}:`, error.message);
      return null;
    }
  }

  /**
   * Resolve username to user ID
   */
  async resolveUserId(userIdOrName) {
    // If already looks like an ID (starts with U), return as-is
    if (/^U[A-Z0-9]+$/.test(userIdOrName)) {
      return userIdOrName;
    }

    // Check cache
    if (this.userIdCache.has(userIdOrName)) {
      return this.userIdCache.get(userIdOrName);
    }

    // Fetch all users and find by name
    try {
      const result = await this.slack.listUsers();
      const user = result.users.find(
        u => u.name === userIdOrName || u.profile?.display_name === userIdOrName
      );

      if (user) {
        this.userIdCache.set(userIdOrName, user.id);
        return user.id;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to resolve user ${userIdOrName}:`, error.message);
      return null;
    }
  }

  /**
   * Check if channel is allowed for READ operations
   */
  async canReadChannel(channelIdOrName) {
    // If no whitelist configured, allow all
    if (this.allowedReadChannels.length === 0) {
      return { allowed: true };
    }

    const channelId = await this.resolveChannelId(channelIdOrName);
    
    // Check if channel ID or name is in whitelist
    const isAllowed = this.allowedReadChannels.includes(channelId) || 
                      this.allowedReadChannels.includes(channelIdOrName);

    if (!isAllowed && this.enforce) {
      this.logger.warn(`READ blocked - Channel not whitelisted: ${channelIdOrName}`);
      return {
        allowed: false,
        error: {
          code: 'CHANNEL_NOT_WHITELISTED',
          message: `Channel '${channelIdOrName}' is not in ALLOWED_READ_CHANNELS whitelist`,
          details: {
            channel: channelIdOrName,
            whitelisted_channels: this.allowedReadChannels
          }
        }
      };
    }

    if (!isAllowed) {
      this.logger.warn(`READ allowed (enforce=false) - Channel not whitelisted: ${channelIdOrName}`);
    }

    return { allowed: true };
  }

  /**
   * Check if channel is allowed for WRITE operations
   */
  async canWriteChannel(channelIdOrName) {
    // If no whitelist configured, block all writes
    if (this.allowedWriteChannels.length === 0) {
      return {
        allowed: false,
        error: {
          code: 'CHANNEL_NOT_WHITELISTED',
          message: 'No channels whitelisted for write operations. Configure ALLOWED_WRITE_CHANNELS.',
          details: {
            channel: channelIdOrName,
            whitelisted_channels: []
          }
        }
      };
    }

    const channelId = await this.resolveChannelId(channelIdOrName);
    
    // Check if channel ID or name is in whitelist
    const isAllowed = this.allowedWriteChannels.includes(channelId) || 
                      this.allowedWriteChannels.includes(channelIdOrName);

    if (!isAllowed) {
      this.logger.warn(`WRITE blocked - Channel not whitelisted: ${channelIdOrName}`);
      return {
        allowed: false,
        error: {
          code: 'CHANNEL_NOT_WHITELISTED',
          message: `Channel '${channelIdOrName}' is not in ALLOWED_WRITE_CHANNELS whitelist`,
          details: {
            channel: channelIdOrName,
            channel_id: channelId,
            whitelisted_channels: this.allowedWriteChannels
          }
        }
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user is allowed to receive DMs
   */
  async canSendDmToUser(userIdOrName) {
    // If no whitelist configured, block all DMs
    if (this.allowedDmUsers.length === 0) {
      return {
        allowed: false,
        error: {
          code: 'USER_NOT_WHITELISTED',
          message: 'No users whitelisted for DMs. Configure ALLOWED_DM_USERS.',
          details: {
            user: userIdOrName,
            whitelisted_users: []
          }
        }
      };
    }

    const userId = await this.resolveUserId(userIdOrName);
    
    // Check if user ID or name is in whitelist
    const isAllowed = this.allowedDmUsers.includes(userId) || 
                      this.allowedDmUsers.includes(userIdOrName);

    if (!isAllowed) {
      this.logger.warn(`DM blocked - User not whitelisted: ${userIdOrName}`);
      return {
        allowed: false,
        error: {
          code: 'USER_NOT_WHITELISTED',
          message: `User '${userIdOrName}' is not in ALLOWED_DM_USERS whitelist`,
          details: {
            user: userIdOrName,
            user_id: userId,
            whitelisted_users: this.allowedDmUsers
          }
        }
      };
    }

    return { allowed: true };
  }

  /**
   * Get whitelist status (for debugging/admin endpoints)
   */
  getStatus() {
    return {
      enforce: this.enforce,
      read_channels: {
        configured: this.allowedReadChannels.length > 0,
        count: this.allowedReadChannels.length,
        channels: this.allowedReadChannels
      },
      write_channels: {
        configured: this.allowedWriteChannels.length > 0,
        count: this.allowedWriteChannels.length,
        channels: this.allowedWriteChannels
      },
      dm_users: {
        configured: this.allowedDmUsers.length > 0,
        count: this.allowedDmUsers.length,
        users: this.allowedDmUsers
      }
    };
  }
}

module.exports = WhitelistService;
```

---

## 📊 Response Formats

### Standard Success Response
```json
{
  "success": true,
  "data": {
    // Actual response data
  },
  "meta": {
    "timestamp": "2024-02-19T10:30:00Z",
    "cached": false,
    "api_calls_made": 3,
    "truncated": false
  }
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Optional additional context
    }
  },
  "meta": {
    "timestamp": "2024-02-19T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `SLACK_AUTH_FAILED` | 401 | Slack token/cookie invalid |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INVALID_CHANNEL` | 404 | Channel not found |
| `INVALID_USER` | 404 | User not found |
| `INVALID_MESSAGE` | 404 | Message not found |
| `INVALID_THREAD` | 404 | Thread not found |
| `CHANNEL_NOT_WHITELISTED` | 403 | Channel not in ALLOWED_READ_CHANNELS or ALLOWED_WRITE_CHANNELS |
| `USER_NOT_WHITELISTED` | 403 | User not in ALLOWED_DM_USERS |
| `WRITE_OPS_DISABLED` | 403 | Write operation attempted when disabled |
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `SLACK_API_ERROR` | 502 | Slack API returned error |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## 💾 Caching Strategy

### Cache Keys Format
```
thread:{channelId}:{threadTs}
user:{userId}
channel_list:{teamId}
user_list:{teamId}
workspace:{teamId}
auth_test
```

### Cache TTL (Time To Live)

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Channel list | 5 min | Rarely changes |
| User list | 5 min | Rarely changes |
| User profile | 5 min | Rarely changes |
| Workspace info | 10 min | Very stable |
| Thread replies | 2 min | More dynamic |
| Auth test | 5 min | Validation check |

### When NOT to Cache
- Recent messages (always fresh)
- Search results (always fresh)
- Unread counts (always fresh)
- Mention notifications (always fresh)

---

## 🔐 Security Requirements

### 1. API Key Authentication

All endpoints require `X-API-Key` header:

```javascript
// middleware/auth.js
const auth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Provide X-API-Key header.'
      }
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
  }

  next();
};
```

### 2. Rate Limiting

Implement per-IP rate limiting:

```javascript
// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = limiter;
```

### 3. Security Headers

Use Helmet.js:

```javascript
const helmet = require('helmet');
app.use(helmet());
```

### 4. Token Safety

**NEVER log full tokens:**
```javascript
// Bad
logger.info('Using token:', slackToken);

// Good
logger.info('Using token:', slackToken.substring(0, 8) + '...');
```

**Never return tokens in responses:**
```javascript
// Bad
res.json({ token: slackToken });

// Good - Never expose tokens
```

### 5. Input Validation

Validate all inputs:

```javascript
const { query, validationResult } = require('express-validator');

router.get('/channels/:channelId/recent-messages',
  [
    query('count').optional().isInt({ min: 1, max: 10 }),
    query('includeThreads').optional().isBoolean()
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          details: errors.array()
        }
      });
    }
    next();
  },
  channelController.getRecentMessages
);
```

### 6. CORS

Disable CORS (localhost only):
```javascript
// No CORS middleware - service is localhost-only
```

### 7. Read-Only Filesystem

Container runs with read-only root filesystem:
```yaml
read_only: true
tmpfs:
  - /tmp
```

---

## 🐳 Docker Setup

### Dockerfile

```dockerfile
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY --chown=nodejs:nodejs src/ ./src/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "src/server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  slack-proxy:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: slack-readonly-proxy
    
    # Bind to localhost only
    ports:
      - "127.0.0.1:3000:3000"
    
    # Load environment from .env file
    env_file:
      - .env
    
    # Restart policy
    restart: unless-stopped
    
    # Security options
    security_opt:
      - no-new-privileges:true
    
    # Read-only root filesystem
    read_only: true
    tmpfs:
      - /tmp
      - /app/node_modules/.cache
    
    # Logging
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    
    # Health check
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

---

## 🚀 Deployment Script

### deploy.sh

```bash
#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Slack Read-Only Proxy Deployment Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file${NC}"
    else
        echo -e "${RED}❌ .env.example not found!${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${YELLOW}📝 Please edit .env file and configure the following:${NC}"
    echo ""
    echo "   Required (choose ONE method):"
    echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   Method A (Cookie-based):"
    echo "     • SLACK_COOKIE=xoxd-..."
    echo "     • SLACK_TOKEN=xoxc-..."
    echo ""
    echo "   Method B (Bot token):"
    echo "     • SLACK_BOT_TOKEN=xoxb-..."
    echo ""
    echo "   Also required:"
    echo "     • API_KEY=<generate-random-string>"
    echo ""
    echo -e "${BLUE}Run this script again after updating .env${NC}"
    exit 0
fi

echo -e "${GREEN}✓ Found .env file${NC}"

# Load environment variables
source .env

# Validate required variables
echo ""
echo "🔍 Validating environment variables..."

VALIDATION_FAILED=false

# Check API_KEY
if [ -z "$API_KEY" ] || [ "$API_KEY" = "generate-random-32-char-string-here" ]; then
    echo -e "${RED}❌ API_KEY not set or using default value${NC}"
    VALIDATION_FAILED=true
fi

# Check Slack credentials
if [ -z "$SLACK_BOT_TOKEN" ]; then
    # Bot token not set, check cookie method
    if [ -z "$SLACK_COOKIE" ] || [ -z "$SLACK_TOKEN" ]; then
        echo -e "${RED}❌ No valid Slack credentials found${NC}"
        echo "   Set either:"
        echo "     • SLACK_BOT_TOKEN (for approved apps)"
        echo "     • SLACK_COOKIE + SLACK_TOKEN (for personal use)"
        VALIDATION_FAILED=true
    else
        echo -e "${GREEN}✓ Using cookie-based authentication${NC}"
    fi
else
    echo -e "${GREEN}✓ Using bot token authentication${NC}"
fi

if [ "$VALIDATION_FAILED" = true ]; then
    echo ""
    echo -e "${RED}❌ Validation failed. Please update .env file.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All required environment variables are set${NC}"

# Build Docker image
echo ""
echo "🔨 Building Docker image..."
docker-compose build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"

# Stop existing container
echo ""
echo "🛑 Stopping existing container (if any)..."
docker-compose down

# Start new container
echo ""
echo "🚀 Starting container..."
docker-compose up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start container${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Container started${NC}"

# Wait for health check
echo ""
echo "⏳ Waiting for service to be healthy..."
for i in {1..30}; do
    if docker-compose ps | grep -q "healthy"; then
        echo -e "${GREEN}✓ Service is healthy!${NC}"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Service failed to become healthy after 60 seconds${NC}"
        echo ""
        echo "📋 Recent logs:"
        docker-compose logs --tail=50
        exit 1
    fi
    
    sleep 2
    echo -n "."
done

# Show recent logs
echo ""
echo "📋 Recent logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose logs --tail=20

# Success message
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📍 Service Details:${NC}"
echo "   • URL: http://localhost:3000"
echo "   • Health Check: http://localhost:3000/health"
echo "   • API Key: ${API_KEY:0:8}...${API_KEY: -4}"
echo ""
echo -e "${BLUE}🧪 Quick Test:${NC}"
echo "   curl -H \"X-API-Key: $API_KEY\" http://localhost:3000/health"
echo ""
echo -e "${BLUE}📚 Common Commands:${NC}"
echo "   • View logs:    docker-compose logs -f"
echo "   • Stop service: docker-compose down"
echo "   • Restart:      docker-compose restart"
echo "   • Rebuild:      ./deploy.sh"
echo ""
echo -e "${BLUE}📖 Full API documentation in README.md${NC}"
echo ""
```

Make script executable:
```bash
chmod +x deploy.sh
```

---

## ⚙️ Environment Configuration

### .env.example

```bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Slack Personal Proxy - Environment Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ┌─────────────────────────────────────────────────────────┐
# │ SLACK AUTHENTICATION (Required - choose ONE method)     │
# └─────────────────────────────────────────────────────────┘

# Method A: Cookie-based (for personal use without approved app)
# Get these from browser DevTools while logged into Slack:
# 1. SLACK_COOKIE: DevTools → Application → Cookies → 'd' value
# 2. SLACK_TOKEN: DevTools → Network → Any API request → Auth header (xoxc-...)
SLACK_COOKIE=xoxd-your-cookie-here
SLACK_TOKEN=xoxc-your-token-here

# Method B: Bot Token (when you have an approved Slack App)
# Get this from https://api.slack.com/apps → Your App → OAuth & Permissions
# SLACK_BOT_TOKEN=xoxb-your-bot-token-here

# ┌─────────────────────────────────────────────────────────┐
# │ API CONFIGURATION (Required)                            │
# └─────────────────────────────────────────────────────────┘

# Port for the service
PORT=3000

# Environment
NODE_ENV=production

# API Key for authentication (generate a secure random string)
# Generate with: openssl rand -hex 32
API_KEY=generate-random-32-char-string-here

# ┌─────────────────────────────────────────────────────────┐
# │ FEATURE FLAGS                                           │
# └─────────────────────────────────────────────────────────┘

# Enable write operations (POST messages)
# WARNING: This allows the API to send messages on your behalf
ENABLE_WRITE_OPS=false

# Enable caching (recommended for better performance)
ENABLE_CACHING=true

# ┌─────────────────────────────────────────────────────────┐
# │ CHANNEL & USER WHITELISTS (Security)                    │
# └─────────────────────────────────────────────────────────┘

# Whitelist channels for READ operations (comma-separated)
# Leave empty to allow ALL channels
# Examples: C12345,C67890 or engineering,general
# Supports both channel IDs and channel names
ALLOWED_READ_CHANNELS=

# Whitelist channels for WRITE operations (comma-separated)
# IMPORTANT: Even if ENABLE_WRITE_OPS=true, messages can only be sent to these channels
# Leave empty to block ALL write operations (recommended)
# Examples: C12345,testing or bot-testing,sandbox
ALLOWED_WRITE_CHANNELS=

# Whitelist users for SENDING DMs (comma-separated)
# User IDs or usernames that can receive DMs from this proxy
# Leave empty to block ALL DMs (recommended)
# Examples: U12345,U67890 or alice,bob
ALLOWED_DM_USERS=

# Enforce whitelist strictly
# If true: Returns 403 for non-whitelisted channels/users
# If false: Logs warning but allows (not recommended)
ENFORCE_WHITELIST=true

# ┌─────────────────────────────────────────────────────────┐
# │ RATE LIMITING                                           │
# └─────────────────────────────────────────────────────────┘

# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_WINDOW_MS=60000

# Maximum requests per window (default: 100)
RATE_LIMIT_MAX_REQUESTS=100

# ┌─────────────────────────────────────────────────────────┐
# │ WRAPPER BEHAVIOR                                        │
# └─────────────────────────────────────────────────────────┘

# Maximum parent messages to fetch (default: 5, max: 10)
MAX_PARENT_MESSAGES=5

# Safety limit for auto-pagination (default: 10)
# Prevents infinite loops if Slack API misbehaves
MAX_PAGINATION_CALLS=10

# Cache TTL in seconds (default: 300 = 5 minutes)
CACHE_TTL_SECONDS=300

# Thread-specific cache TTL in seconds (default: 120 = 2 minutes)
THREAD_CACHE_TTL_SECONDS=120

# Auto-fetch threads by default (default: true)
DEFAULT_INCLUDE_THREADS=true

# ┌─────────────────────────────────────────────────────────┐
# │ MENTION TRACKING                                        │
# └─────────────────────────────────────────────────────────┘

# Maximum mentions to fetch in one request (default: 50)
MAX_MENTIONS_FETCH=50

# Cache mentions for this many seconds (default: 120 = 2 minutes)
MENTION_CACHE_TTL_SECONDS=120

# ┌─────────────────────────────────────────────────────────┐
# │ LOGGING                                                 │
# └─────────────────────────────────────────────────────────┘

# Log level: error, warn, info, debug (default: info)
LOG_LEVEL=info

# Pretty print logs in development (default: false in production)
LOG_PRETTY=false
```

### .gitignore

```gitignore
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/

# Logs
logs/
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Docker
.dockerignore

# Temp
tmp/
temp/
```

---

## 🧪 Testing Requirements

### package.json

```json
{
  "name": "slack-readonly-proxy",
  "version": "1.0.0",
  "description": "Secure REST API proxy for Slack with intelligent wrapper methods",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:integration": "jest --testPathPattern=integration",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix"
  },
  "keywords": ["slack", "api", "proxy", "rest"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@slack/web-api": "^7.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "express-validator": "^7.0.0",
    "helmet": "^7.0.0",
    "node-cache": "^5.1.2",
    "winston": "^3.11.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.0",
    "nodemon": "^3.0.0",
    "eslint": "^8.54.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Example Test

```javascript
// tests/integration/api/mentions.test.js
const request = require('supertest');
const app = require('../../../src/server');

describe('Mentions API', () => {
  const apiKey = process.env.API_KEY;

  describe('GET /api/mentions/all', () => {
    it('should return mentions for authenticated user', async () => {
      const res = await request(app)
        .get('/api/mentions/all?count=5')
        .set('X-API-Key', apiKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('mentions');
      expect(Array.isArray(res.body.data.mentions)).toBe(true);
      expect(res.body.data.mentions.length).toBeLessThanOrEqual(5);
    });

    it('should require API key', async () => {
      const res = await request(app)
        .get('/api/mentions/all');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate count parameter', async () => {
      const res = await request(app)
        .get('/api/mentions/all?count=100')
        .set('X-API-Key', apiKey);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

---

## 📖 Documentation Requirements

### README.md Structure

Create comprehensive README with these sections:

1. **Project Overview**
   - What it does
   - Key features
   - Use cases

2. **Quick Start**
   ```bash
   # 1. Clone repository
   git clone <repo>
   cd slack-readonly-proxy
   
   # 2. Run deployment script
   ./deploy.sh
   
   # 3. Follow prompts to configure .env
   
   # 4. Test it works
   curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/health
   ```

3. **Getting Slack Credentials**
   - Detailed steps with screenshots
   - Both cookie-based and bot token methods

4. **API Documentation**
   - All endpoints with examples
   - Request/response formats
   - Error codes

5. **Architecture**
   - System diagram
   - Component overview
   - Data flow

6. **Security**
   - Authentication
   - Rate limiting
   - Token safety

7. **Troubleshooting**
   - Common issues and solutions

8. **Development**
   - How to contribute
   - Running tests
   - Code structure

---

## 🎯 Acceptance Criteria Checklist

- [ ] `./deploy.sh` successfully builds and starts service
- [ ] All read endpoints work correctly
- [ ] Mention tracking endpoints return accurate data
- [ ] Thread fetching is automatic when enabled
- [ ] Pagination is handled internally (no user-facing complexity)
- [ ] Hard limits enforced (5 parent messages default, max 10)
- [ ] Caching reduces redundant API calls
- [ ] API key authentication works
- [ ] Rate limiting returns 429 after limit
- [ ] Health check returns valid status
- [ ] Logs are readable and don't expose tokens
- [ ] Send message endpoint exists but disabled by default
- [ ] Send DM endpoint requires whitelist
- [ ] Channel whitelist enforced for read operations (if configured)
- [ ] Channel whitelist enforced for write operations (always required if write enabled)
- [ ] User whitelist enforced for DM operations (always required if write enabled)
- [ ] Whitelist accepts both IDs and names (auto-resolves)
- [ ] Admin endpoint shows whitelist status
- [ ] No tokens/secrets in logs or responses
- [ ] Container restarts automatically if crashed
- [ ] Complete thread replies regardless of pagination
- [ ] User ID automatically detected on startup
- [ ] README has clear setup instructions
- [ ] All service methods have JSDoc comments
- [ ] Error messages are helpful and actionable

---

## 📝 Additional Notes

### Code Quality Standards

1. **Use async/await** (not callbacks)
2. **Add JSDoc comments** for all public methods
3. **Validate all inputs** before processing
4. **Log important operations** (but never tokens)
5. **Handle errors gracefully** with helpful messages
6. **Keep functions focused** (single responsibility)
7. **Use descriptive variable names**
8. **Add comments for complex logic**

### Production Readiness

1. **Graceful shutdown** - Handle SIGTERM properly
2. **Health checks** - Return 200 only when truly healthy
3. **Structured logging** - Use Winston with JSON format
4. **Error tracking** - Log errors with context
5. **Monitoring ready** - Consider Prometheus metrics
6. **Documentation** - Keep README up to date

### Example server.js Entry Point

```javascript
// src/server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');

const logger = require('./utils/logger');
const SlackClient = require('./clients/slackClient');
const CacheService = require('./services/cacheService');
const PaginationService = require('./services/paginationService');
const MessageService = require('./services/messageService');
const MentionService = require('./services/mentionService');

const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const routes = require('./routes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(express.json());
app.use(rateLimiter);

// Initialize services
let slackClient;
let services = {};

async function initializeServices() {
  logger.info('Initializing services...');
  
  slackClient = new SlackClient();
  await slackClient.initialize();
  
  const cacheService = new CacheService(logger);
  const whitelistService = new WhitelistService(slackClient, logger);
  const paginationService = new PaginationService(logger);
  const messageService = new MessageService(slackClient, cacheService, paginationService, whitelistService, logger);
  const mentionService = new MentionService(slackClient, messageService, cacheService, logger);
  
  services = {
    slack: slackClient,
    cache: cacheService,
    whitelist: whitelistService,
    pagination: paginationService,
    message: messageService,
    mention: mentionService
  };
  
  logger.info('✓ All services initialized');
}

// Make services available to routes
app.use((req, res, next) => {
  req.services = services;
  next();
});

// Health check (no auth required)
app.get('/health', async (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    uptime: Math.floor(uptime),
    memory_usage_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
    slack_auth: slackClient ? 'valid' : 'not_initialized',
    slack_team: slackClient?.teamName,
    timestamp: new Date().toISOString()
  });
});

// API routes (with auth)
app.use('/api', authMiddleware, routes);

// Error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start server
let server;
initializeServices()
  .then(() => {
    server = app.listen(port, '0.0.0.0', () => {
      logger.info(`✓ Server listening on port ${port}`);
      logger.info(`✓ Health check: http://localhost:${port}/health`);
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  });

module.exports = app; // For testing
```

---

## 🎉 Final Notes

This specification provides everything needed to build a production-ready Slack proxy with intelligent wrapper methods. The coder should:

1. Follow the layered architecture strictly
2. Implement all service classes as specified
3. Handle pagination automatically
4. Cache intelligently
5. Log properly (never expose tokens)
6. Test thoroughly
7. Document clearly

The result should be a secure, maintainable service that makes Slack's API simple to use while handling all the complexity internally.

**Good luck! 🚀**