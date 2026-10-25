# Flisk Landscape Tilt SDK

## 🏗️ Architecture Overview

This SDK provides a **professional, layered architecture** for managing 5000+ lines of Tilt/Starlark configuration code.

```text
engine/
├── topologies/tilt/
│   ├── common/
│   │   └── utils.star              # Shared helpers, I/O, validation
│   ├── config/
│   │   └── global.star             # Global config & focus mode
│   ├── generators/
│   │   ├── vite_config.star        # Vite configuration generation
│   │   ├── tsconfig.star           # TSConfig generation entry
│   │   ├── typescript/             # TSConfig generation (modular)
│   │   └── npmrc.star              # .npmrc / bunfig.toml generation
│   └── resources/
│       ├── deps.star               # Library management (Libs)
│       ├── libs.star               # Library implementation
│       ├── conditions.star         # Database virtualization (Database)
│       └── databases.star          # Database implementation
├── topologies/platform/docker/     # Dockerfile / Compose generation
│   └── index.star
└── docs/README.md                  # This file

discovery/
├── loading.star                    # JSON manifest loading & expansion
└── registry.star                   # Service discovery (APP_RESOURCES)
```

## 🎯 Main Tiltfile Structure

```starlark
# =============================================================================
# 🎯 Flisk Landscape TILT ENTRYPOINT
# =============================================================================

# 1️⃣ LOAD CORE MODULES
load('./engine/topologies/tilt/common/utils.star', 'Utils')
load('./discovery/loading.star', 'Manifest')

# 2️⃣ LOAD CONFIGURATION & SERVICE REGISTRY
load('./engine/topologies/tilt/config/global.star', 'Config')
load('./discovery/registry.star', 'APP_RESOURCES', 'DEFAULTS_EXPORT', ...)

# 3️⃣ LOAD PROVIDERS (Generators)
load('./engine/topologies/tilt/generators/vite_config.star', 'Vite')
load('./engine/topologies/tilt/generators/tsconfig.star', 'TSConfig')
load('./engine/topologies/platform/docker/index.star', 'Docker')
load('./engine/topologies/tilt/generators/npmrc.star', 'PackageConfig')

# 4️⃣ LOAD LIFECYCLE MODULES
load('./engine/topologies/tilt/resources/deps.star', 'Libs')
load('./engine/topologies/tilt/resources/conditions.star', 'Database')

# 5️⃣ INITIALIZE INFRASTRUCTURE
Utils.load_dotenv()

local_resource('init-networks', cmd=Utils.fix_docker_networks(), labels=['infra'])
```

## 📋 Module Reference

### Core Layer (`engine/topologies/tilt/common/`, `discovery/`)

#### `engine/topologies/tilt/common/utils.star` - Foundational Utilities

```starlark
load('./engine/topologies/tilt/common/utils.star', 'Utils')

Utils.get_internal_deps("services/product/user/user-management-backend")
Utils.resolve_lib_path("@flisk-sh/eventing")
Utils.write_file_if_changed("path/to/file.txt", "content")
Utils.fix_docker_networks()
Utils.detect_circular_deps(["path1", "path2"])
```

#### `discovery/loading.star` - Manifest Loading

```starlark
load('./discovery/loading.star', 'Manifest')

# Load and expand manifest with Smart Defaults
manifest = Manifest.load_manifest("services/product/user/user-management-backend")

# Load related backend for frontend
backend = Manifest.load_related(frontend_manifest)

# Validation
issues = Manifest.validate(manifest)

# Accessors
port = Manifest.get_port(manifest)
db_url = Manifest.get_database_url(manifest)
```

---

### Provider Layer (`engine/topologies/tilt/generators/`, `engine/topologies/platform/docker/`)

#### `engine/topologies/tilt/generators/vite_config.star` - Vite Configuration Generation

```starlark
load('./engine/topologies/tilt/generators/vite_config.star', 'Vite')

# Generate for specific type
Vite.frontend(manifest, backend_manifest, write_fn)
Vite.backend(manifest, write_fn)
Vite.library(manifest, write_fn)
Vite.sdk(manifest, write_fn)

# Universal dispatcher (recommended)
Vite.for_manifest(manifest, backend_manifest, write_fn)
```

#### `engine/topologies/tilt/generators/tsconfig.star` - TSConfig Generation

```starlark
load('./engine/topologies/tilt/generators/tsconfig.star', 'TSConfig')

TSConfig.backend(path, prisma_path, write_fn, internal_deps, is_docker)
TSConfig.frontend(path, write_fn, internal_deps, is_docker)
TSConfig.library_backend(path, write_fn, internal_deps)
TSConfig.library_frontend(path, write_fn, internal_deps)
TSConfig.prisma(path, resource_name, db_name, write_fn)
```

#### `engine/topologies/platform/docker/` - Dockerfile & Compose Generation (modularized)

