# Comparing Flisk with Alternative Local Development Tools

Flisk CLI generates and runs local development environments from declarative `service.json` manifests. It provisions local infrastructure (Traefik ingress routing, PostgreSQL, NATS), generates Dockerfiles and Starlark configuration, and orchestrates [Tilt](https://tilt.dev/) to watch files and live-update containers as you write code.

Developers evaluating Flisk frequently compare it to container tools such as Docker Compose, developer orchestration tools like plain Tilt, Skaffold, and DevSpace, or local Kubernetes runners like kind and minikube.

Each of these tools addresses distinct stages and philosophies of local development. This guide provides a balanced, technical comparison of how Flisk compares to each tool, when alternative tools are the better choice, when Flisk is the better choice, and how migration between them works.

## At a Glance

| Dimension | Docker Compose | Plain Tilt | Skaffold | DevSpace | kind / minikube | Flisk CLI |
| --- | --- | --- | --- | --- | --- | --- |
| **Target Runtime** | Docker Engine | Docker Engine or Kubernetes | Kubernetes (local or remote) | Kubernetes (local or remote) | Local Kubernetes cluster | Docker Engine (via Tilt) |
| **Requires Local Kubernetes** | No | Optional | Yes | Yes | Yes | No |
| **Configuration Format** | YAML (`compose.yaml`) | Starlark (`Tiltfile`) | YAML (`skaffold.yaml`) | YAML (`devspace.yaml`) | Kubernetes YAML / Helm | JSON (`service.json`) |
| **Configuration Authoring** | Hand-written | Hand-written code | Hand-written | Hand-written | Hand-written | Generated from `service.json` |
| **Service Scaffolding** | None | None | None | None | None | Built-in (`flisk resource`) |
| **Hot Reload / File Sync** | `compose watch` | Native `live_update` | Native file sync | Bi-directional sync | Add-on tools required | Automated Tilt `live_update` |
| **Selective Service Subsets** | Compose profiles | Custom Starlark filters | Profiles / modules | Profiles / flags | Manual namespaces / selectors | `flisk up <stack>` |
| **Ingress & Domain Routing** | Manual proxy / ports | Manual port-forwarding | Manual port-forwarding | Port-forwarding / UI | Ingress Controller setup | Automated Traefik (`*.localhost`) |
| **Local Infrastructure** | Manual service configs | Manual resource configs | Helm charts / manifests | Helm charts / manifests | Helm charts / manifests | Automated Postgres, NATS, Traefik |
| **Resource Overhead** | Low (containers only) | Low to Medium | Medium to High (k8s control plane) | Medium to High (k8s control plane) | High (full k8s control plane) | Low (containers only) |

## Flisk vs Docker Compose

[Docker Compose](https://docs.docker.com/compose/) is the container industry standard for defining and running multi-container Docker applications via declarative YAML manifests. Modern Compose includes [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) for synchronized file watching and [Compose Profiles](https://docs.docker.com/compose/how-tos/profiles/) for selective service startup.

### When Docker Compose is the better choice

- **Small architectures (2 to 5 services):** If your stack consists of a handful of services that you already wrote and containerized, a single `compose.yaml` is simple, transparent, and requires no intermediate manifest abstractions.
- **Teams desiring zero code generation:** Compose files are static and explicitly maintained. If your team dislikes generated files or metadata layers (`service.json`), Compose offers direct, unabstracted control.
- **Native Windows workflows without WSL2:** Docker Compose runs natively on Windows with Docker Desktop. Flisk startup requires Linux containers inside Ubuntu on WSL2 (native Windows supports Flisk CLI inspection only).
- **Established workflows:** If your team already has a battle-tested Compose setup with custom overrides and volume configurations that developers are happy with, replacing it with Flisk adds unnecessary churn.

### When Flisk is the better choice

- **Medium to large landscapes (10 to 50+ services):** In larger systems, maintaining monolithic Compose files or complex multi-file overrides becomes difficult to navigate and maintain across teams. Flisk organizes services into decoupled directories and stacks.
- **Selective stack execution with dependency awareness:** While Compose profiles allow grouping, starting a subset often requires remembering profile flags. Flisk provides first-class stack management (`flisk up <stack>`) with dry-run previews (`flisk up <stack> --dry-run`).
- **Automated ingress and local domain routing:** In Compose, developers must manually configure reverse proxies or map host ports (often leading to port collisions). Flisk automatically manages Traefik, routing traffic over clean `*.localhost` domains, allocating collision-free host ports from bounded fallback ranges, and routing sticky sessions for agent workloads.
- **Automated database provisioning:** Flisk automatically provisions a shared PostgreSQL instance while creating dedicated, isolated databases per stack, wiring connection strings without manual database creation scripts.
- **Fine-grained live updates:** While `compose watch` supports file sync and rebuilds, Tilt's underlying file sync engine (orchestrated by Flisk) handles granular layer caching, live updates, and process reloads without manual watch block syntax in YAML.

### Migration between Flisk and Docker Compose

- **From Docker Compose to Flisk:** Existing containers can be migrated incrementally as bring-your-own resources using `flisk resource <name> --type byo --dockerfile <path>` or `flisk resource <name> --type byo --image <image>`. Port mappings and health checks transfer into `service.json`. Shared services like PostgreSQL or ingress proxies can be handed over to Flisk's built-in platform services. See [Gradual Adoption](gradual-adoption.md) and [Bring-your-own resources](byo.md).
- **From Flisk to Docker Compose:** Flisk does not provide an automated command to export a project into a plain `compose.yaml` (see [Leaving Flisk](leaving-flisk.md)). To migrate away, developers write a top-level `compose.yaml` referencing existing service source directories and Dockerfiles, specify port mappings, define `depends_on` conditions, and configure shared networks manually.

## Flisk vs Plain Tilt

[Tilt](https://tilt.dev/) is an orchestration tool that automates container builds, deployments, and live updates. Tilt configurations are written in Starlark (a Python dialect) in a `Tiltfile`. Flisk does not replace Tilt; **Flisk generates the Tiltfile and orchestrates Tilt under the hood.**

### When Plain Tilt is the better choice

- **Starlark expertise and custom build pipelines:** Teams with experienced platform engineers who prefer authoring custom Starlark logic, complex build hooks, multi-repository clones, or bespoke live-update extensions.
- **Developing directly against Kubernetes:** Plain Tilt natively deploys to local or remote Kubernetes clusters using `k8s_yaml()` and `k8s_resource()`. Flisk focuses exclusively on Docker Engine without a Kubernetes cluster.
- **Non-standard topologies:** If your services do not follow a standardized structure and require unconventional build contexts or non-container host processes running alongside containers.

### When Flisk is the better choice

- **Avoiding Starlark maintenance:** Writing and maintaining hundreds of lines of Starlark code across multiple microservices requires specialized knowledge. Flisk abstracts this into simple, declarative `service.json` manifests.
- **Convention over configuration:** Flisk automatically writes the Tiltfile, manages golden Docker build layers, handles container synchronization rules, and verifies configuration drift (`flisk config verify`).
- **Complete local platform included:** Plain Tilt expects you to bring your own ingress proxy, database provisioning, and network topology. Flisk configures Traefik, PostgreSQL, port conflict resolution, and health-checking automatically.
- **Standardized developer scaffolding:** Flisk provides commands like `flisk resource` to generate boilerplate, starter code, and service manifests in seconds.

### Migration between Flisk and Plain Tilt

- **From Plain Tilt to Flisk:** Developers translate custom `Tiltfile` resources into Flisk `service.json` files and remove custom Starlark scripts, allowing Flisk to generate `.tdk/.tdk-out/Tiltfile`.
- **From Flisk to Plain Tilt:** Running `flisk eject` documents how to invoke Tilt directly against Flisk's generated Starlark output via `tilt up -f .tdk/.tdk-out/Tiltfile -- --focus=<stack>`. Alternatively, developers can copy the generated `Tiltfile` to the project root and maintain the Starlark configuration directly (see [Leaving Flisk](leaving-flisk.md)).

## Flisk vs Skaffold

[Skaffold](https://skaffold.dev/) is a Google-maintained command-line tool that facilitates continuous development for Kubernetes applications. Skaffold manages the workflow for building, pushing, and deploying applications to a Kubernetes cluster (local or remote), with support for [file synchronization](https://skaffold.dev/docs/pipeline-stages/filesync/), log streaming, and port forwarding.

### When Skaffold is the better choice

- **Kubernetes parity during development:** When application development requires native Kubernetes constructs (such as Custom Resource Definitions, Pod disruption budgets, ServiceAccounts, RBAC, or NetworkPolicies) that cannot be simulated on Docker Engine.
- **Unified local and CI/CD pipelines:** Skaffold profiles allow teams to use a single `skaffold.yaml` pipeline for local inner-loop iteration (`skaffold dev`) and CI/CD deployment (`skaffold run` / `skaffold deploy`).
- **Remote or shared development clusters:** Skaffold excels at building locally and deploying into personal namespaces on remote GKE, EKS, or Azure Kubernetes Service clusters.
- **Multiple build artifact types:** Native integration with tools like Jib (for Java), Cloud Native Buildpacks, and Bazel without requiring Dockerfiles.

### When Flisk is the better choice

- **Eliminating Kubernetes resource overhead:** Running a local Kubernetes cluster (such as kind, minikube, or Docker Desktop Kubernetes) typically consumes 4 GiB to 8 GiB of RAM just for control plane components before running application workloads. Flisk runs on plain Docker with minimal memory overhead.
- **Faster startup and inner loop:** Flisk does not require building images into a local container registry or side-loading images into a local cluster node. Tilt's live update synchronizes file changes into running containers directly.
- **No Kubernetes manifest authoring for local dev:** Developers do not need to write or maintain complex Kubernetes Deployments, Services, or Ingress manifests just to test features locally. Production deployment remains managed by Helm, Kustomize, or Argo CD (see [Using Flisk alongside Helm](with-helm.md)).
- **Turnkey local routing and dependencies:** Ingress domains (`*.localhost`) and per-stack databases are ready immediately without writing Kubernetes ingress controllers or database operators.

### Migration between Flisk and Skaffold

- **From Skaffold to Flisk:** Teams keep their production Helm charts or Kubernetes manifests for CI/CD and deployment, but introduce `service.json` files for local inner-loop development. This eliminates the requirement for developers to run local Kubernetes clusters on their workstations.
- **From Flisk to Skaffold:** Author a `skaffold.yaml` declaring build artifacts from existing service Dockerfiles, write corresponding Kubernetes manifests or Helm charts, configure file sync rules, and run `skaffold dev` pointing to a local or remote Kubernetes context.

## Flisk vs DevSpace

[DevSpace](https://www.devspace.sh/) is an open-source, client-only developer CLI for Kubernetes. It allows developers to develop applications directly inside Kubernetes namespaces or virtual clusters ([vcluster](https://www.vcluster.com/)), supporting bi-directional file synchronization, in-container terminal execution, and port forwarding.

### When DevSpace is the better choice

- **In-cluster development workflows:** Developing code directly inside pods running on remote staging or development clusters, keeping the local workstation lightweight.
- **Virtual cluster (`vcluster`) environments:** Teams utilizing isolated multi-tenant virtual clusters in the cloud for high-fidelity reproduction of production environments.
- **Bi-directional file synchronization:** Workflows requiring bi-directional file sync between the developer workstation and remote containers.
- **Interactive in-pod debugging:** Seamless terminal streaming and interactive shell execution configured declaratively in `devspace.yaml`.

### When Flisk is the better choice

- **Local-first and offline development:** Complete independence from remote cluster availability, network connectivity, or cloud hosting costs. Everything runs on the local laptop.
- **Simplicity without cluster management:** No need to provision, manage, or authenticate against Kubernetes namespaces or virtual clusters.
- **Multi-service coordination:** Flisk manages whole stacks of services locally, configuring inter-service networking and routing under a unified Traefik gateway automatically.
- **Fast, low-latency live updates:** Tilt synchronizes changes into local Docker containers without network transfer overhead or sync conflict reconciliation.

### Migration between Flisk and DevSpace

- **From DevSpace to Flisk:** Replace `devspace.yaml` development configurations with local `service.json` definitions, transitioning from remote pod development to local Docker container execution.
- **From Flisk to DevSpace:** Create a `devspace.yaml` targeting a Kubernetes cluster, define build and deployment pipelines (via Helm or kubectl), and configure dev sync rules and port forwarding.

## Flisk vs kind and minikube

[kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker) and [minikube](https://minikube.sigs.k8s.io/) are tools for running local Kubernetes clusters. kind runs cluster nodes as Docker containers, while minikube supports VMs, Docker, and bare-metal environments.

**Note:** kind and minikube are cluster infrastructure providers, not application live-reloading or developer workflow orchestrators. They provide the Kubernetes cluster; tools like Helm, kubectl, Skaffold, or Tilt must run on top of them.

### When kind or minikube is the better choice

- **Developing and testing Kubernetes operators and CRDs:** If your software interacts with the Kubernetes API, reconciles Custom Resources, or implements admission webhooks, a real Kubernetes cluster is mandatory.
- **Testing cluster networking and policies:** Validating CNI plugins, NetworkPolicies, Service Meshes (Istio, Linkerd), or Ingress Controller implementations locally.
- **End-to-end Helm and manifest validation:** Verifying that production Helm charts or Kustomize manifests install cleanly and pass integration smoke tests before pushing to shared environments.

### When Flisk is the better choice

- **Application and API development:** When building microservices, web applications, background workers, or AI agents, Kubernetes is an operational deployment target, not an application dependency.
- **Resource conservation:** Running etcd, kube-apiserver, kube-controller-manager, and kubelet locally consumes substantial CPU cycles and several gigabytes of RAM. Flisk eliminates this overhead by running directly on Docker Engine.
- **Zero image transfer overhead:** In kind, local images must be explicitly loaded into cluster nodes (`kind load docker-image`), which slows down the inner iteration loop. In Flisk, Docker builds and Tilt live updates execute immediately in the host Docker daemon.
- **Automatic developer ingress:** Flisk provides clean `*.localhost` domain routing out of the box without requiring MetalLB, ingress controllers, or `minikube tunnel` processes.

### Migration between Flisk and kind/minikube

- **From kind/minikube to Flisk:** Maintain Helm charts for CI/CD and pre-merge validation, but use Flisk for local daily feature iteration. Developers avoid having to run `minikube start` or `kind create cluster` on their development machines.
- **From Flisk to kind/minikube:** Start a cluster (`kind create cluster` or `minikube start`), install necessary ingress controllers or operators, package services into Helm charts, deploy them to the cluster, and configure port forwarding or tunnels.

## When Flisk Is Not a Fit

To make an honest assessment, there are architectural and organizational scenarios where Flisk is not recommended:

1. **Requires real in-cluster staging or production topology:** If your work requires validating Kubernetes-specific APIs, Custom Resource Definitions (CRDs), admission webhooks, ServiceAccount RBAC, Pod disruption budgets, or service meshes, Flisk does not run Kubernetes. Use kind, minikube, or a remote development cluster.
2. **Native Windows without WSL2:** Flisk relies on Linux container primitives and POSIX shell behaviors. On Windows, startup requires Ubuntu running in WSL2 (`flisk up` exits with code 1 on native Windows). Native Windows supports CLI inspection commands only (`flisk --version`, `flisk doctor`, `flisk up --dry-run`).
3. **Non-containerized software:** Applications that run as native desktop applications, mobile runtimes, or bare-metal binaries without containerization cannot be orchestrated by Flisk.
4. **Already well-served by simple Compose or custom Tiltfiles:** If your project consists of two or three stable services with a working `compose.yaml`, or if your team already maintains an effective `Tiltfile`, introducing Flisk adds an unnecessary manifest layer.
5. **Proprietary cloud services without local container emulators:** If your architecture depends heavily on proprietary managed cloud services that lack containerized emulators (e.g. specialized cloud AI services or complex IAM/VPC topologies), local orchestration cannot replicate the cloud environment.
6. **Code generation outside TypeScript/Bun:** Flisk's built-in application scaffolding generators (`flisk resource --type backend/frontend`) are TypeScript-first. While Go, Python, Rust, and Java are fully supported as bring-your-own resources (`appType: "bring-your-own"`), Flisk will not scaffold their application source code or frameworks out of the box.

## Further Reading

- [Honest Comparison and Known Limits](compare-honest.md)
- [Scope and Non-Goals: Local Dev vs Production](scope.md)
- [Working Alongside Helm](with-helm.md)
- [Bring-Your-Own Resources](byo.md)
- [Leaving Flisk: What You Keep and What You Lose](leaving-flisk.md)
- [Public Claims Registry and Benchmark Evidence](claims.md)
