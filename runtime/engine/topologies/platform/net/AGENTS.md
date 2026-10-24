# AGENTS.md - Networking & Proxy

## Purpose

Traefik reverse proxy, networking configuration, and service routing.

## Key Files

### Traefik
- **`proxy.star`** - Traefik configuration generation
- **`labels.star`** - Docker labels for Traefik routing

### Network Management
- **`network.star`** - Docker network setup
- **`hosts.star`** - /etc/hosts file management

## Common Tasks

### Generate Traefik labels
```starlark
load("./proxy.star", "generate_traefik_labels")
labels = generate_traefik_labels(
    resource_name="order-management-backend",
    port=4000,
    host="order.backend.{project}.localhost",
    path_prefix="/api/orders"
)
```

### Output
```python
{
    "traefik.enable": "true",
    "traefik.http.routers.order-management-backend.rule": "Host(`order.backend.{project}.localhost`) && PathPrefix(`/api/orders`)",
    "traefik.http.routers.order-management-backend.entrypoints": "web",
    "traefik.http.services.order-management-backend.loadbalancer.server.port": "4000"
}
```

## Architecture

```
Internet/localhost
       ↓
   Traefik (port 80/443)
       ↓
   Routes to services by Host/Path
       ↓
   Service containers
```

## Integration

- Called by `resources/` when creating service resources
- Used by `platform/docker/` for Docker Compose generation
- Labels applied to docker_build and docker_compose

## Local Development

Services accessible at:
- `{service}.backend.{project}.localhost`
- `{service}.frontend.{project}.localhost`

Managed in `/etc/hosts` automatically.
