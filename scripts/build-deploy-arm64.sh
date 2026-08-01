#!/usr/bin/env bash
set -euo pipefail

readonly WWV_SOURCE_DIR="${WWV_SOURCE_DIR:-$PWD}"
readonly TARGET="${TARGET:-raspberrypi.local}"
readonly IMAGE="${WWV_IMAGE:-worldwideview-wwv:latest}"
readonly ROLLBACK_IMAGE="${WWV_ROLLBACK_IMAGE:-worldwideview-wwv:rollback}"
readonly REGISTRY_PORT="${LOCAL_REGISTRY_PORT:-5000}"
readonly TUNNEL_PORT="${REMOTE_TUNNEL_PORT:-55000}"
readonly REGISTRY_NAME="${REGISTRY_NAME:-wwv-build-registry}"
readonly REGISTRY_IMAGE="localhost:${REGISTRY_PORT}/worldwideview-wwv:latest"
readonly REMOTE_REGISTRY_IMAGE="localhost:${TUNNEL_PORT}/worldwideview-wwv:latest"
readonly REMOTE_SOURCE_DIR="${REMOTE_SOURCE_DIR:-/srv/worldwideview}"
readonly COMPOSE_FILE="${COMPOSE_FILE:-/srv/worldwideview/docker-compose.rpi.yml}"
readonly ENV_FILE="${ENV_FILE:-/etc/worldwideview.env}"
readonly PUBLIC_ENGINE_URL="${PUBLIC_ENGINE_URL:-http://${TARGET}:5000}"

for command in colima docker ssh rsync; do
  command -v "$command" >/dev/null || { echo "Missing dependency: $command" >&2; exit 1; }
done
[[ -f "$WWV_SOURCE_DIR/Dockerfile" ]] || { echo "No Dockerfile in $WWV_SOURCE_DIR" >&2; exit 1; }

if ! colima status >/dev/null 2>&1; then
  colima start
fi

if ! docker container inspect "$REGISTRY_NAME" >/dev/null 2>&1; then
  docker run -d --name "$REGISTRY_NAME" --restart unless-stopped \
    -p "127.0.0.1:${REGISTRY_PORT}:5000" registry:2 >/dev/null
else
  docker start "$REGISTRY_NAME" >/dev/null
fi

if [[ "${1:-}" == "--sync-from-pi" ]]; then
  rsync -a --delete \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' \
    --exclude 'prod/' --exclude '.turbo/' \
    "$TARGET:${REMOTE_SOURCE_DIR}/" "$WWV_SOURCE_DIR/"
fi

docker buildx build --load --platform linux/arm64 \
  --build-arg NEXT_PUBLIC_WWV_AGENT_BUS_ENABLED=true \
  --build-arg "NEXT_PUBLIC_WWV_PLUGIN_DATA_ENGINE_URL=${PUBLIC_ENGINE_URL}" \
  --tag "$IMAGE" --tag "$REGISTRY_IMAGE" "$WWV_SOURCE_DIR"
docker push "$REGISTRY_IMAGE"

ssh -o ExitOnForwardFailure=yes -R "${TUNNEL_PORT}:127.0.0.1:${REGISTRY_PORT}" "$TARGET" \
  "sudo docker builder prune -f >/dev/null; \
   if sudo docker image inspect '$IMAGE' >/dev/null 2>&1; then \
     sudo docker tag '$IMAGE' '$ROLLBACK_IMAGE'; \
   fi; \
   sudo docker pull '$REMOTE_REGISTRY_IMAGE' && \
   sudo docker tag '$REMOTE_REGISTRY_IMAGE' '$IMAGE'"

if ! ssh "$TARGET" \
  "sudo docker compose --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --no-build wwv && \
   for i in \$(seq 1 45); do \
     status=\$(sudo docker inspect -f '{{.State.Health.Status}}' worldwideview-wwv-1 2>/dev/null || true); \
     [ \"\$status\" = healthy ] && exit 0; \
     [ \"\$status\" = unhealthy ] && exit 1; \
     sleep 2; \
   done; exit 1"; then
  echo "Deployment failed; restoring the previous image." >&2
  ssh "$TARGET" \
    "sudo docker tag '$ROLLBACK_IMAGE' '$IMAGE' && \
     sudo docker compose --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --no-build wwv"
  exit 1
fi

ssh "$TARGET" \
  "curl -fsS http://127.0.0.1:3000/api/health && echo && \
   systemctl is-active wwv-agent wwv-headless-browser && df -h / | tail -1"
