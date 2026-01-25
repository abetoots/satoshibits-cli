---
name: error-handling
description: Comprehensive error tracking, logging, and validation patterns
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---

# Error Handling & Logging Guidelines

## Purpose

This skill provides battle-tested patterns for error handling, logging, and validation across {{PROJECT_NAME}}. Proper error handling prevents silent failures, enables debugging, and improves user experience.

## When This Skill Activates

This skill automatically activates when you:
- Mention keywords: error, exception, logging, Sentry, validation, try-catch
- Ask about error handling or debugging best practices
- Work with code containing try-catch blocks, error throwing, or logging
- Implement validation or error tracking

## Core Principles

### 1. Never Swallow Errors

**❌ BAD**: Silent failure

```typescript
try {
  await api.createUser(data);
} catch (error) {
  // Error disappears, no one knows what failed
}
```

**✅ GOOD**: Log and handle

```typescript
try {
  await api.createUser(data);
} catch (error) {
  captureException(error, {
    tags: { operation: 'createUser' },
    extra: { userData: data }
  });
  throw error; // Re-throw or handle gracefully
}
```

**Key Principles**:
- Every catch block must log the error
- Provide context (what operation, what data)
- Decide: re-throw or return error state

### 2. Error Tracking with {{ERROR_TRACKER}}

**Setup** (backend):

```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    return event;
  }
});

export function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: { id: string; email: string };
  }
) {
  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    user: context?.user
  });
}
```

**Setup** (frontend):

```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [new BrowserTracing()],
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Don't send errors in development
    if (import.meta.env.DEV) {
      return null;
    }
    return event;
  }
});
```

### 3. Contextual Error Logging

**Bad**: Generic error messages

```typescript
catch (error) {
  captureException(error); // What failed? Where? Why?
}
```

**Good**: Rich context

```typescript
catch (error) {
  captureException(error, {
    tags: {
      operation: 'createUser',
      userId: user.id,
      source: 'UserService'
    },
    extra: {
      requestData: {
        email: data.email,
        name: data.name
        // Don't log passwords!
      },
      timestamp: new Date().toISOString()
    },
    user: {
      id: currentUser.id,
      email: currentUser.email
    }
  });
}
```

**Key Information to Include**:
- **tags**: High-cardinality data for filtering (userId, operation, endpoint)
- **extra**: Detailed context (request data, state)
- **user**: Who experienced the error
- **breadcrumbs**: User actions leading to error (Sentry auto-captures)

### 4. Structured Logging

**Using {{LOGGER}} (Backend)**:

```typescript
// src/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Usage
logger.info('User created', { userId: user.id, email: user.email });
logger.error('Failed to create user', { error, data });
```

**Log Levels**:
- **error**: Something failed, needs attention
- **warn**: Potential issue, may need investigation
- **info**: General operational events
- **debug**: Detailed diagnostic information

### 5. API Error Handling

**Backend Controller Pattern**:

```typescript
// src/api/controllers/UserController.ts
import { Request, Response, NextFunction } from 'express';
import { captureException } from '../../lib/sentry';
import { logger } from '../../lib/logger';

export class UserController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.create(req.body);

      logger.info('User created successfully', {
        userId: user.id,
        email: user.email
      });

      res.status(201).json({ data: user });
    } catch (error) {
      // Log with context
      logger.error('User creation failed', {
        error,
        requestBody: req.body,
        userId: req.user?.id
      });

      // Capture in Sentry
      captureException(error as Error, {
        tags: {
          operation: 'createUser',
          endpoint: '/api/users'
        },
        extra: {
          requestBody: req.body
        },
        user: req.user ? {
          id: req.user.id,
          email: req.user.email
        } : undefined
      });

      // Pass to error middleware
      next(error);
    }
  };
}
```

**Global Error Middleware**:

```typescript
// src/api/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { captureException } from '../../lib/sentry';
import { logger } from '../../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error
  logger.error('Request failed', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Capture in Sentry (if not already captured)
  if (!err.logged) {
    captureException(err, {
      tags: {
        endpoint: req.path,
        method: req.method
      },
      user: req.user
    });
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  // Default 500 error
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
}
```

### 6. Frontend Error Boundaries

**React Error Boundary**:

```typescript
// src/components/ErrorBoundary/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { captureException } from '../../lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, {
      tags: { source: 'ErrorBoundary' },
      extra: {
        componentStack: errorInfo.componentStack
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div>
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  );
}
```

### 7. Async Error Handling

**Promises**:

```typescript
// ❌ BAD: Unhandled rejection
async function fetchUser(id: string) {
  const user = await api.getUser(id); // Might throw
  return user;
}

// ✅ GOOD: Explicit error handling
async function fetchUser(id: string) {
  try {
    const user = await api.getUser(id);
    return { data: user, error: null };
  } catch (error) {
    captureException(error as Error, {
      tags: { operation: 'fetchUser', userId: id }
    });
    return { data: null, error: error as Error };
  }
}

// Usage
const { data, error } = await fetchUser('123');
if (error) {
  // Handle error
}
```

**Global Unhandled Rejection Handler** (Backend):

```typescript
// src/server.ts
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  captureException(new Error(`Unhandled Rejection: ${reason}`));

  // Graceful shutdown
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  captureException(error);

  // Graceful shutdown
  process.exit(1);
});
```

## Validation Patterns

### Using Zod for Type-Safe Validation

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(100)
});

// Type inference
type CreateUserInput = z.infer<typeof createUserSchema>;

// Validation
function createUser(data: unknown) {
  try {
    const validated = createUserSchema.parse(data);
    // validated is type-safe CreateUserInput
    return userService.create(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      captureException(new Error('Validation failed'), {
        tags: { type: 'validation' },
        extra: { errors: error.errors, data }
      });

      return {
        error: 'Validation failed',
        details: error.errors
      };
    }
    throw error;
  }
}
```

## Quick Reference

### Error Handling Checklist
- [ ] Every catch block logs the error
- [ ] Context added (tags, extra, user)
- [ ] Sensitive data filtered (passwords, tokens)
- [ ] Decide: re-throw or return error state
- [ ] User-friendly error messages (no stack traces to users)
- [ ] Frontend: Error boundaries for component crashes
- [ ] Backend: Global error middleware
- [ ] Async: Unhandled rejection handlers

### What to Log
**✅ DO log**:
- Error message and stack trace
- Operation that failed
- User ID (who experienced it)
- Request data (sanitized)
- Timestamp and environment

**❌ DON'T log**:
- Passwords
- API keys / tokens
- Credit card numbers
- Personal identifiable information (PII) without consent

### Sentry Best Practices
- Use `beforeSend` to filter sensitive data
- Set appropriate sample rates (don't capture 100% in production)
- Use tags for high-cardinality data (userId, endpoint)
- Use extra for detailed context
- Set user context when available
- Create releases for source map support

### Testing Error Handling
```typescript
// Unit test
it('should handle errors gracefully', async () => {
  const service = new UserService();

  // Mock to throw error
  jest.spyOn(api, 'createUser').mockRejectedValue(new Error('API error'));

  const result = await service.create(data);

  expect(result.error).toBeDefined();
  expect(captureException).toHaveBeenCalled();
});
```

## Related Resources

For deeper dives into specific topics, see the resources directory (auto-created during skill installation).
