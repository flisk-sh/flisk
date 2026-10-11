# TDK Landscape Tilt SDK

## 🏗️ Architecture Overview

This SDK provides a **professional, layered architecture** for managing 5000+ lines of Tilt/Starlark configuration code.

```
.tilt/
├── core/                         # 🔧 Foundational Layer (Low-level)
│   ├── utils.star                # Shared helpers, I/O, validation
│   ├── manifest.star             # JSON manifest loading & expansion
│   ├── registry.star             # Service definitions (Single Source of Truth)
│   └── dependency-sync.star      # Workspace discovery & package.json sync
│
├── providers/                    # ⚡ Configuration Generators (Mid-level)
│   ├── vite.star                 # Vite configuration generation
│   ├── typescript/               # TSConfig generation (modular)
│   │   └── include.star          # Entry point
│   ├── docker/                    # Dockerfile / Compose generation (modularized)
│   └── npmrc.star                # .npmrc / bunfig.toml generation
│
├── lifecycle/                    # 🚀 Service Lifecycle (High-level)
│   ├── libs.star                 # Library management & Verdaccio
│   └── databases.star            # Database virtualization (BigTech pattern)
│
├── config.star                   # 🎯 Global Config & Focus Mode
├── legacy/                       # 📦 Legacy modules (backward compatibility)
└── README.md                     # 📖 This file
```

## 🎯 Main Tiltfile Structure

```starlark
# =============================================================================
# 🎯 TDK Landscape TILT ENTRYPOINT
# =============================================================================

# 1️⃣ LOAD CORE MODULES
load('./.tilt/core/utils.star', 'Utils')
load('./.tilt/core/manifest.star', 'Manifest')
load('./.tilt/core/dependency-sync.star', 'DepSync')

# 2️⃣ LOAD CONFIGURATION & SERVICE REGISTRY
load('./.tilt/config.star', 'Config')
load('./.tilt/core/registry.star', 'APP_RESOURCES', 'DEFAULTS', ...)

# 3️⃣ LOAD PROVIDERS (Generators)
load('./.tilt/providers/vite.star', 'Vite')
load('./.tilt/providers/typescript/include.star', 'TSConfig')
load('./.tilt/providers/docker/index.star', 'Docker')
load('./.tilt/providers/npmrc.star', 'PackageConfig')

# 4️⃣ LOAD LIFECYCLE MODULES
load('./.tilt/provisioner/libs.star', 'Libs')
load('./.tilt/provisioner/databases.star', 'Database')

# 5️⃣ INITIALIZE INFRASTRUCTURE
Utils.load_dotenv()

local_resource('init-networks', cmd=Utils.fix_docker_networks(), labels=['infra'])
```

## 📋 Module Reference

### Core Layer (`core/`)

#### `utils.star` - Foundational Utilities

```starlark
load('./.tilt/core/utils.star', 'Utils')

Utils.get_internal_deps("services/product/user/user-management-backend")
Utils.resolve_lib_path("@tdk-landscape/eventing")
Utils.write_file_if_changed("path/to/file.txt", "content")
Utils.fix_docker_networks()
Utils.detect_circular_deps(["path1", "path2"])
```

#### `manifest.star` - Manifest Loading

```starlark
load('./.tilt/core/manifest.star', 'Manifest')

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

#### `dependency-sync.star` - Automatic Configuration Sync

```starlark
load('./.tilt/core/dependency-sync.star', 'DepSync')

deps = DepSync.extract_internal_deps("services/product/user/user-management-backend")
paths = DepSync.generate_tsconfig_paths(deps)
aliases = DepSync.generate_vite_aliases(deps)
DepSync.sync_all_configs_for_service("services/product/user/user-management-backend")
```

---

### Provider Layer (`providers/`)

#### `vite.star` - Vite Configuration Generation

```starlark
load('./.tilt/providers/vite.star', 'Vite')

# Generate for specific type
Vite.frontend(manifest, backend_manifest, write_fn)
Vite.backend(manifest, write_fn)
Vite.library(manifest, write_fn)
Vite.sdk(manifest, write_fn)

# Universal dispatcher (recommended)
Vite.for_manifest(manifest, backend_manifest, write_fn)
```

#### `typescript/include.star` - TSConfig Generation

```starlark
load('./.tilt/providers/typescript/include.star', 'TSConfig')