```starlark
load('./engine/topologies/platform/docker/index.star', 'Docker')

Docker.frontend(path, resource_name, port, target_path, build_cmd, cmd, use_nginx)
Docker.backend(path, resource_name, port, build_cmd, cmd)
Docker.migrator(path, resource_name)
Docker.backend_compose(resource_path, resource_name, res, manifest)
```

#### `engine/topologies/tilt/generators/npmrc.star` - Registry Configuration

```starlark
load('./engine/topologies/tilt/generators/npmrc.star', 'PackageConfig')

PackageConfig.npmrc(path, registry_url, is_docker, write_fn)
PackageConfig.bunfig(path, registry_url, is_docker, write_fn)
```

Generated registry files contain routing only. The default Verdaccio policy allows anonymous package reads; publishing requires a user login, for example `npm login --registry=http://localhost:4873`. Keep those credentials in the user's npm config rather than in generated project files.

---

### Lifecycle Layer (`engine/topologies/tilt/resources/`)

#### `engine/topologies/tilt/resources/deps.star` - Library Management

```starlark
load('./engine/topologies/tilt/resources/deps.star', 'Libs')

lib_deps = Libs.discover_resource_libs(ctx, resource_path)
Libs.define_resource(ctx, lib_name, lib_config, should_enable)
library_map = Libs.setup_all(ctx, should_enable, DDD_LIBS, PLATFORM_LIBS, PRODUCT_LIBS, generators)
```

#### `engine/topologies/tilt/resources/conditions.star` - Database Virtualization

```starlark
load('./engine/topologies/tilt/resources/conditions.star', 'Database')

Database.provision("user")  # Creates Flisk_user
url = Database.get_url("user")
Database.status_resource(enabled=True)
Database.memory_summary()
```

---

### Config Layer (`engine/topologies/tilt/config/global.star`)

```starlark
load('./engine/topologies/tilt/config/global.star', 'Config')

# Focus Mode (tilt up -- --focus=user,treatment)
FOCUS_MODE, FOCUS_ALL, FOCUS_RESOURCES = Config.apply_focus(cfg)

# Build context
ctx = Config.build_context()

# Create should_enable wrapper
should_enable = Config.create_enabler(...)
```

---

## 🧠 Why This Structure?

### 1. **Encapsulation**
When a developer needs to fix a Vite config bug, they go directly to `engine/topologies/tilt/generators/vite_config.star` — not search through 5000 lines.

### 2. **Prevents Frozen Hash Table**
Splitting into small files reduces the chance of mutating an object that's already "frozen" by another load.

### 3. **Easy Testing**
You can load only `engine/topologies/tilt/common/utils.star` in a test script without loading heavy Docker logic.

### 4. **Scalability**
Adding a new generator = create a new file under `engine/topologies/tilt/generators/`.

---

## 📊 File Sizes

| Module | Lines | Purpose |
|--------|-------|---------|
| `engine/topologies/tilt/common/utils.star` | ~400 | Shared utilities |
| `discovery/loading.star` | ~350 | Manifest loading |
| `discovery/registry.star` | ~500 | Service definitions |
| `engine/topologies/tilt/generators/vite_config.star` | ~550 | Vite generation |
| `engine/topologies/tilt/generators/typescript/` | ~300 | TSConfig generation (modular) |
| `engine/topologies/platform/docker/` | ~500 | Docker generation (modularized) |
| `engine/topologies/tilt/generators/npmrc.star` | ~100 | Registry configs |
| `engine/topologies/tilt/resources/libs.star` | ~400 | Library management |
| `engine/topologies/tilt/resources/databases.star` | ~200 | Database virtualization |
| `engine/topologies/tilt/config/global.star` | ~250 | Global config |

Line counts are approximate orientation from the previous layout. Facades such as `discovery/loading.star` and `engine/topologies/tilt/generators/vite_config.star` re-export larger modules.

---

## 🚀 Usage Patterns

### Adding a New Service

1. Add a `service.json` under the service directory. `discovery/registry.star` discovers it into `APP_RESOURCES`.
2. Done! Tilt auto-generates everything.

### Focus Mode Development

```bash
tilt up -- --focus=user                    # Only user + dependencies
tilt up -- --focus=user,treatment          # Multiple services
tilt up -- --focus=user --no-frontend      # Skip frontends
tilt up -- --focus=user --include-monitoring
```

### Automatic Dependency Sync

```bash
bun add @flisk-sh/eventing  # In any service
# → Tilt watches package.json
# → TSConfig/Vite auto-regenerate
# → Service rebuilds
```

---

## 🔑 Key Design Principles

1. **Single Source of Truth**: All service definitions in `discovery/registry.star`
2. **Convention over Configuration**: Package names map to paths automatically
3. **Struct-based APIs**: Clean `Vite.frontend()`, `Manifest.load_manifest()` interfaces
4. **Pure Functions**: No global mutable state (Starlark-safe)
5. **Layered Architecture**: Discovery (`discovery/`) → Common (`engine/topologies/tilt/common/`) → Generators & Resources (`engine/topologies/tilt/`, `engine/topologies/platform/`) → Config (`engine/topologies/tilt/config/`)
