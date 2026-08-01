#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SERVICE_USER="${WWV_USER:-${SUDO_USER:-}}"
if [[ -z "$SERVICE_USER" ]] || ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Set WWV_USER to an existing unprivileged service user." >&2
  exit 1
fi
readonly SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" /opt/wwv-agent /opt/wwv-headless
install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" \
  /var/lib/wwv-agent /var/lib/wwv-browser

rsync -a --delete --exclude node_modules/ "$REPO_DIR/agent/" /opt/wwv-agent/
rsync -a --delete --exclude node_modules/ "$REPO_DIR/headless/" /opt/wwv-headless/
chown -R "$SERVICE_USER:$SERVICE_USER" /opt/wwv-agent /opt/wwv-headless

sudo -u "$SERVICE_USER" npm --prefix /opt/wwv-agent ci --omit=dev
sudo -u "$SERVICE_USER" npm --prefix /opt/wwv-headless install --omit=dev --no-audit --no-fund

for name in wwv-agent wwv-headless; do
  if [[ ! -e "/etc/${name}.env" ]]; then
    install -m 0600 "$REPO_DIR/config/${name}.env.example" "/etc/${name}.env"
  fi
done

for service in wwv-agent wwv-headless-browser; do
  sed -e "s|@WWV_USER@|$SERVICE_USER|g" -e "s|@WWV_HOME@|$SERVICE_HOME|g" \
    "$REPO_DIR/systemd/${service}.service.in" > "/etc/systemd/system/${service}.service"
done

systemctl daemon-reload
echo "Installed. Fill /etc/wwv-agent.env and /etc/wwv-headless.env, authenticate"
echo "Codex and pair WhatsApp, then enable both services."