TSConfig.backend(path, prisma_path, write_fn, internal_deps, is_docker)
TSConfig.frontend(path, write_fn, internal_deps, is_docker)
TSConfig.library_backend(path, write_fn, internal_deps)
TSConfig.library_frontend(path, write_fn, internal_deps)
TSConfig.prisma(path, resource_name, db_name, write_fn)
```

#### `docker/` - Dockerfile & Compose Generation (modularized)

```starlark
load('./.tilt/providers/docker/index.star', 'Docker')

Docker.generate_frontend_dockerfile(path, name, target_path, use_nginx)
Docker.generate_app_dockerfile(path, resource_name, start_command)
Docker.generate_migrator_dockerfile(path, resource_name)
Docker.generate_backend_compose_entry(path, resource_name, resource, manifest)
```

#### `npmrc.star` - Registry Configuration

```starlark
load('./.tilt/providers/npmrc.star', 'PackageConfig')

PackageConfig.generate_npmrc(path, registry_url, is_docker)
PackageConfig.generate_bunfig(path, registry_url, is_docker)
```

---

### Lifecycle Layer (`lifecycle/`)

#### `libs.star` - Library Management

```starlark
load('./.tilt/provisioner/libs.star', 'Libs')

lib_deps = Libs.discover_resource_libraries(ctx, resource_path)
Libs.define_library_resource(ctx, lib_name, lib_config, should_enable)
library_map = Libs.setup_libraries(ctx, should_enable, DDD_LIBS, PLATFORM_LIBS, PRODUCT_LIBS, generators)
```

#### `databases.star` - Database Virtualization

```starlark
load('./.tilt/provisioner/databases.star', 'Database')

Database.provision("user")  # Creates TDK_user
url = Database.get_database_url("user")
Database.status_resource(enabled=True)
Database.memory_summary()
```

---

### Config Layer (`config.star`)

```starlark
load('./.tilt/config.star', 'Config')

# Focus Mode (tilt up -- --focus=user,treatment)
FOCUS_MODE, FOCUS_ALL, FOCUS_RESOURCES = Config.apply_focus(cfg)

# Build context
ctx = Config.build_context()

# Create should_enable wrapper
should_enable = Config.create_should_enable_wrapper(...)
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
Adding a new generator (e.g., for Kubernetes) = create new file in `providers/`.

---

## 📊 File Sizes

| Module | Lines | Purpose |
|--------|-------|---------|
| `engine/topologies/tilt/common/utils.star` | ~400 | Shared utilities |
| `discovery/loading.star` | ~350 | Manifest loading |
| `discovery/registry.star` | ~500 | Service definitions |
| `engine/topologies/tilt/generators/vite_config.star` | ~550 | Vite generation |
| `providers/typescript/` | ~300 | TSConfig generation (modular) |
| `providers/docker/` | ~500 | Docker generation (modularized) |
| `providers/npmrc.star` | ~100 | Registry configs |
| `lifecycle/libs.star` | ~400 | Library management |
| `lifecycle/databases.star` | ~200 | Database virtualization |
| `config.star` | ~250 | Global config |
| **Total** | **~3900** | **Organized vs 5000+ chaotic** |

---

## 🚀 Usage Patterns

### Adding a New Service

1. Add to `discovery/registry.star`:
```starlark
APP_RESOURCES.append({
    'name': 'my-service',
    'path': 'services/product/my-domain/my-service',
    'labels': ['app.my-domain'],
    'resources': [...],
})
```

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
bun add @tdk-landscape/eventing  # In any service
# → Tilt watches package.json
# → TSConfig/Vite auto-regenerate
# → Service rebuilds
```

---

## 🔑 Key Design Principles

1. **Single Source of Truth**: All service definitions in `registry.star`
2. **Convention over Configuration**: Package names map to paths automatically
3. **Struct-based APIs**: Clean `Vite.frontend()`, `Manifest.load_manifest()` interfaces
4. **Pure Functions**: No global mutable state (Starlark-safe)
5. **Layered Architecture**: Core → Providers → Lifecycle → Config
6. **Backward Compatibility**: Legacy modules in `.tilt/legacy/`
