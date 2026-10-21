# Flisk Landscape Tilt Architecture - Operations

## Detailed Architecture Breakdown

### **Core Layer** (Foundation)

```
discovery/
├── loading.star            # Shared manifest loading & Smart Defaults
└── registry.star           # Single Source of Truth for all services

engine/topologies/tilt/common/
└── utils.star              # Shared utilities, I/O, validation
```

**Responsibilities**:
- File I/O with change detection
- JSON manifest parsing & validation
- Service discovery (auto-scans `services/product/`)
- Dependency resolution (package names → paths)
- Network repair utilities
- Environment validation

**Key Pattern**: Pure functions, no mutable global state (Starlark-safe)

---

### **Provider Layer** (Config Generators)

```
engine/topologies/platform/docker/
├── layers/
│   ├── l1_base_layers.star       # OS base + runtime env
│   ├── l2_dependency_layers.star # Package manifest + install
│   ├── l3_builder_layers.star    # Compilation stage
│   └── l4_runtime_layers.star    # Final runtime
├── compose/compose.star          # docker-compose generation
├── config/dockerignore.star      # .dockerignore generation
└── build/golden_image.star       # Golden image workflow

engine/topologies/tilt/generators/
├── typescript/                   # TypeScript configs (backend, frontend, prisma)
├── vite_config.star              # Vite dev server config
└── npmrc.star                    # Package registry config
```

**Responsibilities**:
- Generate configuration files from manifests
- Multi-stage Dockerfile orchestration (L1→L2→L3→L4)
- TypeScript path mapping automation
- Vite alias synchronization
- Registry configuration (.npmrc, bunfig.toml)

**Key Innovation**: Layered Docker builds with surgical cache invalidation

---

### **Lifecycle Layer** (Orchestration)

```
engine/topologies/tilt/resources/
├── libs.star              # Shared library management
├── databases.star         # Database virtualization (per-service DBs)
├── orchestrator.star      # Service coordination & dependencies
├── infra-loader.star      # Infrastructure provisioning
└── watchers.star          # File change detection & triggers
```

**Responsibilities**:
- Shared library build orchestration
- Per-service database provisioning (`TDK_{domain}`)
- Service startup order (via dependency graph)
- Infrastructure bootstrapping (Postgres, NATS, Traefik)
- Hot-reload triggers on file changes

**Key Pattern**: Resource dependency graphs ensure correct startup order

---

### **Configuration Layer**

```
engine/topologies/tilt/config/
├── global.star               # Global config & Focus Mode
├── profiles.star             # Focus profiles and filtering
├── defaults.star             # Default values
└── feature_flags.star        # Feature flags
```

**Responsibilities**:
- CLI argument parsing (`--focus`, `--no-frontend`)
- Service enablement logic
- Environment variable loading
- Context building for all modules

---

## Data Flow Diagrams

### **1. Service Discovery Flow**

```mermaid
graph TD
    A[Tilt Startup] --> B[Scan services/product/]
    B --> C{Find manifests}
    C -->|Found| D[Load JSON]
    C -->|Not found| E[Skip directory]
    D --> F[Apply Smart Defaults]
    F --> G[Validate manifest]
    G --> H{Valid?}
    H -->|Yes| I[Add to APP_RESOURCES]
    H -->|No| J[Log error, skip]
    I --> K[Generate all configs]
    K --> L[Create Tilt resources]
    
    style A fill:#f9f,stroke:#333,stroke-width:3px
    style I fill:#9f9,stroke:#333,stroke-width:2px
    style J fill:#f99,stroke:#333,stroke-width:2px
```

### **2. Manifest-Driven Config Generation**

