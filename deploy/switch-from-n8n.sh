#!/usr/bin/env bash
# One-time move of @astrobot22 from the n8n workflows to autopilot.
# Needs in .env: TG_BOT_TOKEN, GEMINI_API_KEY, BOOTSTRAP_IG_TOKEN. Run after setup-domain.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
N8N=/root/n8n
cli() { docker-compose run --rm -T -v /var/www/igmedia:/import:ro -v /tmp/autopilot-import:/tmpimport app node dist/cli.js "$@"; }

curl -fsS https://autopilot.amsoft.am/health >/dev/null || { echo "run deploy/setup-domain.sh first"; exit 1; }

echo "== 1. Instagram account"
cli account:bootstrap

echo "== 2. page astrobot22"
cli page:upsert --slug=astrobot22 --account=astrobot22 --title="Astrobot · мотивация" \
  --niche="Мотивация и саморазвитие: дисциплина, сила характера, рост, преодоление трудностей. Коротко, сильно, без банальностей и клише." \
  --language=ru --slots=10:00,19:00 --reelsRatio=0.3 --bufferDays=2 --signature=@astrobot22

echo "== 3. stop the n8n workflow (it owns the bot webhook) and take its queue"
docker exec n8n-n8n-1 n8n update:workflow --id=InstaAutopost001 --active=false >/dev/null 2>&1
mkdir -p /tmp/autopilot-import
python3 -c "
import sqlite3;print(sqlite3.connect('$N8N/n8n_data/database.sqlite').execute(\"select staticData from workflow_entity where id='InstaAutopost001'\").fetchone()[0])" > /tmp/autopilot-import/queue.json
docker restart n8n-n8n-1 >/dev/null
cli import:n8n --file=/tmpimport/queue.json --page=astrobot22 --from=/import

echo "== 4. bot webhook → autopilot"
cli tg:webhook
docker-compose up -d --force-recreate app >/dev/null
echo "done: send /pages to the bot"
