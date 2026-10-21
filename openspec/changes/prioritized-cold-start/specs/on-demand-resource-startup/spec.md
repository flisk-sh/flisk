# Spec Delta

## Purpose

Lets a resource opt out of `flisk up`'s normal sequential bring-up and instead start on its own first request, so one request against a large landscape doesn't wait behind every other resource's startup.

## ADDED Requirements

### Requirement: Deferred Start Opt-In

A backend resource with a `sablier` manifest block SHALL be able to mark itself deferred for the current `flisk up` run. A deferred resource's image SHALL still be built during `flisk up`, but its container SHALL NOT be started as part of `flisk up`'s normal bring-up sequence. `deferStart` requires `sablier.enable: true` and remains subject to the Sablier license gate.

#### Scenario: Deferred resource is not started during flisk up

- **WHEN** `flisk up` runs a landscape containing a resource with deferred start enabled
- **THEN** that resource's image build completes during the run, under the image tag its compose service declares, so its first request can start it without building
- **AND** the resource's container is not started, and `flisk up` does not wait on it to become healthy before finishing bring-up of the rest of the landscape

#### Scenario: Non-opted-in resource is unaffected

- **WHEN** `flisk up` runs a landscape containing a resource with no `sablier` block, or a `sablier` block without deferred start enabled
- **THEN** that resource is built and started as part of `flisk up`'s normal dependency-graph sequencing, exactly as before this change

### Requirement: Deferred Resource Stays Discoverable Before Its First Start

A deferred resource's Traefik route SHALL be registered and routable regardless of whether its container has ever been created, so the first request to it can be received and acted on rather than returning "no route" or a connection error.

#### Scenario: Route exists before first start

- **WHEN** `flisk up` finishes bring-up of a landscape containing a deferred resource that has never been started this session
- **THEN** a request to that resource's route reaches Traefik and is recognized as targeting a known, deferred resource, rather than returning "no route" or a connection error

#### Scenario: Route still resolves after the resource has run and stopped

- **WHEN** a deferred resource has run at least once this session and its container is now stopped
- **THEN** a request to that resource's route still reaches Traefik and is recognized as targeting that resource, using the same or an equivalent route as before it ever ran

### Requirement: First Request Starts The Deferred Resource Outside Tilt's Normal Queue

The first request to a deferred resource's route SHALL start that resource's container without waiting for Tilt's normal resource build and startup ordering. When its prebuilt image is available, the wake gateway SHALL start it directly through its generated Compose invocation. This bypasses Tilt's build queue, but startup can still be delayed by Docker daemon contention; while the start continues, the caller SHALL receive a bounded response as specified by "A Waking Request Waits For Health, Not Just Start".

#### Scenario: Request during a large, in-progress flisk up

- **WHEN** a request is made to a deferred resource's route while `flisk up` is still bringing up other, unrelated resources elsewhere in the landscape
- **THEN** the deferred resource's start is dispatched without waiting for Tilt's normal resource queue to reach it
- **AND** the caller receives the resource response if it becomes healthy within the hold window, or a `503` with `Retry-After` if it does not

#### Scenario: Request after flisk up has finished

- **WHEN** a request is made to a deferred resource's route after `flisk up` has finished bringing up the rest of the landscape
- **THEN** the deferred resource starts immediately in response to that request

### Requirement: Waking A Resource Also Wakes Its Required Dependencies

Waking a deferred resource SHALL also wake required dependencies that are themselves deferred resources and SHALL wait for each to be ready before evaluating the requesting resource's own health. Dependencies managed as always-on infrastructure by the normal `flisk up` flow are not sent through the wake gateway; this change does not guarantee recovery of an infrastructure dependency that is stopped or unhealthy.

#### Scenario: Deferred resource depends on another deferred resource

- **WHEN** a request wakes a deferred resource whose required dependencies include another deferred resource that is not currently running
- **THEN** that deferred dependency is also started as part of the same wake, and the requesting resource's health checks are not evaluated against a still-cold dependency

#### Scenario: Always-on infrastructure dependency is unavailable

- **WHEN** a request wakes a deferred resource whose database or messaging infrastructure is stopped or unhealthy
- **THEN** this change makes no promise to start or recover that infrastructure dependency
- **AND** the wake fails or times out according to the configured wake timeout rather than reporting the resource healthy

#### Scenario: Unrelated resource is not woken

- **WHEN** a request wakes a deferred resource
- **THEN** resources that are not among its required startup dependencies are not started as a side effect of that wake

### Requirement: A Waking Request Waits For Health, Not Just Start

A request that triggers a deferred resource's startup SHALL be held until the resource passes its health check, until a bounded hold window elapses, or until a bounded timeout elapses, rather than being answered as soon as the container process starts. The caller SHALL always receive a response; the connection SHALL NOT be dropped silently.

#### Scenario: Client receives the real response

- **WHEN** a request wakes a deferred resource that becomes healthy within the hold window
- **THEN** the client's request is held and then answered by the resource once it is healthy, rather than receiving an immediate "starting" response with no real answer

#### Scenario: Startup outlasts the hold window

- **WHEN** a request wakes a deferred resource that is still not healthy when the hold window ends (e.g. the Docker daemon is saturated by a full `flisk up` bring-up)
- **THEN** the request is answered with `503` and a `Retry-After` header while the start continues in the background
- **AND** a retry, or any other request that arrives meanwhile, joins that same start instead of starting the resource again, and is answered by the resource once it is healthy

#### Scenario: Startup exceeds the timeout

- **WHEN** a deferred resource does not become healthy within its configured wake timeout
- **THEN** the held request fails with a clear timeout error rather than hanging indefinitely

### Requirement: Deferred Status Is Reported Distinctly From Failure

`flisk up` and `flisk doctor` SHALL report a deferred, not-yet-started resource as intentionally deferred, and SHALL NOT report it the same way as a stalled or failed resource.

#### Scenario: flisk up summary

- **WHEN** `flisk up` finishes bring-up of a landscape containing deferred resources that have not yet received a request
- **THEN** the summary output lists those resources as deferred rather than omitting them or listing them as pending/stalled

#### Scenario: flisk doctor

- **WHEN** `flisk doctor` runs against a landscape containing a deferred, not-yet-started resource
- **THEN** it does not flag that resource as unhealthy or stuck solely because it has not started
