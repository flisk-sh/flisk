# Flisk CLI Agent Guidelines

## API Conventions & Standards

This document defines the coding standards and API conventions for the Flisk CLI package. All contributions should follow these guidelines to maintain consistency.

---

## Naming Conventions

### Functions and Variables
| Category | Convention | Example |
|----------|------------|---------|
| Functions | camelCase | `discoverResources()`, `isPortAvailable()` |
| Variables | camelCase | `const resourceCount`, `let projectRoot` |
| Constants | UPPER_SNAKE_CASE | `const CACHE_TTL = 5000` |
| Private functions | camelCase with underscore prefix | `_internalHelper()` (if needed) |

### Types and Classes
| Category | Convention | Example |
|----------|------------|---------|
| Classes | PascalCase | `TdkError`, `TemplateEngine` |
| Interfaces | PascalCase, descriptive | `DiscoveredResource`, `ResourceMetadata` |
| Type aliases | PascalCase | `ResourceStatus`, `FileType` |
| Factory objects | camelCase | `errorFactories` (not `Errors`) |

### Boolean Properties
Use prefixes for clarity:
- `is-*` for state: `isEnabled`, `isAvailable`
- `has-*` for possession: `hasDockerfile`, `hasTiltfile`
- `can-*` for capability: `canReload`
- `did-*` for past actions: `didPass`, `didComplete`

**Examples:**
```typescript
// ✅ Good
interface CheckResult {
  didPass: boolean;
  hasFix: boolean;
  isCritical: boolean;
}

// ❌ Avoid - These naming patterns create ambiguity
//    Use the patterns shown in the "Good" example above
```

---

## Export Patterns

### Public API Surface
Use **explicit named exports** instead of wildcards:

```typescript
// ✅ Good - Explicit exports
export type {
  DiscoveredResource,
  DiscoveredStack,
  ResourceMetadata,
} from './types/index.js';

export {
  discoverResources,
  discoverStacks,
  findProjectRoot,
} from './utils/services.js';

// ❌ Avoid - Wildcard exports
export * from './types/index.js';
export * from './utils/services.js';
```

### Export Organization
Group exports by category with comments:

```typescript
/**
 * Component exports for Flisk CLI UI
 */

// Main UI components
export { TabBar } from './TabBar.js';
export { ResourceTable } from './ResourceTable.js';

// Type definitions
export type { TabId } from './TabBar.js';
export type { FileNode } from './FileTree.js';

// Utility constants
export { TOOLTIPS } from './Tooltip.js';
```

---

## Function Signatures

### Parameter Ordering
1. **Required data parameters** first
2. **Optional data parameters** next
3. **Options object** last

```typescript
// ✅ Good
function processResource(
  name: string,                    // Required data
  config: ResourceConfig,          // Required data
  options: { verbose?: boolean } = {}  // Options last
): ProcessResult

// ❌ Avoid - Mixed ordering
function processResource(
  options: { verbose?: boolean },
  name: string,
  config: ResourceConfig
)
```

### Options Object Pattern
For functions with 3+ parameters or multiple optional parameters:

```typescript
// ✅ Good - Options object
function runTilt(
  command: string,
  args: string[] = [],
  options: {
    verbose?: boolean;
    inheritStdio?: boolean;
    timeout?: number;
  } = {}
): Promise<TiltCommandResult>

// ❌ Avoid - Too many positional parameters
function runTilt(
  command: string,
  args: string[],
  verbose: boolean,
  inheritStdio: boolean,
  timeout: number
): Promise<TiltCommandResult>
```

### Return Types
Always provide explicit return types:

```typescript
// ✅ Good
export function findProjectRoot(startDir: string = cwd()): string | null {
  // implementation
}

// ❌ Avoid - Implicit return type
export function findProjectRoot(startDir: string = cwd()) {
  // implementation
}
```

---

## Error Handling

### Use TdkError for CLI Errors
All user-facing errors should use the `TdkError` class:

```typescript
import { TdkError } from '../utils/errors.js';

// ✅ Good
throw new TdkError(
  'Resource not found',
  ['Check the resource name', 'Run flisk resources to list all'],
  1  // exit code
);

// ❌ Avoid - Generic errors for user-facing issues
throw new Error('Resource not found');
```

