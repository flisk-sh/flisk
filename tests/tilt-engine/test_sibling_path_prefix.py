# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Two backends whose names share a prefix (`vote`, `voters`) each get only their own requests (#3197).

A bare PathPrefix(`/api/vote`) also matched `/api/voters`, which then reached `vote` with the prefix stripped
mid-word (`/rs`). The project, management and stack routers now match on a path-segment boundary.

`route()` replays a request against generated labels the way Traefik v3 does: the matching router with the highest
priority wins (an unset priority is the rule's length), then its stripprefix middleware runs. The evaluator tests
below need no Tilt; the generator tests evaluate the real Starlark and are skipped without the tilt CLI.

Spec / Issue: https://github.com/flisk-sh/flisk/issues/3197
"""

from __future__ import annotations

import re
import shutil

import pytest

from test_backend_traefik_labels import run_traefik_labels

API_HOST = "api.testproj.localhost"

# --- A small evaluator for the rule matchers Flisk emits: Host, Path, PathPrefix, &&, || and parentheses. ---

_TOKEN = re.compile(r"\s*(?:(\|\|)|(&&)|(\()|(\))|(Host|Path|PathPrefix)\(`([^`]*)`\))")


def _tokenize(rule: str) -> list[tuple[str, str]]:
    tokens, pos = [], 0
    rule = rule.strip()
    while pos < len(rule):
        m = _TOKEN.match(rule, pos)
        assert m, f"unsupported rule syntax at {rule[pos:]!r}"
        if m[1]:
            tokens.append(("or", ""))
        elif m[2]:
            tokens.append(("and", ""))
        elif m[3]:
            tokens.append(("(", ""))
        elif m[4]:
            tokens.append((")", ""))
        else:
            tokens.append((m[5], m[6]))
        pos = m.end()
    return tokens


def rule_matches(rule: str, host: str, path: str) -> bool:
    """True when Traefik v3 would match `rule` for this request. `&&` binds tighter than `||`."""
    tokens = _tokenize(rule)
    pos = 0

    def atom() -> bool:
        nonlocal pos
        kind, value = tokens[pos]
        pos += 1
        if kind == "(":
            result = disjunction()
            assert tokens[pos][0] == ")", rule
            pos += 1
            return result
        if kind == "Host":
            return host.lower() == value.lower()
        if kind == "Path":
            return path == value
        if kind == "PathPrefix":
            return path.startswith(value)
        raise AssertionError(f"unexpected token {kind} in {rule!r}")

    def conjunction() -> bool:
        nonlocal pos
        result = atom()
        while pos < len(tokens) and tokens[pos][0] == "and":
            pos += 1
            result = atom() and result
        return result

    def disjunction() -> bool:
        nonlocal pos
        result = conjunction()
        while pos < len(tokens) and tokens[pos][0] == "or":
            pos += 1
            result = conjunction() or result
        return result

    result = disjunction()
    assert pos == len(tokens), f"trailing tokens in {rule!r}"
    return result


def route(labels: dict[str, str], host: str, path: str) -> tuple[str, str] | None:
    """(service, forwarded path) for a request, or None when no router matches."""
    candidates = []
    for key, rule in labels.items():
        m = re.fullmatch(r"traefik\.http\.routers\.(.+)\.rule", key)
        if not m or not rule_matches(rule, host, path):
            continue
        router = m[1]
        priority = int(labels.get(f"traefik.http.routers.{router}.priority", len(rule)))
        candidates.append((priority, router))
    if not candidates:
        return None
    _, router = max(candidates)
    forwarded = path
    for middleware in labels.get(f"traefik.http.routers.{router}.middlewares", "").split(","):
        prefix = labels.get(f"traefik.http.middlewares.{middleware}.stripprefix.prefixes")
        if prefix and forwarded.startswith(prefix):
            forwarded = forwarded[len(prefix):]
            if not forwarded.startswith("/"):
                forwarded = "/" + forwarded
    return labels[f"traefik.http.routers.{router}.service"], forwarded


# --- Evaluator checks: no Tilt needed. ---


def test_bare_path_prefix_matches_a_sibling_name():
    """The rule shape on main before #3197: /api/voters matches the /api/vote router."""
    old_rule = f"Host(`{API_HOST}`) && PathPrefix(`/api/vote`)"
    assert rule_matches(old_rule, API_HOST, "/api/voters")


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/vote", True),
        ("/api/vote/", True),
        ("/api/vote/anything", True),
        ("/api/voters", False),
        ("/api/voters/", False),
        ("/api/vote-extra", False),
    ],
)
def test_segment_boundary_rule(path, expected):
    rule = f"Host(`{API_HOST}`) && (Path(`/api/vote`) || PathPrefix(`/api/vote/`))"
    assert rule_matches(rule, API_HOST, path) is expected


def test_and_binds_tighter_than_or():
    assert rule_matches("Host(`a`) || Host(`b`) && Path(`/x`)", "a", "/y")
    assert not rule_matches("(Host(`a`) || Host(`b`)) && Path(`/x`)", "a", "/y")


# --- Generator checks: the real Starlark labels for `vote` and `voters`. ---

needs_tilt = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

_TWO_SERVICES = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

