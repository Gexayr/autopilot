import type { User } from './entities';

/** Telegram messages in the user's language (users.language, set on the website or with /language). */
export type Lang = 'ru' | 'en' | 'hy';
export const BOT_LANGS: { value: Lang; label: string }[] = [
  { value: 'hy', label: 'Հայերեն' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

const ru = {
  help: `🤖 Автопилот Instagram

Каждый день я готовлю посты для ваших рубрик и присылаю их сюда:
✅ в очередь (выйдет в ближайший свободный слот)
🔄 сделать другой вариант
✏️ заменить текст на картинке
❌ выбросить

Свой контент: пришлите фото или видео с подписью, и оно встанет в очередь.

Рубрика: это тема и расписание постов для одного аккаунта Instagram.

Команды (рубрику можно не указывать, если она одна):
/pages: рубрики и их настройки
/queue [рубрика]: очередь
/del [рубрика] N: убрать пост N из очереди
/now [рубрика]: опубликовать следующий пост сейчас
/gen [рубрика] [пожелание]: сделать пост прямо сейчас
/stats: какая рубрика и какой формат растут
/pause рубрика · /resume рубрика
/language: язык бота

Всё то же самое (и подключение Instagram, и новые рубрики) есть на сайте: {url}`,
  'btn.open': '🚀 Открыть Автопилот',
  menu: 'Открыть',
  'btn.approve': '✅ В очередь',
  'btn.other': '🔄 Другой',
  'btn.edit': '✏️ Изменить текст',
  'btn.allow': '✅ Разрешить',
  'btn.deny': '❌ Отказать',
  'btn.meta': '🔗 Открыть Meta',
  'btn.added': '✅ Добавил',
  'btn.reject': '❌ Отклонить',
  'btn.connect': '🚀 Подключить Instagram',
  error: '⚠️ Ошибка: {m}',
  'login.ok': '✅ Готово! Вернитесь в браузер, вход выполнится сам.',
  'login.expired': '⚠️ Ссылка для входа устарела. Нажмите «Войти через Telegram» ещё раз.',
  noAccess: 'Нет доступа',
  pending: '⏳ Ваша заявка ждёт одобрения, я напишу, когда доступ откроется.',
  stranger: '👋 Это бот Автопилота для Instagram. Откройте приложение, чтобы войти и подключить свой Instagram.',
  redrawing: '⏳ Перерисовываю…',
  publishing: '⏳ Публикую в течение минуты…',
  queueEmpty: '📭 {title}: очередь пуста.',
  deleted: '🗑 Убран пост {n}.',
  delHint: '⚠️ Укажите номер из /queue, например /del 2',
  generating: '⏳ Готовлю пост…',
  resumed: '🟢 {title}: работает',
  paused: '⏸ {title}: на паузе',
  choosePage: 'Укажите рубрику: {list}',
  noPagesShort: '(нет рубрик)',
  albums: '⚠️ Альбомы пока не поддерживаются, пришлите по одному.',
  badFile: '⚠️ Нужно фото (JPEG) или видео (MP4/MOV). Картинку отправьте как фото, не файлом.',
  tooBig: '⚠️ Файл больше 20 МБ, бот не может его скачать. Загрузите его на сайте: {url}',
  createFirst: '⚠️ Сначала создайте рубрику.',
  whichPage: 'В какую рубрику?',
  queuedAt: '✅ {title}: в очереди, выйдет {at}',
  inQueue: '✅ В очереди: {at}',
  discarded: '❌ Выброшен',
  regenerating: '🔄 Делаю другой вариант…',
  editPrompt: '✏️ Пришлите новый текст для картинки поста #{id}',
  'admin.allowed': '✅ Доступ открыт: {name}',
  'admin.denied': '❌ Отказано: {name}',
  'admin.arRejected': '❌ Отклонено: @{u}',
  'admin.arInvited': '✅ @{u}: пользователю отправлена инструкция',
  'admin.newUser': '🙋 Новый пользователь: {name}\nРазрешить доступ к Автопилоту?',
  'admin.igRequest': '📸 {name} хочет подключить Instagram @{u}\n\nДобавьте его в тестировщики: Meta → Роли приложения → Роли → Добавить пользователей → «Тестировщик Instagram» → {u}',
  userN: 'Пользователь #{id}',
  accessOpen: '✅ Доступ открыт! Заходите: {url}',
  igInvited: '✅ Администратор добавил @{u} в тестировщики.\n\n1. Откройте Instagram под @{u} → Настройки → Сайты и приложения → «Приглашения тестировщика» → примите приглашение.\n2. Вернитесь в Автопилот и нажмите «Подключить Instagram».',
  igRejected: '❌ Заявка на подключение @{u} отклонена. Напишите администратору, если это ошибка.',
  igConnected: '🔗 Подключён Instagram @{u}',
  'preview.post': '🖼 Пост',
  'web.approved': '✅ Одобрен на сайте: {at}',
  'web.rejected': '❌ Выброшен на сайте',
  'web.other': '🔄 Другой вариант (с сайта)',
  'web.deleted': '🗑 Удалён на сайте',
  published: '✅ {title}: опубликовано{link}\n\nВ очереди: {left}',
  failRetry: '❌ {title}: не удалось опубликовать «{q}»\n{m}\n\nПовторю {at}.',
  failDrop: '❌ {title}: пост «{q}» снова не опубликован и убран из очереди.\n{m}',
  stuck: '⚠️ Публикация поста #{id} прервалась (перезапуск сервера?). Проверьте Instagram: если поста нет, пришлите его заново.',
  noText: '(без текста)',
  noPages: 'Рубрик пока нет.',
  pagesTitle: '📄 Рубрики:',
  pageLine: '{icon} {slug}: {title} (@{user})\n   слоты {slots} · Reels {reels}% · AI {ai}\n   в очереди {queued}, ждут одобрения {waiting}',
  'ai.on': 'вкл',
  'ai.off': 'выкл',
  queueTitle: '📋 {title}, в очереди {n}:',
  statsBlock: '📊 {title}\n   подписчики: {f} ({g} за {d} дн.)\n   охват в среднем: фото {ri}, Reels {rv}\n   лайки в среднем: фото {li}, Reels {lv}',
  noActive: 'Нет активных рубрик.',
  chooseLang: '🌐 Выберите язык бота:',
  langSet: '✅ Язык бота: Русский',
  'cmd.pages': 'Рубрики и их настройки',
  'cmd.queue': 'Очередь постов',
  'cmd.now': 'Опубликовать следующий пост сейчас',
  'cmd.gen': 'Сделать пост прямо сейчас',
  'cmd.stats': 'Статистика',
  'cmd.language': 'Язык бота',
  'cmd.start': 'Помощь',
};

type Key = keyof typeof ru;

const en: Record<Key, string> = {
  help: `🤖 Instagram Autopilot

Every day I prepare posts for your series and send them here:
✅ to the queue (goes out in the next free slot)
🔄 make another version
✏️ replace the text on the image
❌ discard

Your own content: send a photo or video with a caption, and it will join the queue.

A series is the topic and posting schedule for one Instagram account.

Commands (you can skip the series if you have only one):
/pages: series and their settings
/queue [series]: the queue
/del [series] N: remove post N from the queue
/now [series]: publish the next post now
/gen [series] [wish]: make a post right now
/stats: which series and format are growing
/pause series · /resume series
/language: bot language

You can do all of this (including connecting Instagram and creating series) on the website: {url}`,
  'btn.open': '🚀 Open Autopilot',
  menu: 'Open',
  'btn.approve': '✅ Queue it',
  'btn.other': '🔄 Another',
  'btn.edit': '✏️ Edit text',
  'btn.allow': '✅ Allow',
  'btn.deny': '❌ Deny',
  'btn.meta': '🔗 Open Meta',
  'btn.added': '✅ Added',
  'btn.reject': '❌ Reject',
  'btn.connect': '🚀 Connect Instagram',
  error: '⚠️ Error: {m}',
  'login.ok': '✅ Done! Go back to the browser, you’ll be signed in automatically.',
  'login.expired': '⚠️ The sign-in link has expired. Tap “Sign in with Telegram” again.',
  noAccess: 'No access',
  pending: '⏳ Your request is waiting for approval. I’ll message you when access is granted.',
  stranger: '👋 This is the Autopilot bot for Instagram. Open the app to sign in and connect your Instagram.',
  redrawing: '⏳ Redrawing…',
  publishing: '⏳ Publishing within a minute…',
  queueEmpty: '📭 {title}: the queue is empty.',
  deleted: '🗑 Post {n} removed.',
  delHint: '⚠️ Give a number from /queue, for example /del 2',
  generating: '⏳ Creating a post…',
  resumed: '🟢 {title}: running',
  paused: '⏸ {title}: paused',
  choosePage: 'Choose a series: {list}',
  noPagesShort: '(no series)',
  albums: '⚠️ Albums aren’t supported yet, please send items one by one.',
  badFile: '⚠️ A photo (JPEG) or a video (MP4/MOV) is needed. Send pictures as a photo, not as a file.',
  tooBig: '⚠️ The file is larger than 20 MB, so the bot can’t download it. Upload it on the website: {url}',
  createFirst: '⚠️ Create a series first.',
  whichPage: 'Which series?',
  queuedAt: '✅ {title}: queued, goes out {at}',
  inQueue: '✅ Queued: {at}',
  discarded: '❌ Discarded',
  regenerating: '🔄 Making another version…',
  editPrompt: '✏️ Send the new text for the image of post #{id}',
  'admin.allowed': '✅ Access granted: {name}',
  'admin.denied': '❌ Denied: {name}',
  'admin.arRejected': '❌ Rejected: @{u}',
  'admin.arInvited': '✅ @{u}: instructions sent to the user',
  'admin.newUser': '🙋 New user: {name}\nAllow access to Autopilot?',
  'admin.igRequest': '📸 {name} wants to connect Instagram @{u}\n\nAdd them as a tester: Meta → App roles → Roles → Add people → “Instagram Tester” → {u}',
  userN: 'User #{id}',
  accessOpen: '✅ Access granted! Come in: {url}',
  igInvited: '✅ The administrator added @{u} as a tester.\n\n1. Open Instagram as @{u} → Settings → Website permissions → Apps and websites → “Tester invites” → accept the invitation.\n2. Go back to Autopilot and tap “Connect Instagram”.',
  igRejected: '❌ The request to connect @{u} was rejected. Message the administrator if this is a mistake.',
  igConnected: '🔗 Instagram @{u} connected',
  'preview.post': '🖼 Post',
  'web.approved': '✅ Approved on the website: {at}',
  'web.rejected': '❌ Discarded on the website',
  'web.other': '🔄 Another version (from the website)',
  'web.deleted': '🗑 Deleted on the website',
  published: '✅ {title}: published{link}\n\nIn the queue: {left}',
  failRetry: '❌ {title}: couldn’t publish “{q}”\n{m}\n\nI’ll try again {at}.',
  failDrop: '❌ {title}: the post “{q}” failed again and was removed from the queue.\n{m}',
  stuck: '⚠️ Publishing post #{id} was interrupted (server restart?). Check Instagram: if the post isn’t there, send it again.',
  noText: '(no text)',
  noPages: 'No series yet.',
  pagesTitle: '📄 Series:',
  pageLine: '{icon} {slug}: {title} (@{user})\n   times {slots} · Reels {reels}% · AI {ai}\n   queued {queued}, awaiting approval {waiting}',
  'ai.on': 'on',
  'ai.off': 'off',
  queueTitle: '📋 {title}, queued {n}:',
  statsBlock: '📊 {title}\n   followers: {f} ({g} in {d} d)\n   average reach: photo {ri}, Reels {rv}\n   average likes: photo {li}, Reels {lv}',
  noActive: 'No active series.',
  chooseLang: '🌐 Choose the bot language:',
  langSet: '✅ Bot language: English',
  'cmd.pages': 'Series and their settings',
  'cmd.queue': 'Post queue',
  'cmd.now': 'Publish the next post now',
  'cmd.gen': 'Make a post right now',
  'cmd.stats': 'Statistics',
  'cmd.language': 'Bot language',
  'cmd.start': 'Help',
};

const hy: Record<Key, string> = {
  help: `🤖 Instagram-ի Ավտոպիլոտ

Ամեն օր ես պատրաստում եմ գրառումներ ձեր ռուբրիկաների համար և ուղարկում այստեղ.
✅ հերթում (կհրապարակվի մոտակա ազատ ժամին)
🔄 պատրաստել այլ տարբերակ
✏️ փոխել նկարի տեքստը
❌ մերժել

Ձեր սեփական բովանդակությունը. ուղարկեք լուսանկար կամ տեսանյութ նկարագրությամբ, և այն կավելանա հերթում։

Ռուբրիկան մեկ Instagram հաշվի գրառումների թեման և ժամանակացույցն է։

Հրամաններ (ռուբրիկան կարելի է չնշել, եթե այն մեկն է).
/pages՝ ռուբրիկաները և դրանց կարգավորումները
/queue [ռուբրիկա]՝ հերթը
/del [ռուբրիկա] N՝ հանել N համարի գրառումը հերթից
/now [ռուբրիկա]՝ հրապարակել հաջորդ գրառումը հիմա
/gen [ռուբրիկա] [ցանկություն]՝ պատրաստել գրառում հենց հիմա
/stats՝ որ ռուբրիկան և որ ձևաչափն են աճում
/pause ռուբրիկա · /resume ռուբրիկա
/language՝ բոտի լեզուն

Այս ամենը (նաև Instagram-ի միացումը և նոր ռուբրիկաները) հասանելի է կայքում՝ {url}`,
  'btn.open': '🚀 Բացել Ավտոպիլոտը',
  menu: 'Բացել',
  'btn.approve': '✅ Հերթում',
  'btn.other': '🔄 Այլ',
  'btn.edit': '✏️ Փոխել տեքստը',
  'btn.allow': '✅ Թույլատրել',
  'btn.deny': '❌ Մերժել',
  'btn.meta': '🔗 Բացել Meta-ն',
  'btn.added': '✅ Ավելացրի',
  'btn.reject': '❌ Մերժել',
  'btn.connect': '🚀 Միացնել Instagram-ը',
  error: '⚠️ Սխալ՝ {m}',
  'login.ok': '✅ Պատրաստ է։ Վերադարձեք դիտարկիչ, մուտքը կկատարվի ինքնաբերաբար։',
  'login.expired': '⚠️ Մուտքի հղումը հնացել է։ Կրկին սեղմեք «Մուտք Telegram-ով»։',
  noAccess: 'Մուտք չկա',
  pending: '⏳ Ձեր հայտը սպասում է հաստատման։ Կգրեմ, երբ մուտքը բացվի։',
  stranger: '👋 Սա Instagram-ի Ավտոպիլոտի բոտն է։ Բացեք հավելվածը՝ մուտք գործելու և ձեր Instagram-ը միացնելու համար։',
  redrawing: '⏳ Վերագծում եմ…',
  publishing: '⏳ Կհրապարակեմ մեկ րոպեի ընթացքում…',
  queueEmpty: '📭 {title}. հերթը դատարկ է։',
  deleted: '🗑 {n} գրառումը հանված է։',
  delHint: '⚠️ Նշեք համարը /queue-ից, օրինակ՝ /del 2',
  generating: '⏳ Պատրաստում եմ գրառումը…',
  resumed: '🟢 {title}. աշխատում է',
  paused: '⏸ {title}. դադարեցված է',
  choosePage: 'Նշեք ռուբրիկան՝ {list}',
  noPagesShort: '(ռուբրիկաներ չկան)',
  albums: '⚠️ Ալբոմները դեռ չեն աջակցվում, ուղարկեք մեկ առ մեկ։',
  badFile: '⚠️ Անհրաժեշտ է լուսանկար (JPEG) կամ տեսանյութ (MP4/MOV)։ Նկարն ուղարկեք որպես լուսանկար, ոչ թե ֆայլ։',
  tooBig: '⚠️ Ֆայլը 20 ՄԲ-ից մեծ է, բոտը չի կարող այն ներբեռնել։ Վերբեռնեք այն կայքում՝ {url}',
  createFirst: '⚠️ Նախ ստեղծեք ռուբրիկա։',
  whichPage: 'Ո՞ր ռուբրիկայում։',
  queuedAt: '✅ {title}. հերթում է, կհրապարակվի {at}',
  inQueue: '✅ Հերթում է՝ {at}',
  discarded: '❌ Մերժված է',
  regenerating: '🔄 Պատրաստում եմ այլ տարբերակ…',
  editPrompt: '✏️ Ուղարկեք #{id} գրառման նկարի նոր տեքստը',
  'admin.allowed': '✅ Մուտքը բացված է՝ {name}',
  'admin.denied': '❌ Մերժված է՝ {name}',
  'admin.arRejected': '❌ Մերժված է՝ @{u}',
  'admin.arInvited': '✅ @{u}. օգտատիրոջն ուղարկվել է հրահանգը',
  'admin.newUser': '🙋 Նոր օգտատեր՝ {name}\nԹույլատրե՞լ մուտքը Ավտոպիլոտ։',
  'admin.igRequest': '📸 {name}-ը ցանկանում է միացնել Instagram @{u}\n\nԱվելացրեք նրան որպես թեստավորող՝ Meta → App roles → Roles → Add people → «Instagram Tester» → {u}',
  userN: 'Օգտատեր #{id}',
  accessOpen: '✅ Մուտքը բացված է։ Մուտք գործեք՝ {url}',
  igInvited: '✅ Ադմինիստրատորը @{u}-ն ավելացրել է թեստավորողների մեջ։\n\n1. Բացեք Instagram-ը @{u} հաշվով → Settings → Website permissions → Apps and websites → «Tester invites» → ընդունեք հրավերը։\n2. Վերադարձեք Ավտոպիլոտ և սեղմեք «Միացնել Instagram-ը»։',
  igRejected: '❌ @{u}-ի միացման հայտը մերժվել է։ Գրեք ադմինիստրատորին, եթե սա սխալ է։',
  igConnected: '🔗 Instagram @{u}-ը միացված է',
  'preview.post': '🖼 Գրառում',
  'web.approved': '✅ Հաստատված է կայքում՝ {at}',
  'web.rejected': '❌ Մերժված է կայքում',
  'web.other': '🔄 Այլ տարբերակ (կայքից)',
  'web.deleted': '🗑 Ջնջված է կայքում',
  published: '✅ {title}. հրապարակված է{link}\n\nՀերթում՝ {left}',
  failRetry: '❌ {title}. չհաջողվեց հրապարակել «{q}»\n{m}\n\nԿփորձեմ կրկին {at}։',
  failDrop: '❌ {title}. «{q}» գրառումը կրկին չհրապարակվեց և հանվեց հերթից։\n{m}',
  stuck: '⚠️ #{id} գրառման հրապարակումն ընդհատվեց (սերվերի վերագործարկում՞)։ Ստուգեք Instagram-ը. եթե գրառումը չկա, ուղարկեք այն նորից։',
  noText: '(առանց տեքստի)',
  noPages: 'Ռուբրիկաներ դեռ չկան։',
  pagesTitle: '📄 Ռուբրիկաներ.',
  pageLine: '{icon} {slug}: {title} (@{user})\n   ժամեր {slots} · Reels {reels}% · AI {ai}\n   հերթում {queued}, սպասում են հաստատման {waiting}',
  'ai.on': 'միացված',
  'ai.off': 'անջատված',
  queueTitle: '📋 {title}, հերթում՝ {n}.',
  statsBlock: '📊 {title}\n   հետևորդներ՝ {f} ({g} {d} օրում)\n   միջին ընդգրկում՝ լուսանկար {ri}, Reels {rv}\n   միջին հավանումներ՝ լուսանկար {li}, Reels {lv}',
  noActive: 'Ակտիվ ռուբրիկաներ չկան։',
  chooseLang: '🌐 Ընտրեք բոտի լեզուն.',
  langSet: '✅ Բոտի լեզուն՝ Հայերեն',
  'cmd.pages': 'Ռուբրիկաները և կարգավորումները',
  'cmd.queue': 'Գրառումների հերթը',
  'cmd.now': 'Հրապարակել հաջորդ գրառումը հիմա',
  'cmd.gen': 'Պատրաստել գրառում հենց հիմա',
  'cmd.stats': 'Վիճակագրություն',
  'cmd.language': 'Բոտի լեզուն',
  'cmd.start': 'Օգնություն',
};

const DICTS: Record<Lang, Record<Key, string>> = { ru, en, hy };

export const isLang = (v: unknown): v is Lang => v === 'ru' || v === 'en' || v === 'hy';

/** Telegram's language_code → our language (Armenian and English as is, everything else Russian). */
export const fromTelegramCode = (code?: string): Lang => (/^hy/i.test(code ?? '') ? 'hy' : /^en/i.test(code ?? '') ? 'en' : 'ru');

export const langOf = (u: Pick<User, 'language'> | null | undefined): Lang => (isLang(u?.language) ? u!.language as Lang : 'ru');

export function bt(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? ru[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Bot command menu per Telegram app language (setMyCommands with language_code). */
export const botCommands = (lang: Lang) =>
  (['start', 'pages', 'queue', 'now', 'gen', 'stats', 'language'] as const).map((c) => ({ command: c, description: bt(lang, `cmd.${c}` as Key) }));