```mermaid
graph LR
    subgraph "Single Source of Truth"
        M[service.json]
    end
    
    subgraph "Generated Configs"
        D1[Dockerfile.app]
        D2[Dockerfile.migrator]
        DC[docker-compose.yml]
        TS[tsconfig.json]
        V[vite.config.ts]
        N[.npmrc]
        B[bunfig.toml]
    end
    
    M -->|Docker Provider| D1
    M -->|Docker Provider| D2
    M -->|Compose Provider| DC
    M -->|TS Provider| TS
    M -->|Vite Provider| V
    M -->|Package Provider| N
    M -->|Package Provider| B
    
    style M fill:#ff9,stroke:#333,stroke-width:4px
```

### **3. Golden Image Build Strategy**

```mermaid
graph TB
    subgraph "One-Time Build"
        GD[docker/golden.Dockerfile]
        GB[Golden Image Build]
        GI[Flisk Landscape-base:latest]
    end
    
    subgraph "Per-Service Builds (Fast)"
        S1[user-backend]
        S2[order-backend]
        S3[treatment-backend]
    end
    
    subgraph "Service Dockerfiles"
        DF1[FROM Flisk Landscape-base:latest]
        DF2[COPY service code]
        DF3[RUN bun build]
    end
    
    GD --> GB
    GB --> GI
    GI --> S1
    GI --> S2
    GI --> S3
    S1 --> DF1
    DF1 --> DF2
    DF2 --> DF3
    
    style GI fill:#f9f,stroke:#333,stroke-width:4px
    style DF3 fill:#9f9,stroke:#333,stroke-width:2px
```

---

## Key Design Principles

### **1. Convention over Configuration**
```
Package name → Directory path (automatic)

@flisk-sh/eventing → platform/packages/eventing/src
@tdk/domain            → shared-ddd-layers/domain/src
```

### **2. Single Source of Truth**
```
service.json → Everything else

One file defines:
- Service name, type, domain
- Port mapping
- Database name
- Dependencies
- Feature flags (prisma, nats, etc.)
```

### **3. Fail-Fast Validation**
```
Checks at tilt up:
✓ Manifest schema validation
✓ Circular dependency detection
✓ Network conflict resolution
✓ Infisical environment check
✓ Required secrets present
```

### **4. Self-Healing Systems**
```
Automatic fixes:
✓ Docker network conflicts → recreate networks
✓ Bun install cache corruption → retry without cache
✓ Missing golden image → build automatically
✓ Dependency changes → regenerate all configs
```

---

## Performance Optimizations

### **Build Time Reduction**

| Strategy | Impact | Implementation |
|----------|--------|----------------|
| **Golden images** | 98% faster | Pre-built base layers |
| **L1-L4 layering** | 5x cache hits | Surgical invalidation |
| **Parallel builds** | 3x faster | Tilt's concurrent resource loading |
| **Bun runtime** | 2x faster | vs Node.js |
| **Multi-stage builds** | 80% smaller images | Production purge layer |

### **Developer Productivity**

| Feature | Time Saved | Comparison |
|---------|-----------|------------|
| **Auto-discovery** | 30 min/service | vs manual Tiltfile edits |
| **Dependency sync** | 10 min/change | vs manual config updates |
| **Focus mode** | 5 min/restart | vs full stack rebuild |
| **Healthchecks** | 2 hours/incident | vs blind debugging |
| **Network auto-repair** | 15 min/conflict | vs manual Docker cleanup |

---

## System Boundaries

### **What Tilt Controls**
✅ Docker image generation  
✅ Container orchestration  
✅ Configuration file generation  
✅ Dependency graph management  
✅ Local development environment  
✅ Hot reload triggers  

