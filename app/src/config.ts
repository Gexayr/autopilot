const env = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export const config = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', 'https://autopilot.amsoft.am').replace(/\/$/, ''),
  mediaDir: env('MEDIA_DIR', '/media'),
  db: {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '5432')),
    user: env('DB_USER', 'autopilot'),
    password: env('DB_PASSWORD'),
    name: env('DB_NAME', 'autopilot'),
  },
  tokenEncKey: env('TOKEN_ENC_KEY'),
  adminKey: env('ADMIN_KEY'),
  jwtSecret: env('JWT_SECRET'),
  google: { clientId: env('GOOGLE_CLIENT_ID') },
  maxUploadMb: 200,
  telegram: {
    token: env('TG_BOT_TOKEN'),
    adminChatId: Number(env('TG_ADMIN_CHAT_ID', '0')),
    webhookSecret: env('TG_WEBHOOK_SECRET'),
  },
  gemini: { apiKey: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL', 'gemini-2.5-flash') },
  instagram: {
    appId: env('IG_APP_ID'),
    metaAppId: env('META_APP_ID'), // Facebook app id (dashboard URL), for the "add tester" link
    appSecret: env('IG_APP_SECRET'),
    apiBase: 'https://graph.instagram.com/v23.0',
    bootstrapToken: env('BOOTSTRAP_IG_TOKEN'),
  },
  pexelsKey: env('PEXELS_API_KEY'),
};

export const mediaUrl = (file: string) => `${config.publicUrl}/media/${file}`;
