# Probe for the external providers e2e (verify-byo-providers.sh). It is also the stand-in local simulator: GET /health.
FROM python:3.12-alpine
RUN adduser -D -u 10001 probe
WORKDIR /app
COPY probe.py .
USER probe
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '4500') + '/health', timeout=2)"
CMD ["python", "probe.py"]