### **What Tilt Doesn't Control**
❌ Production deployment  
❌ Cloud infrastructure  
❌ Monitoring/observability  
❌ CI/CD pipelines (that's GitHub Actions)  
❌ Application business logic  

---

## Integration Points

```mermaid
graph TB
    subgraph "External Systems"
        Git[Git Repository]
        Docker[Docker Engine]
        Bun[Bun Runtime]
        Infisical[Infisical Secrets]
    end
    
    subgraph "Tilt Ecosystem"
        Tiltfile[Tiltfile]
        SDK[Tilt SDK Modules]
        Resources[Tilt Resources]
    end
    
    subgraph "Generated Artifacts"
        Dockerfiles[Auto-generated Dockerfiles]
        Configs[Auto-generated Configs]
        Compose[Docker Compose Files]
    end
    
    subgraph "Running System"
        Containers[Service Containers]
        Databases[Per-Service DBs]
        Infrastructure[NATS, Traefik, etc.]
    end
    
    Git -->|watches| Tiltfile
    Tiltfile -->|loads| SDK
    SDK -->|generates| Dockerfiles
    SDK -->|generates| Configs
    SDK -->|generates| Compose
    
    Dockerfiles -->|builds via| Docker
    Compose -->|orchestrates| Containers
    
    Containers -->|connects to| Databases
    Containers -->|uses| Infrastructure
    
    Bun -->|runs in| Containers
    Infisical -->|provides secrets to| Containers
    
    style Tiltfile fill:#f9f,stroke:#333,stroke-width:4px
    style SDK fill:#9cf,stroke:#333,stroke-width:3px
    style Containers fill:#9f9,stroke:#333,stroke-width:3px
```

---

## Deployment View

```mermaid
graph TB
    subgraph "Developer Machine"
        Editor[VS Code / Cursor]
        Git[Git]
        Tilt[Tilt]
        Docker[Docker / OrbStack]
    end
    
    subgraph "Tilt SDK (Starlark)"
        Core[Core Modules]
        Providers[Config Generators]
        Lifecycle[Orchestration]
    end
    
    subgraph "Generated Artifacts (Git-ignored)"
        DF[*.autogenerated Dockerfiles]
        DC[docker-compose.autogenerated.yml]
        TS[tsconfig.docker.autogenerated.json]
    end
    
    subgraph "Running Containers"
        Services[30+ Microservices]
        DBs[PostgreSQL Instances]
        Infra[NATS, Traefik, Verdaccio]
    end
    
    Editor -->|edits code| Git
    Git -->|triggers| Tilt
    Tilt -->|executes| Core
    Core --> Providers
    Providers --> Lifecycle
    Lifecycle --> DF
    Lifecycle --> DC
    Lifecycle --> TS
    
    DF -->|builds| Docker
    DC -->|orchestrates| Docker
    Docker -->|runs| Services
    Docker -->|runs| DBs
    Docker -->|runs| Infra
    
    style Editor fill:#bbf,stroke:#333,stroke-width:2px
    style Tilt fill:#f9f,stroke:#333,stroke-width:4px
    style Services fill:#9f9,stroke:#333,stroke-width:3px
```

---

## Comparison to Production Architecture

| Aspect | Tilt (Local Dev) | Production |
|--------|------------------|------------|
| **Orchestration** | Tilt + Docker Compose | Kubernetes / Cloud Run |
| **Service Discovery** | Manifest files | Service mesh / DNS |
| **Config Management** | Auto-generated files | ConfigMaps / Secrets |
| **Networking** | Docker networks | Cloud VPC / Load balancers |
| **Databases** | Local Postgres containers | Managed Postgres (Neon/RDS) |
| **Secrets** | Infisical CLI | Infisical API / Vault |
| **Observability** | Docker logs + Tilt UI | Prometheus + Grafana + Sentry |
| **Deployment** | `tilt up` | CI/CD → Cloud deploy |

---

## Conclusion

**Tilt SDK Architecture** = 5000+ lines of infrastructure-as-code that:

1. **Eliminates manual toil** (19% of files autogenerated)
2. **Enforces consistency** (one template → 30 services)
3. **Enables rapid development** (`git clone && tilt up`)
4. **Scales horizontally** (manifest discovery = no central file edits)
5. **Provides escape hatches** (can override any generated config)

**This is enterprise-grade developer tooling** built by one engineer over one year.
