# One backend with Helm

This is a handwritten Kubernetes values example for the backend in [`one-backend`](../one-backend/README.md). It targets bjw-s-labs/app-template chart `5.2.1` and uses the same application source, image repository/tag, and HTTP port. The sample is a starting point, not a supported production chart.

Build and publish the image from `../one-backend/services/one-backend/api` using your existing CI or image workflow to a registry your cluster can access. Update the repository and tag in `values.yaml` to that image. The local Flisk workflow builds the service for Docker + Tilt; it does not publish it for the cluster.

The example deliberately leaves replicas, readiness/liveness probes, ingress, PVCs, resource sizing, security context, node selectors, IRSA, and HPA to your cluster deployment decisions. Frontend `*.localhost` routing is local Traefik behavior, not a cluster Ingress or Gateway. A worker needs an explicit decision about `Job` versus `CronJob` and its schedule; the example invents neither.

The `service.json` fields are a conceptual guide, not an automatic translation: `appName` resembles a release/controller identity, `appType` suggests but does not define a workload, `port` resembles a Service port, `healthCheckPath` may inform probes, and `dependsOn` does not translate to a chart hook or cluster startup order. Local Postgres should become an external database or an explicitly managed chart dependency.

Validate/render with Helm and the pinned OCI chart, without installing it into a cluster:

```bash
helm pull oci://ghcr.io/bjw-s-labs/helm/app-template \
  --version 5.2.1 --untar --untardir /tmp/tdk-helm-example
helm lint /tmp/tdk-helm-example/app-template --values values.yaml
helm template api /tmp/tdk-helm-example/app-template --values values.yaml
```

Chart reference and matching schema/docs:

- [Official app-template documentation](https://bjw-s-labs.github.io/helm-charts/docs/app-template/)
- [Chart 5.2.1 release notes](https://github.com/bjw-s-labs/helm-charts/releases/tag/app-template-5.2.1)
- [Version 5.2.1 values schema](https://raw.githubusercontent.com/bjw-s-labs/helm-charts/app-template-5.2.1/charts/other/app-template/values.schema.json)
