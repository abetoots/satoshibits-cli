---
name: frontend-dev-guidelines
description: React/TypeScript patterns for building modern, accessible UIs
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---

# Frontend Development Guidelines

## Purpose

This skill provides production-tested patterns for building maintainable {{UI_FRAMEWORK}} applications with TypeScript, focusing on component design, state management, performance, and accessibility.

## When This Skill Activates

This skill automatically activates when you:
- Mention keywords: component, React, useState, useEffect, UI, hooks, props
- Ask about frontend architecture or component patterns
- Edit files in: `src/components/`, `frontend/`, `pages/`, `hooks/`
- Work with React code (imports React, uses hooks, defines components)

## Core Component Patterns

### 1. Component Structure

```typescript
// src/components/UserProfile/UserProfile.tsx
import { useState, useEffect } from 'react';
import { Avatar, Card, Typography } from '@mui/material';

interface UserProfileProps {
  userId: string;
  onEdit?: () => void;
}

export function UserProfile({ userId, onEdit }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await fetchUser(userId);
        setUser(data);
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [userId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>User not found</div>;
  }

  return (
    <Card>
      <Avatar src={user.avatarUrl} alt={user.name} />
      <Typography variant="h5">{user.name}</Typography>
      <Typography variant="body2">{user.email}</Typography>
      {onEdit && <button onClick={onEdit}>Edit</button>}
    </Card>
  );
}
```

**Key Principles**:
- Props interface defined with TypeScript
- Hooks at top of component (before any conditionals)
- Loading and error states handled
- Semantic HTML and accessibility attributes
- Optional callbacks with `?` for flexibility

### 2. Custom Hooks for Reusability

**Problem**: Data fetching logic duplicated across components

**Solution**: Extract to custom hook

```typescript
// src/hooks/useUser.ts
import { useState, useEffect } from 'react';

interface UseUserResult {
  user: User | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useUser(userId: string): UseUserResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getUser(userId);
      setUser(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  return { user, loading, error, refetch: fetchUser };
}

// Usage in component
export function UserProfile({ userId }: UserProfileProps) {
  const { user, loading, error, refetch } = useUser(userId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <Card>
      <Typography>{user.name}</Typography>
      <button onClick={refetch}>Refresh</button>
    </Card>
  );
}
```

**Benefits**:
- Logic reused across components
- Easier to test (test hook independently)
- Cleaner component code

### 3. Component Composition

**Bad**: Monolithic components

```typescript
// ❌ DON'T: Everything in one component
function Dashboard() {
  return (
    <div>
      {/* Header logic */}
      {/* Sidebar logic */}
      {/* Content logic */}
      {/* Footer logic */}
    </div>
  );
}
```

**Good**: Composed from smaller components

```typescript
// ✅ DO: Small, focused components
function Dashboard() {
  return (
    <div>
      <DashboardHeader />
      <DashboardSidebar />
      <DashboardContent />
      <DashboardFooter />
    </div>
  );
}

function DashboardHeader() {
  return <header>{/* Header-specific logic */}</header>;
}

function DashboardSidebar() {
  return <aside>{/* Sidebar-specific logic */}</aside>;
}

function DashboardContent() {
  return <main>{/* Content-specific logic */}</main>;
}
```

**Key Principles**:
- Components under 200 lines
- Single responsibility per component
- Compose larger UIs from smaller pieces

### 4. Props vs State

**Props**: Data passed from parent (read-only)

```typescript
interface UserCardProps {
  user: User;          // From parent
  onSelect: () => void; // Callback to parent
}

function UserCard({ user, onSelect }: UserCardProps) {
  // user is props, don't modify
  return (
    <div onClick={onSelect}>
      <h3>{user.name}</h3>
    </div>
  );
}
```

**State**: Data managed by component

```typescript
function SearchInput() {
  const [query, setQuery] = useState('');  // Internal state

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
```

**Lifting State Up**: When siblings need shared state

```typescript
function UserList() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <UserCard
        user={user1}
        selected={selectedId === user1.id}
        onSelect={() => setSelectedId(user1.id)}
      />
      <UserCard
        user={user2}
        selected={selectedId === user2.id}
        onSelect={() => setSelectedId(user2.id)}
      />
    </div>
  );
}
```

## State Management Patterns

### 1. Local State (useState)

**Use When**: State only used by one component

```typescript
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
```

### 2. Context for Shared State

**Use When**: Multiple components need same data

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    const userData = await api.login(email, password);
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Usage
function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

function Profile() {
  const { user, logout } = useAuth();

  return (
    <div>
      <p>Welcome, {user?.name}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Performance Optimization

### 1. Memoization with useMemo

**Use When**: Expensive calculations need caching

```typescript
function DataTable({ data, filters }: DataTableProps) {
  // ❌ BAD: Filters every render
  const filteredData = data.filter(filters.predicate);

  // ✅ GOOD: Only recalculates when dependencies change
  const filteredData = useMemo(() => {
    return data.filter(filters.predicate);
  }, [data, filters]);

  return <table>{/* render filteredData */}</table>;
}
```

### 2. Preventing Re-renders with useCallback

**Use When**: Passing callbacks to child components

```typescript
function ParentComponent() {
  const [count, setCount] = useState(0);

  // ❌ BAD: New function every render, child re-renders unnecessarily
  const handleClick = () => {
    console.log('Clicked');
  };

  // ✅ GOOD: Same function reference, child doesn't re-render
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []); // No dependencies, function never changes

  return <ChildComponent onClick={handleClick} />;
}

const ChildComponent = memo(({ onClick }: { onClick: () => void }) => {
  return <button onClick={onClick}>Click</button>;
});
```

### 3. Code Splitting with Lazy Loading

```typescript
import { lazy, Suspense } from 'react';

// ✅ Load components only when needed
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

## Accessibility Best Practices

### 1. Semantic HTML

```typescript
// ❌ BAD: Div soup
<div onClick={handleClick}>Click me</div>

// ✅ GOOD: Semantic elements
<button onClick={handleClick}>Click me</button>

// ❌ BAD: Non-semantic layout
<div>
  <div>Header</div>
  <div>Content</div>
</div>

// ✅ GOOD: Semantic structure
<article>
  <header>Header</header>
  <main>Content</main>
</article>
```

### 2. ARIA Labels

```typescript
// Icon buttons need labels
<button aria-label="Close dialog" onClick={onClose}>
  <CloseIcon />
</button>

// Form inputs need labels
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Loading states need announcements
<div role="status" aria-live="polite">
  {loading ? 'Loading...' : 'Content loaded'}
</div>
```

## Quick Reference

### File Organization
```
src/
├── components/       # Reusable UI components
│   └── Button/
│       ├── Button.tsx
│       ├── Button.test.tsx
│       └── index.ts
├── pages/           # Page-level components
├── hooks/           # Custom hooks
├── contexts/        # Context providers
├── utils/           # Utility functions
└── types/           # TypeScript types
```

### Component Checklist
- [ ] Props interface defined with TypeScript
- [ ] Hooks before any conditionals
- [ ] Loading/error states handled
- [ ] Accessibility attributes (aria-label, role)
- [ ] Event handlers use useCallback if passed to children
- [ ] Expensive calculations wrapped in useMemo
- [ ] Component under 200 lines (split if larger)

### Common Patterns
- **Conditional Rendering**: `{condition && <Component />}`
- **Lists**: Always include `key` prop
- **Forms**: Controlled components with onChange
- **Async Data**: Loading → Error → Success states
- **Modals**: Use portal for z-index issues

## Related Resources

For deeper dives into specific topics, see the resources directory (auto-created during skill installation).
