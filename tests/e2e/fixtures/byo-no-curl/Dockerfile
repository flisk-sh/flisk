# Busybox image without curl to test health check failure diagnostics (#3107)
FROM busybox:1.37.0@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec
WORKDIR /app
RUN echo "ok" > /app/health
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/app"]
