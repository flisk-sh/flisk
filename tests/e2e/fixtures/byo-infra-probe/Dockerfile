# Probe for the infrastructure presets e2e (verify-byo-infra.sh): it reaches Redis, Qdrant and RabbitMQ only through the
# REDIS_URL, QDRANT_URL and AMQP_URL their `provides` put in its environment.
FROM python:3.12-alpine
RUN pip install --no-cache-dir pika==1.3.2
WORKDIR /app
COPY probe.py .
CMD ["python", "probe.py"]
