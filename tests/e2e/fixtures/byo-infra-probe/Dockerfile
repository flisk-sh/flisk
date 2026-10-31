# Probe for the infrastructure presets e2e (verify-byo-infra.sh): it reaches Redis, Qdrant and RabbitMQ only through the
# REDIS_URL, QDRANT_URL and AMQP_URL their `provides` put in its environment.
FROM python:3.12-alpine
RUN pip install --no-cache-dir pika==1.3.2 && adduser -D -u 10001 probe
WORKDIR /app
COPY probe.py .
USER probe
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '4500') + '/health', timeout=2)"
CMD ["python", "probe.py"]
