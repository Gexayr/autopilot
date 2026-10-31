# Autopilot — AI content engine for Instagram pages (stage 0)

Generates posts for each page (Gemini text → quote image or Reels), sends previews to Telegram
for ✅/🔄/✏️/❌, publishes approved posts into the page's daily slots, collects stats.
Plan: `/root/.claude/plans/vot-chto-ya-pridumal-vivid-hennessy.md`.

- `app/` — NestJS (one process: HTTP + once-a-minute scheduler), TypeORM, Postgres
- `web/` — React + Vite + Mantine web app (site and Telegram Mini App), built into the same image, API under `/api`
- users: log in with Telegram (bot link or Mini App) or Google; new users wait for admin approval; each user owns
  their Instagram accounts and pages
- media: `/var/www/autopilot-media` → `https://autopilot.amsoft.am/media/` (nginx), deleted after publishing
- bot: @amsoft_insta_poster_bot, webhook `https://autopilot.amsoft.am/tg/webhook`, serves active users (previews go to the page owner); menu button opens the web app

## First start
1. Fill `.env`: `TG_BOT_TOKEN`, `GEMINI_API_KEY`, `BOOTSTRAP_IG_TOKEN` (long-lived token of @astrobot22).
2. `deploy/setup-domain.sh` — nginx site + HTTPS certificate.
3. `deploy/switch-from-n8n.sh` — account, page, queue import from n8n, bot webhook.

## Admin CLI
`docker-compose run --rm app node dist/cli.js <command>`
- `users` · `accounts` · `account:bootstrap` (all act as the first admin unless `--owner=<userId>`)
- `page:upsert --slug=x --account=<ig username> --title=… --niche="…" --language=ru|en|hy --slots=10:00,19:00 --reelsRatio=0.3 --bufferDays=2 --theme=midnight|ember|forest|royal|paper|ocean --font=serif|sans --signature=@handle --aiEnabled=true --autoApprove=false --active=true`
- `render:test [--text=…] [--reel]` — sample media into the media folder
- `tg:webhook` — webhook + "Открыть" Mini App menu button

## New Instagram page
Instagram account → Business/Creator → add as Instagram Tester in the Meta app (App roles) →
with `IG_APP_ID`/`IG_APP_SECRET` set and `https://autopilot.amsoft.am/ig/callback` added as redirect URI in the app,
in the web app: Instagram → «Подключить» → «Новая страница» (wizard).

## Deploy
`docker-compose up -d --build` (migrations run on start; build context is the repo root). Tests: `cd app && npx jest`.
Web dev: `cd web && npm run dev` (proxies /api to 127.0.0.1:3010).
Backup: `docker-compose exec -T db pg_dump -U autopilot autopilot | gzip > /root/backups/autopilot-$(date +%F-%H%M).sql.gz`
