# Contributing to LeadFlow AI

First off, thank you for considering contributing to LeadFlow AI! It's people like you that make this project a great tool for small businesses worldwide.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+ or pnpm 8+
- Git
- Cloudflare account (free tier works)
- Resend account (free tier works)

### Local Development

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/LeadFlow.ia.git
cd LeadFlow.ia

# 2. Install dependencies
npm install

# 3. Setup backend
cd backend
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your local secrets

# 4. Setup frontend
cd ../frontend
npm install

# 5. Start development servers
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## Project Structure

Understanding the codebase:

### Backend (`/backend`)

```
backend/
├── src/
│   ├── index.ts          # Entry point, Hono app, Cron handler
│   ├── routes/           # API endpoints (one file per resource)
│   ├── services/         # Business logic layer
│   └── middleware/       # Auth, CORS, logging
├── wrangler.toml         # Cloudflare configuration
└── package.json
```

### Frontend (`/frontend`)

```
frontend/
├── src/
│   ├── pages/            # Route components
│   ├── components/       # Reusable UI components
│   ├── contexts/         # React contexts (Auth)
│   ├── lib/              # API client, queries, utilities
│   └── App.tsx           # Router configuration
├── index.html
└── package.json
```

---

## Coding Standards

### TypeScript

- **Strict mode** is enabled - no `any` types without justification
- Use **interfaces** for object shapes, **types** for unions/primitives
- Prefer **const assertions** for literal types
- Use **discriminated unions** for state management

```typescript
// ✅ Good
interface Lead {
  id: string;
  name: string;
  stage: LeadStage;
}

type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

// ❌ Bad
interface Lead {
  id: any;
  name: any;
  stage: string;
}
```

### React

- **Functional components** only - no class components
- Use **TanStack Query** for server state
- Use **React Context** sparingly - only for truly global state
- Prefer **custom hooks** for reusable logic

```typescript
// ✅ Good - Custom hook
function useLead(id: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => api.get(`/leads/${id}`),
  });
}

// ✅ Good - Component
function LeadDetail() {
  const { id } = useParams();
  const { data: lead, isLoading } = useLead(id);
  
  if (isLoading) return <Spinner />;
  return <LeadCard lead={lead} />;
}
```

### Backend

- Use **Hono.js** built-in validators for input validation
- **Services** handle business logic, **routes** handle HTTP concerns
- Always **scope queries by organization_id** for multi-tenant isolation

```typescript
// ✅ Good - Route with validation
app.post('/leads', 
  zValidator('json', createLeadSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    const lead = await createLead(c.env.DB, user.organizationId, data);
    return c.json(lead, 201);
  }
);
```

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, semicolons) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |

### Examples

```bash
# Feature
feat(leads): add bulk import functionality

# Bug fix
fix(auth): correct JWT expiration calculation

# Documentation
docs(readme): update deployment instructions

# Refactor
refactor(dashboard): extract stats calculation to service
```

---

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes** following our coding standards

3. **Add/update tests** for your changes:
   ```bash
   npm test
   ```

4. **Update documentation** if needed

5. **Commit your changes**:
   ```bash
   git commit -m "feat(scope): add amazing feature"
   ```

6. **Push to your fork**:
   ```bash
   git push origin feature/amazing-feature
   ```

7. **Open a Pull Request** with:
   - Clear title and description
   - Reference to any related issues
   - Screenshots for UI changes
   - Test results

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated and passing
- [ ] No new warnings introduced
- [ ] Commit messages follow convention

---

## Reporting Bugs

### Before Submitting

1. Check if the bug has already been reported in [Issues](https://github.com/vertiljivenson9/LeadFlow.ia/issues)
2. Try to reproduce with the latest version
3. Collect relevant logs and screenshots

### Bug Report Template

```markdown
## Description
A clear description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What you expected to happen.

## Screenshots
If applicable, add screenshots.

## Environment
- OS: [e.g. macOS 14]
- Browser: [e.g. Chrome 120]
- Node version: [e.g. 20.10.0]

## Additional Context
Any other context about the problem.
```

---

## Feature Requests

We welcome feature requests! Please:

1. Check if the feature has already been requested
2. Describe the feature in detail
3. Explain why it would be useful
4. Provide examples if possible

### Feature Request Template

```markdown
## Problem
Describe the problem this feature would solve.

## Solution
Describe your proposed solution.

## Alternatives
Describe any alternative solutions you've considered.

## Additional Context
Any other context, screenshots, or examples.
```

---

## Getting Help

- 💬 [GitHub Discussions](https://github.com/vertiljivenson9/LeadFlow.ia/discussions) - General questions
- 🐛 [GitHub Issues](https://github.com/vertiljivenson9/LeadFlow.ia/issues) - Bug reports and features
- 📧 Email: support@leadflow.ai

---

Thank you for contributing! 🎉