### Error Factories
Use the `errorFactories` object for common errors:

```typescript
// ✅ Good - Using factory
errorFactories.resourceNotFound(name).display();
errorFactories.notInProject().display();

// ❌ Avoid - Creating TdkError manually for common cases
new TdkError(`Resource "${name}" not found`, [...]).display();
```

### Validation Results
Use consistent validation result pattern:

```typescript
// ✅ Good
interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateResourceName(name: string): ValidationResult {
  if (!name.trim()) {
    return { valid: false, error: 'Name is required' };
  }
  return { valid: true };
}
```

---

## Type Definitions

### Interface Naming
Use descriptive names without redundant suffixes:

```typescript
// ✅ Good
interface DiscoveredResource { ... }
interface ResourceMetadata { ... }

// ❌ Avoid - Redundant suffixes
interface DiscoveredResourceInterface { ... }
interface ResourceMetadataType { ... }
```

### Type Placement
- Place shared types in `src/types/index.ts`
- Place component-specific types in the component file
- Export types explicitly using `export type`

### Optional Properties
Use `?` for optional properties and provide defaults where sensible:

```typescript
interface CLIOptions {
  verbose?: boolean;  // Optional, defaults to false
  timeout?: number;   // Optional, has default
}

function runCommand(options: CLIOptions = {}) {
  const verbose = options.verbose ?? false;
  const timeout = options.timeout ?? 5000;
}
```

---

## File Organization

### Directory Structure
```
src/
├── types/
│   └── index.ts       # Shared type definitions
├── utils/
│   ├── services.ts    # Resource discovery utilities
│   ├── tilt.ts        # Tilt command utilities
│   ├── errors.ts      # Error handling
│   ├── validation.ts  # Validation utilities
│   └── formatting.ts  # Formatting utilities
├── commands/
│   ├── resource.ts    # flisk resource command
│   ├── stack.ts       # flisk stack command
│   └── ...
└── components/
    ├── TabBar.tsx     # UI components
    └── ...
```

### File Naming
- Commands: `[command-name].ts` (e.g., `resource.ts`)
- Utilities: `[category].ts` (e.g., `services.ts`, `tilt.ts`)
- Components: `[ComponentName].tsx` (PascalCase)
- Tests: `[filename].test.ts` alongside source files

---

## Testing

### Test Location
Place tests alongside source files:

```
commands/
├── resource.ts
├── resource.test.ts
├── stack.ts
└── stack.test.ts
```

### Test Naming
Use descriptive test names:

```typescript
// ✅ Good
describe('resource name validation', () => {
  it('should accept valid kebab-case names', () => { ... });
  it('should reject names with underscores', () => { ... });
});

// ❌ Avoid - Vague names
it('works', () => { ... });
it('test 1', () => { ... });
```

---

## Documentation

### JSDoc Comments
Use JSDoc for public functions:

```typescript
/**
 * Discover all resources from the project
 *
 * Scans the filesystem for service.json files and parses them.
 *
 * @returns Array of discovered resources sorted by name
 */
export function discoverResources(): DiscoveredResource[] {
  // implementation
}
```

### Inline Comments
Use inline comments sparingly, only for complex logic:

```typescript
// Calculate next available port from the configured range
const portRange = PORT_RANGES[resourceType];
const assignedPort = findNextPort(existingPorts, portRange);
```

---

## Common Patterns

### Resource Discovery
```typescript
export function discoverResources(): DiscoveredResource[] {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw errorFactories.notInProject();
  }
  // ... implementation
}
```

### Command Action Wrapper
```typescript
export const commandName = new Command('command')
  .description('Description')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (options) => {
    await runCommand(async () => {
      // Command implementation
    });
  });
```

### Result Type
```typescript
interface Result<T, E = string> {
  success: boolean;
  data?: T;
  error?: E;
}

function doSomething(): Result<Resource, string> {
  try {
    const data = process();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

---

## Resources

- Full assessment: `API_HARMONIZATION_ASSESSMENT.md`
- Implementation report: `API_HARMONIZATION_REPORT.md`
- Type definitions: `cli/src/types/index.ts`

---

**Last Updated:** 2025-01-30 by Agent #11 (The API Harmonizer)
