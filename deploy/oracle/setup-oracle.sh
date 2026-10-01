#!/usr/bin/env bash
# ==============================================================
# One-shot production setup for the AI Analytics Platform
# Target: Oracle Cloud Always-Free Ubuntu 22.04/24.04 ARM (aarch64)
# Usage (as root, from the repo root on the server):
#   bash deploy/oracle/setup-oracle.sh your-domain.com
# Installs: node 24 + nginx + Let's Encrypt HTTPS + systemd
#           auto-start + SQLite backup timer + firewall rules
# ==============================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/analytics-platform"
APP_USER="analytics"
APP_PORT="3000"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash deploy/oracle/setup-oracle.sh your-domain.com"
  echo "(The domain's A record must already point at this server's public IP.)"
  exit 1
fi

echo "== 1) System packages"
apt-get update -y
apt-get install -y curl git nginx certbot python3-certbot-nginx sqlite3

echo "== 2) Node.js 24 LTS"
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
node --version

echo "== 3) App user + code placement"
id -u "$APP_USER" &>/dev/null || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
# Assumption: this repo was cloned/uploaded to $APP_DIR before running the script.
cd "$APP_DIR"
npm ci
npm run build

echo "== 4) .env production file"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<'ENVEOF'
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://REPLACE-WITH-YOUR-DOMAIN
# ---- Email: HTTP APIs first (work even where outbound SMTP is blocked),
# ---- SMTP (Gmail) as fallback. Fill ONE of the three options.
BREVO_API_KEY=
RESEND_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
# ---- Other platform keys ----
GEMINI_API_KEY=
ENVEOF
  echo ">>> EDIT $APP_DIR/.env now (domain, SMTP credentials, keys), then re-run this script."
  exit 2
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "== 5) systemd service (auto-start + auto-restart)"
cat > /etc/systemd/system/analytics.service <<EOF
[Unit]
Description=AI Analytics Platform
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node dist/server.cjs
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env
# Hardening
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/data $APP_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now analytics
systemctl status analytics --no-pager || true

echo "== 6) nginx reverse proxy (+ SSE streaming settings)"
cat > /etc/nginx/sites-available/analytics <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 60m;   # snapshot uploads (base64 images)

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # --- SSE (live discussions stream) ---
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        # gzip for the SPA bundle
        gzip on;
        gzip_types text/css application/javascript application/json image/svg+xml;
    }
}
EOF
ln -sf /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/analytics
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== 7) HTTPS certificate (Let's Encrypt, free)"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect

echo "== 8) Firewall (Oracle has its own security lists too — allow 80/443 in the OCI console!)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
yes | ufw enable

echo "== 9) Daily SQLite backup timer"
cat > /usr/local/bin/backup-analytics-db.sh <<'EOF'
#!/usr/bin/env bash
# Safe online backup of the SQLite WAL database
DB=/opt/analytics-platform/data/auth.db
DEST=/opt/analytics-platform/backups
mkdir -p "$DEST"
sqlite3 "$DB" ".backup '$DEST/auth-$(date +%F).db'"
# Keep the last 14 days
find "$DEST" -name 'auth-*.db' -mtime +14 -delete
EOF
chmod +x /usr/local/bin/backup-analytics-db.sh
cat > /etc/systemd/system/analytics-backup.timer <<EOF
[Unit]
Description=Daily SQLite backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/analytics-backup.service <<'EOF'
[Unit]
Description=SQLite backup for the analytics platform

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup-analytics-db.sh
EOF
systemctl daemon-reload
systemctl enable --now analytics-backup.timer

echo ""
echo "=============================================================="
echo "  DONE — open https://$DOMAIN"
echo "  Service:  systemctl status analytics"
echo "  Logs:     journalctl -u analytics -f"
echo "  Backups:  $APP_DIR/backups (daily 03:00, 14-day retention)"
echo "  Reminder: allow ports 80/443 in the OCI VNIC security list!"
echo "=============================================================="
