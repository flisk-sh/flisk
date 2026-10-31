# Probe for the external providers e2e (verify-byo-providers.sh). It is also the stand-in local simulator: GET /health.
FROM python:3.12-alpine
WORKDIR /app
COPY probe.py .
CMD ["python", "probe.py"]
