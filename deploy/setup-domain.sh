#!/usr/bin/env bash
# One-time: publish autopilot.amsoft.am through nginx and get a Let's Encrypt certificate.
set -euo pipefail
cp "$(dirname "$0")/nginx-autopilot.conf" /etc/nginx/sites-available/autopilot.conf
ln -sf /etc/nginx/sites-available/autopilot.conf /etc/nginx/sites-enabled/autopilot.conf
nginx -t
systemctl reload nginx
certbot --nginx -d autopilot.amsoft.am --non-interactive --redirect
curl -fsS https://autopilot.amsoft.am/health && echo