l = ''
for name in ['vote', 'voters']:
    manifest = {'appType': 'backend', 'stack': name, 'port': 4000}
    l += get_backend_traefik_labels(
        name,
        name + '.backend.testproj.local',
        '/api/v1/' + name,
        name,
        4000,
        '/health',
        manifest=manifest,
    )
r = {'labels': l}
"""


@pytest.fixture
def two_service_labels(tmp_path):
    return run_traefik_labels(tmp_path, "testproj", _TWO_SERVICES)


@pytest.mark.generator
@needs_tilt
@pytest.mark.parametrize(
    ("path", "expected"),
    [
        # -project routers (/api/<name>): the repro from #3197
        ("/api/vote", ("testproj-vote", "/")),
        ("/api/vote/", ("testproj-vote", "/")),
        ("/api/vote/anything", ("testproj-vote", "/anything")),
        ("/api/voters", ("testproj-voters", "/")),
        ("/api/voters/", ("testproj-voters", "/")),
        ("/api/voters/42", ("testproj-voters", "/42")),
        # -management routers (/api/<stack>-management)
        ("/api/vote-management/items", ("testproj-vote", "/items")),
        ("/api/voters-management/items", ("testproj-voters", "/items")),
    ],
)
def test_project_and_management_routers_keep_siblings_apart(two_service_labels, path, expected):
    assert route(two_service_labels, API_HOST, path) == expected


@pytest.mark.generator
@needs_tilt
@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/v1/vote", ("testproj-vote", "/")),
        ("/api/v1/vote/ballots", ("testproj-vote", "/ballots")),
        ("/api/v1/voters", ("testproj-voters", "/")),
        ("/api/v1/voters/ballots", ("testproj-voters", "/ballots")),
    ],
)
def test_stack_routers_keep_siblings_apart(two_service_labels, path, expected):
    # The stack router's path rule matches on any host.
    assert route(two_service_labels, "localhost", path) == expected


@pytest.mark.generator
@needs_tilt
def test_without_a_sibling_voters_is_not_routed_to_vote(tmp_path):
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')
l = get_backend_traefik_labels('vote', 'vote.backend.testproj.local', '/api/v1/vote', 'vote', 4000, '/health',
                               manifest={'appType': 'backend', 'stack': 'vote', 'port': 4000})
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)
    assert route(labels, API_HOST, "/api/voters") is None
    assert route(labels, "localhost", "/api/v1/voters") is None
    assert route(labels, API_HOST, "/api/vote/") == ("testproj-vote", "/")


@pytest.mark.generator
@needs_tilt
def test_stack_router_keeps_its_pre_3197_priority(tmp_path):
    """The longer segment-boundary rule must not outrank routers the stack router used to lose to.

    Traefik ranks a router with no priority by rule length. The default `orders` stack rule grew from 80 to 120 characters,
    past a frontend mounted at `/` (priority 100 + len("/") = 101), so the app host would have started sending
    /api/v1/orders-management to the backend. The stack router now carries the length its rule had before.
    """
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')
l = get_backend_traefik_labels('orders', 'orders.backend.testproj.local', '/api/v1/orders-management', 'orders', 4000,
                               '/health', manifest={'appType': 'backend', 'stack': 'orders', 'port': 4000})
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)
    legacy_rule = "Host(`orders.backend.testproj.local`) || PathPrefix(`/api/v1/orders-management`)"
    assert labels["traefik.http.routers.testproj-orders.priority"] == str(len(legacy_rule))

    # A frontend at `/` on the app host, as frontend_rule emits it.
    labels["traefik.http.routers.testproj-web.rule"] = "(Host(`app.testproj.localhost`) && PathPrefix(`/`))"
    labels["traefik.http.routers.testproj-web.priority"] = "101"
    labels["traefik.http.routers.testproj-web.service"] = "testproj-web"
    assert route(labels, "app.testproj.localhost", "/api/v1/orders-management/x") == (
        "testproj-web",
        "/api/v1/orders-management/x",
    )
    # The stack host still reaches the backend.
    assert route(labels, "orders.backend.testproj.local", "/anything") == ("testproj-orders", "/anything")


@pytest.mark.generator
@needs_tilt
def test_service_named_like_a_management_alias_wins_the_tie(tmp_path):
    """`/api/orders-management` is both the `orders-management` service's own path and the `orders` stack's alias.

    Both routers used to get the same priority, so Traefik picked one arbitrarily. The service with that exact name wins.
    """
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')
l = ''
for name, stack in [('orders', 'orders'), ('orders-management', 'billing')]:
    l += get_backend_traefik_labels(name, stack + '.backend.testproj.local', '/api/v1/' + stack, name, 4000, '/health',
                                    manifest={'appType': 'backend', 'stack': stack, 'port': 4000})
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)
    assert route(labels, API_HOST, "/api/orders-management") == ("testproj-orders-management", "/")
    assert route(labels, API_HOST, "/api/orders-management/items") == ("testproj-orders-management", "/items")
    assert route(labels, API_HOST, "/api/orders/items") == ("testproj-orders", "/items")
    assert route(labels, API_HOST, "/api/billing-management/items") == ("testproj-orders-management", "/items")
