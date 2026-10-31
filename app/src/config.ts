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
  gemini: { apiKey: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL', 'gemini-2.5-flash'),
    // tried in order when the main model is overloaded
    fallbacks: env('GEMINI_FALLBACK_MODELS', 'gemini-3.5-flash,gemini-3.5-flash-lite').split(',').map((s) => s.trim()).filter(Boolean) },
  instagram: {
    appId: env('IG_APP_ID'),
    metaAppId: env('META_APP_ID'), // Facebook app id (dashboard URL), for the "add tester" link
    appSecret: env('IG_APP_SECRET'),
    apiBase: 'https://graph.instagram.com/v23.0',
    bootstrapToken: env('BOOTSTRAP_IG_TOKEN'),
  },
  pexelsKey: env('PEXELS_API_KEY'),
  // AI media (generator container): Alibaba Model Studio (Qwen image, Wan video) and PixVerse CLI accounts
  peopleAppearance: env('PEOPLE_APPEARANCE', 'people of European (Caucasian) appearance'),
  qwenTextModel: env('QWEN_TEXT_MODEL', 'qwen-plus'), // text fallback when Gemini is out of quota
  dashscope: { apiKey: env('DASHSCOPE_API_KEY'), baseUrl: env('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com/api/v1').replace(/\/$/, '') },
  pixverse: {
    dir: env('PIXVERSE_DIR', '/pixverse'), // one sub-folder (HOME) per logged-in account: acc1, acc2, …
    accounts: Number(env('PIXVERSE_ACCOUNTS', '0')),
    videoModel: env('PIXVERSE_VIDEO_MODEL', 'v6'),
    videoQuality: env('PIXVERSE_VIDEO_QUALITY', '360p'),
    // free plan: 4 credits per second at 360p (4 s = 16 of the 30 daily credits)
    videoDuration: Number(env('PIXVERSE_VIDEO_DURATION', '4')),
    imageModel: env('PIXVERSE_IMAGE_MODEL', 'gemini-3.1-flash-lite'),
  },
};

export const mediaUrl = (file: string) => `${config.publicUrl}/media/${file}`;
