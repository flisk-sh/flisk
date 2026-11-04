# Probe for the infrastructure frameworks e2e (verify-byo-infra.sh): it reaches Redis, Qdrant, RabbitMQ, NATS, MinIO and MLflow
# only through the settings their `provides` put in its environment.
FROM python:3.12-alpine@sha256:e6dae589c1c05976188fd3bd019afd091445fc533ed2ea29001beddc7368a9c8
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt && adduser -D -u 10001 probe
COPY probe.py .
USER probe
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '4500') + '/health', timeout=2)"
CMD ["python", "probe.py"]
