# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""A GET of the bare /api/<name> of a bring-your-own service redirects to /api/<name>/.

Found running the imported example-voting-app: Traefik strips /api/vote, so the page served at /api/vote resolved its
relative form action (./) and stylesheet against /api/, where nothing is routed. Voting returned 404 and the results page
never loaded its scripts. With the trailing slash both pages work, so Flisk redirects the bare prefix, for GET and HEAD
only, so an API client's POST to the bare path is never redirected.
"""

from __future__ import annotations

import json
import os
import re
import subprocess

from test_backend_traefik_labels import REPO_ROOT, pytestmark, run_traefik_labels  # noqa: F401

PARSER = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "manifest" / "parser.star"

BODY = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

def labels(app_type):
    manifest = {'appType': app_type, 'stack': 'voting', 'port': 80}
    return get_backend_traefik_labels('vote', 'vote.voting.local', '', 'vote', 80, '', manifest=manifest)

r = {'labels': labels('%s')}
"""


def test_a_bring_your_own_service_redirects_its_bare_prefix_for_get_and_head(tmp_path):
    labels = run_traefik_labels(tmp_path, "starter", BODY % "bring-your-own")

    router = "traefik.http.routers.starter-vote-slash"
    assert labels[router + ".rule"] == (
        "Host(`api.starter.localhost`) && Path(`/api/vote`) && (Method(`GET`) || Method(`HEAD`))"
    )
    assert labels[router + ".middlewares"] == "starter-vote-slash"
    # Above the -project router (PathPrefix) so the exact bare path is matched here first.
    assert int(labels[router + ".priority"]) > int(labels["traefik.http.routers.starter-vote-project.priority"])

    # Compose unescapes $$ to $, which is what Traefik reads.
    middleware = "traefik.http.middlewares.starter-vote-slash.redirectregex"
    regex = labels[middleware + ".regex"].replace("$$", "$")
    replacement = labels[middleware + ".replacement"].replace("$$", "$")
    go_style = replacement.replace("${1}", r"\1").replace("${2}", r"\2")
    for url, expected in [
        ("http://api.starter.localhost/api/vote", "http://api.starter.localhost/api/vote/"),
        ("http://api.starter.localhost:8080/api/vote?x=1", "http://api.starter.localhost:8080/api/vote/?x=1"),
    ]:
        match = re.match(regex, url)
        assert match, (regex, url)
        assert match.expand(go_style) == expected
    # Never a loop: the redirected URL does not match again, nor does a longer path.
    assert not re.match(regex, "http://api.starter.localhost/api/vote/")
    assert not re.match(regex, "http://api.starter.localhost/api/voters")


def test_a_scaffolded_backend_api_gets_no_redirect(tmp_path):
    labels = run_traefik_labels(tmp_path, "starter", BODY % "backend")

    assert not any("-slash" in key for key in labels)


REGEX_BODY = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {'appType': 'bring-your-own', 'stack': 'voting', 'port': 80, 'apiPath': '/api/v1.2~x'}
r = {'labels': get_backend_traefik_labels('vote', 'vote.voting.local', '', 'vote', 80, '', manifest=manifest)}
"""


def test_an_api_path_with_a_dot_matches_only_itself(tmp_path):
    """`.` and `~` are valid in apiPath (the parser accepts them); the regex must treat them as literal characters."""
    labels = run_traefik_labels(tmp_path, "starter", REGEX_BODY)

    regex = labels["traefik.http.middlewares.starter-vote-slash.redirectregex.regex"].replace("$$", "$")
    assert re.match(regex, "http://api.starter.localhost/api/v1.2~x")
    assert not re.match(regex, "http://api.starter.localhost/api/v1x2~x")



def _api_path_errors(tmp_path, values):
    """generated_string_error for a manifest whose apiPath is each of `values`, through Tilt's interpreter."""
    (tmp_path / ".flisk").mkdir(exist_ok=True)
    (tmp_path / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "starter"}}))
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        "load('{}', 'generated_string_error')\n"
        "r = [generated_string_error({{'apiPath': v}}) for v in {}]\n"
        "fail('RESULT' + encode_json(r))\n".format(PARSER, json.dumps(values))
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True, text=True, timeout=180, cwd=tmp_path,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    output = proc.stdout + proc.stderr
    marker = "Error in fail: RESULT"
    assert marker in output, output[-3000:]
    return json.loads(output.split(marker, 1)[1].strip())


def test_the_parser_refuses_regex_characters_in_api_path_and_accepts_what_the_cli_accepts(tmp_path):
    bad = ["/api/a+b", "/api/a*", "/api/(x)", "/api/[x]", "/api/a?b", "/api/a|b", "/api/a$b", "api/vote"]
    good = ["/api/vote", "/api/v1.2", "/api/~user", "/api/my_app-2"]

    errors = _api_path_errors(tmp_path, bad + good)

    for value, error in zip(bad, errors[: len(bad)]):
        assert error and "apiPath" in error, (value, error)
    for value, error in zip(good, errors[len(bad):]):
        assert not error, (value, error)
