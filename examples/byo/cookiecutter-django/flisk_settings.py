# Extends the generated local settings for running behind Flisk's Traefik, which sends the Host header
# api.<project>.localhost. local.py hard-codes ALLOWED_HOSTS to localhost and 127.0.0.1, which does not include that name.
from .local import *  # noqa: F403

ALLOWED_HOSTS = ["*"]  # noqa: S104
