FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
