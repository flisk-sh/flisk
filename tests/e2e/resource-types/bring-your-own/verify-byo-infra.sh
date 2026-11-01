#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The infrastructure frameworks (`flisk resource --type database --framework redis|qdrant|minio|mlflow`, `--type queue
# --framework nats|rabbitmq`), through a real `flisk up`.
# Needs Docker, Tilt, and a built CLI (cli/dist). Uses an isolated throwaway project with unique names and alternate ports,
# and removes only the containers, networks, volumes and images carrying its own unique project name.
#
# Checks, in order:
#   1. The six resources (MLflow depends on the MinIO) and a probe app that lists them in dependsOn pass `flisk config verify`.
#   2. The probe's generated env file holds the connection settings the frameworks provide.
#   3. Through flisk up and Traefik, the probe's /check does a round trip to each one using only those settings: SET and GET on
#      Redis, a collection on Qdrant, a message on RabbitMQ as guest and on NATS, the MinIO health route, an MLflow experiment
#      and an MLflow artifact uploaded and downloaded through the tracking server.
#   4. The artifact is an object in the MinIO bucket `mlflow` (listed from inside the MLflow container).
#   5. Each container is healthy by its own probe and keeps its data in its own named volume.
#   6. The web UIs answer on 127.0.0.1 only (Qdrant, MinIO console, MLflow, RabbitMQ management), on host ports this script
#      moves away from the defaults with hostPort so a second project (or macOS AirPlay on 5000) cannot take them.
#
# Usage: tests/e2e/resource-types/bring-your-own/verify-byo-infra.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
fixture="$root/tests/e2e/fixtures/byo-infra-probe"
proj="infra$$"
work="$(mktemp -d)/$proj"
mkdir -p "$work"
flisk() { command "${FLISK_BIN:-flisk}" "$@"; }
res="$proj"
wait_seconds=${VERIFY_WAIT_SECONDS:-600}

up_pid=""
cleanup() {
  # Stop the background flisk up first: when a check fails early it is still starting Tilt and containers.
  [ -n "$up_pid" ] && kill "$up_pid" >/dev/null 2>&1 || true
  sleep 1
  pkill -f "tilt up.*$proj" >/dev/null 2>&1 || true
  docker rm -f $(docker ps -aq --filter "name=$proj") >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep "^${proj}" | xargs -r docker network rm >/dev/null 2>&1 || true
  docker volume ls --format '{{.Name}}' | grep "^${proj}" | xargs -r docker volume rm >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}(_|-l[0-9]+)" | xargs -r docker rmi -f >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL infra: $*" >&2; [ -f "$work/up.log" ] && tail -30 "$work/up.log" >&2; exit 1; }

cd "$work"
git init -q .
flisk project --yes >/dev/null
http_port=$((30000 + RANDOM % 2000))
printf '\nFLISK_HTTP_PORT=%s\nFLISK_HTTPS_PORT=%s\nFLISK_POSTGRES_PORT=%s\n' \
  "$http_port" "$((32000 + RANDOM % 2000))" "$((34000 + RANDOM % 2000))" >> .env

flisk resource cache --type database --framework redis --stack app --yes >/dev/null
flisk resource vectors --type database --framework qdrant --stack app --yes >/dev/null
flisk resource store --type database --framework minio --stack app --yes >/dev/null
flisk resource tracking --type database --framework mlflow --stack app --yes >/dev/null
flisk resource bus --type queue --stack app --yes >/dev/null
flisk resource queue --type queue --framework rabbitmq --stack app --yes >/dev/null
mkdir -p "services/app/$res"
cp -R "$fixture/." "services/app/$res/"
(cd "services/app/$res" && flisk resource "$res" --type bring-your-own --stack app \
  --register-existing --dockerfile ./Dockerfile --health-path /health --yes >/dev/null)
# The UI host ports: random ones, so the defaults (5000 is macOS AirPlay) and other projects cannot get in the way.
ui_port() { echo $((36000 + RANDOM % 2000)); }
vectors_ui=$(ui_port) store_ui=$((36000 + 2000 + RANDOM % 1000)) tracking_ui=$((39000 + RANDOM % 1000)) queue_ui=$((40000 + RANDOM % 1000))
# Through the environment: under Bun's node shim, `node -e` arguments do not reach process.argv intact.
EDIT='const fs=require("fs"); const [file,deps,hostPort]=[process.env.F,process.env.DEPS,process.env.HP]; const m=JSON.parse(fs.readFileSync(file,"utf8")); if(deps) m.dependsOn=deps.split(","); if(hostPort) m.extraPorts=m.extraPorts.map(e=>({...e,hostPort:Number(hostPort)})); fs.writeFileSync(file, JSON.stringify(m,null,2)+"\n")'
F="services/app/$res/service.json" DEPS="cache,vectors,queue,bus,store,tracking" node -e "$EDIT"
F="services/app/tracking/service.json" DEPS="store" HP="$tracking_ui" node -e "$EDIT"
F="services/app/vectors/service.json" HP="$vectors_ui" node -e "$EDIT"
F="services/app/store/service.json" HP="$store_ui" node -e "$EDIT"
F="services/app/queue/service.json" HP="$queue_ui" node -e "$EDIT"

