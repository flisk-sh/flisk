# AGENTS.md - Database & State Management

## Purpose

PostgreSQL database virtualization, per-service database provisioning, and state management.

## Key Files

### Database Provisioning
- **`relational.star`** - Main database provisioning logic
- **`compose.star`** - Docker Compose entries for databases

### Prisma Integration
- **`prisma/migrate_script.star`** - Migration script generation
- **`prisma/db_readiness.star`** - Database readiness checks
- **`prisma/prisma_build.star`** - Prisma in Docker builds
- **`prisma/prisma_runtime.star`** - Prisma client in runtime

### Utilities
- **`utils.star`** - Database utilities
- **`constants.star`** - Database constants (ports, users)

## Common Tasks

### Provision database for service
```starlark
load("./relational.star", "provision_database")
compose_entry = provision_database("order-management-backend", "{project}_order")
```

### Get database URL
```starlark
load("./relational.star", "get_database_url")
url = get_database_url("order-management-backend")
# Returns: postgresql://postgres:postgres@order-management-backend-db:5432/{project}_order
```

### Wait for database
```starlark
load("./prisma/db_readiness.star", "wait_for_db")
script = wait_for_db(db_url, timeout=30)
```

## Architecture

Each service with `databaseName` in manifest gets:
1. PostgreSQL container in Docker Compose
2. Volume for persistence
3. Readiness check before migrations
4. Dedicated port mapping (avoids conflicts)

## Integration

- Called by `resources/deps.star` - when setting up service dependencies
- Used by `platform/docker/` - for Docker Compose generation
- Part of service resource dependencies chain

## Database Naming

```
{project}_{domain}  // e.g., {project}_order, {project}_user
```

Each domain gets one database shared by its services (backend, migrator, etc).
