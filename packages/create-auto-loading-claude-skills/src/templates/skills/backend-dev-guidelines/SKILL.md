---
name: backend-dev-guidelines
description: Express/TypeScript/Prisma patterns for building scalable backend APIs
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---

# Backend Development Guidelines

## Purpose

This skill provides battle-tested patterns for building production-ready backend APIs with {{BACKEND_FRAMEWORK}}, TypeScript, and {{DATABASE_ORM}}. It emphasizes code organization, error handling, validation, and scalability.

## When This Skill Activates

This skill automatically activates when you:
- Mention keywords: controller, service, route, API, endpoint, database, Prisma, Express
- Ask about backend architecture or best practices
- Edit files in: `src/api/`, `backend/`, `services/`, `routes/`, `controllers/`
- Work with code that imports Express, Prisma, or database clients

## Core Architecture Patterns

### 1. Three-Layer Architecture

```
├── routes/          # HTTP route definitions (thin layer)
├── controllers/     # Request/response handling + validation
├── services/        # Business logic (reusable)
└── repositories/    # Data access ({{DATABASE_ORM}})
```

**Why**: Separation of concerns enables testing, reusability, and maintainability.

### 2. Route Layer (Thin Routing)

**Purpose**: Define HTTP endpoints and attach middleware

```typescript
// src/api/routes/users.ts
import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new UserController();

router.get('/', authenticate, controller.list);
router.get('/:id', authenticate, controller.getById);
router.post('/', authenticate, validateRequest(createUserSchema), controller.create);
router.put('/:id', authenticate, validateRequest(updateUserSchema), controller.update);
router.delete('/:id', authenticate, controller.delete);

export default router;
```

**Key Principles**:
- Routes are declarative (no business logic)
- Middleware chains for cross-cutting concerns
- Consistent REST conventions (GET/POST/PUT/DELETE)

### 3. Controller Layer (Request/Response)

**Purpose**: Handle HTTP concerns, delegate to services

```typescript
// src/api/controllers/UserController.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';
import { captureException } from '@sentry/node';

export class UserController {
  private userService = new UserService();

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await this.userService.list({
        page: Number(page),
        limit: Number(limit)
      });

      res.json({
        data: result.items,
        pagination: result.pagination
      });
    } catch (error) {
      captureException(error);
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.getById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ data: user });
    } catch (error) {
      captureException(error);
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.create(req.body);
      res.status(201).json({ data: user });
    } catch (error) {
      captureException(error);
      next(error);
    }
  };
}
```

**Key Principles**:
- Controllers never contain business logic
- Always wrap in try/catch with {{ERROR_TRACKER}}
- Return consistent response format: `{ data: ..., error: ... }`
- Use proper HTTP status codes (200, 201, 404, 400, 500)
- Delegate to `next(error)` for error middleware

### 4. Service Layer (Business Logic)

**Purpose**: Implement business rules, orchestrate repositories

```typescript
// src/api/services/UserService.ts
import { UserRepository } from '../repositories/UserRepository';
import { hash } from 'bcrypt';

export class UserService {
  private userRepo = new UserRepository();

  async list(params: { page: number; limit: number }) {
    const offset = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.userRepo.findMany({ skip: offset, take: params.limit }),
      this.userRepo.count()
    ]);

    return {
      items,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit)
      }
    };
  }

  async getById(id: string) {
    return this.userRepo.findById(id);
  }

  async create(data: { email: string; password: string; name: string }) {
    // Business rule: hash passwords
    const hashedPassword = await hash(data.password, 10);

    return this.userRepo.create({
      ...data,
      password: hashedPassword
    });
  }

  async update(id: string, data: Partial<{ email: string; name: string }>) {
    // Business rule: can't update email if verified
    const user = await this.userRepo.findById(id);
    if (user?.emailVerified && data.email) {
      throw new Error('Cannot change verified email');
    }

    return this.userRepo.update(id, data);
  }
}
```

**Key Principles**:
- Services contain all business logic
- Services are framework-agnostic (no Express types)
- Services coordinate multiple repositories if needed
- Throw descriptive errors (controllers will catch)

### 5. Repository Layer (Data Access)

**Purpose**: Encapsulate {{DATABASE_ORM}} operations

```typescript
// src/api/repositories/UserRepository.ts
import { prisma } from '../lib/prisma';

export class UserRepository {
  async findMany(params: { skip?: number; take?: number }) {
    return prisma.user.findMany({
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        // Never select passwords in list queries
      }
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true
      }
    });
  }

  async create(data: { email: string; password: string; name: string }) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });
  }

  async update(id: string, data: Partial<{ email: string; name: string }>) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });
  }

  async count() {
    return prisma.user.count();
  }
}
```

**Key Principles**:
- Repository = thin wrapper around {{DATABASE_ORM}}
- Always use `select` to avoid over-fetching
- Never expose password fields in select
- Methods map to database operations (findMany, create, update)

## Error Handling

### Global Error Middleware

```typescript
// src/api/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { captureException } from '{{ERROR_TRACKER}}';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log to error tracker
  captureException(err, {
    tags: {
      endpoint: req.path,
      method: req.method
    }
  });

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Resource already exists',
        field: err.meta?.target
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Resource not found'
      });
    }
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.message
    });
  }

  // Default 500 error
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
}
```

## Validation

### Using Zod for Request Validation

```typescript
// src/api/schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).max(100)
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    name: z.string().min(2).max(100).optional()
  }),
  params: z.object({
    id: z.string().uuid()
  })
});
```

## Quick Reference

### File Organization
```
src/api/
├── routes/           # HTTP route definitions
├── controllers/      # Request handlers
├── services/         # Business logic
├── repositories/     # Data access
├── middleware/       # Express middleware
├── schemas/          # Validation schemas
└── lib/             # Shared utilities
```

### Checklist for New Endpoints
- [ ] Route defined in `routes/`
- [ ] Controller method with try/catch + {{ERROR_TRACKER}}
- [ ] Service method with business logic
- [ ] Repository method if new data access needed
- [ ] Validation schema created
- [ ] Authentication middleware added
- [ ] Error cases handled (400, 404, 409, 500)
- [ ] Tests written (unit for service, integration for endpoint)

### Common Patterns
- **Pagination**: Use `skip` and `take` in repositories
- **Filtering**: Accept filter params in service, pass to repository
- **Sorting**: Use Prisma `orderBy` in repositories
- **Transactions**: Use `prisma.$transaction()` for multi-step operations
- **Soft deletes**: Add `deletedAt` field, filter in repositories

## Related Resources

For deeper dives into specific topics, see the resources directory (auto-created during skill installation).