# 1. config verify
flisk config verify --json >"$work/verify.json" 2>&1 || fail "config verify refused the presets: $(cat "$work/verify.json")"
echo "PASS config verify accepts the redis, qdrant, minio, mlflow, nats and rabbitmq frameworks and a service that depends on them"

# 3. (2 needs the generated files, which flisk up writes) Round trips through Traefik.
nohup "${FLISK_BIN:-flisk}" up app >"$work/up.log" 2>&1 &
up_pid=$!
url="http://127.0.0.1:$http_port/api/$res/check"
status=000
for _ in $(seq 1 "$wait_seconds"); do
  status="$(curl -s -o "$work/check.json" -m 10 -w '%{http_code}' -H "Host: api.$proj.localhost" "$url" || true)"
  [ "$status" = "200" ] && break
  sleep 2
done

# 2. The provided settings in the probe's generated env file.
env_file="services/app/$res/.autogenerated/.env.backend.autogenerated"
[ -f "$env_file" ] || fail "no generated env file at $env_file"
for line in "REDIS_URL=redis://cache:6379" "QDRANT_URL=http://vectors:6333" "AMQP_URL=amqp://guest:guest@queue:5672" \
  "NATS_URL=nats://bus:4222" "MINIO_ENDPOINT=http://store:9000" "AWS_ENDPOINT_URL_S3=http://store:9000" \
  "AWS_ACCESS_KEY_ID=minioadmin" "MLFLOW_TRACKING_URI=http://tracking:5000"; do
  grep -qx "$line" "$env_file" || fail "$env_file has no '$line': $(cat "$env_file")"
done
echo "PASS the probe's generated env file holds the settings the frameworks provide"

[ "$status" = "200" ] || fail "GET /api/$res/check returned $status: $(cat "$work/check.json" 2>/dev/null)"
echo "PASS through flisk up and Traefik, the probe reached Redis, Qdrant, RabbitMQ, NATS, MinIO and MLflow (artifact round trip included): $(cat "$work/check.json")"

# 4. The artifact the probe uploaded through MLflow is an object in the MinIO bucket (listed from inside the MLflow container,
# which has boto3 and the MinIO settings from the store's provides).
tracking_container="${proj}-app-autogenerated-tracking-1"
objects="$(docker exec "$tracking_container" python3 -c "import boto3; r=boto3.client('s3').list_objects_v2(Bucket='mlflow'); print(len(r.get('Contents', [])))" 2>&1 || true)"
[ "${objects##*$'\n'}" -ge 1 ] 2>/dev/null || fail "no object in the MinIO bucket 'mlflow' (list said: $objects)"
echo "PASS the artifact went through MLflow into the MinIO bucket 'mlflow' ($objects object(s))"

# 5. Each container is healthy and keeps its data in its own named volume.
for pair in "cache:/data" "vectors:/qdrant/storage" "queue:/var/lib/rabbitmq" "bus:/data" "store:/data" "tracking:/data"; do
  name="${pair%%:*}" target="${pair#*:}"
  container="${proj}-app-autogenerated-$name-1"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo missing)"
  [ "$health" = healthy ] || fail "$container is '$health', expected healthy"
  mount="$(docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$target\"}}{{.Type}} {{.Name}}{{end}}{{end}}" "$container")"
  case "$mount" in "volume "*"$name-data") ;; *) fail "$container mounts '$mount' at $target, expected the named volume $name-data" ;; esac
  echo "PASS $name is healthy and keeps $target in the named volume ${mount#volume }"
done

# 6. The web UIs answer on 127.0.0.1, on the host ports service.json names.
for pair in "$vectors_ui:/dashboard/" "$store_ui:/" "$tracking_ui:/" "$queue_ui:/"; do
  port="${pair%%:*}" path="${pair#*:}"
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$port$path" || true)"
  case "$code" in 2??|3??) ;; *) fail "the UI on 127.0.0.1:$port$path answered $code" ;; esac
  echo "PASS the UI on 127.0.0.1:$port answers ($code)"
done
published="$(docker ps --format '{{.Ports}}' | grep -E "0\.0\.0\.0:($vectors_ui|$store_ui|$tracking_ui|$queue_ui)->" || true)"
[ -z "$published" ] || fail "a UI port is published on every interface: $published"
echo "PASS no UI port is published on 0.0.0.0"
