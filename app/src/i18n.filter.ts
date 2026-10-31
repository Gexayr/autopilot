import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';

/**
 * API error messages are written in Russian; the web app sends `x-lang: en|hy` and gets them translated here.
 * Each entry: Russian message (regex, $1… = captured values) → English, Armenian.
 */
const MESSAGES: [RegExp, string, string][] = [
  [/^Админа заблокировать нельзя$/, 'An administrator can’t be blocked', 'Ադմինիստրատորին հնարավոր չէ արգելափակել'],
  [/^Укажите username Instagram: латиница, цифры, точка и _$/, 'Enter an Instagram username: Latin letters, digits, dots and _', 'Նշեք Instagram-ի username-ը՝ լատինատառ, թվեր, կետ և _'],
  [/^Уже 5 заявок ждут администратора$/, '5 requests are already waiting for the administrator', 'Արդեն 5 հայտ սպասում է ադմինիստրատորին'],
  [/^Доступ ещё не одобрен$/, 'Access has not been approved yet', 'Մուտքը դեռ հաստատված չէ'],
  [/^language: ru, en или hy$/, 'Language: ru, en or hy', 'Լեզուն՝ ru, en կամ hy'],
  [/^(\w+): обязательное поле$/, '$1: required field', '$1: պարտադիր դաշտ'],
  [/^(\w+): 1-(\d+) символов$/, '$1: 1-$2 characters', '$1: 1-$2 նիշ'],
  [/^timezone: неизвестный часовой пояс$/, 'Unknown time zone', 'Անհայտ ժամային գոտի'],
  [/^slots: от 1 до 6 времён$/, 'Choose from 1 to 6 publishing times', 'Ընտրեք 1-ից 6 հրապարակման ժամ'],
  [/^Подключение Instagram ещё не настроено на сервере.*$/, 'Instagram connection is not configured on the server yet', 'Instagram-ի միացումը դեռ կարգավորված չէ սերվերում'],
  [/^Сначала удалите рубрики этого аккаунта$/, 'Delete this account’s series first', 'Նախ ջնջեք այս հաշվի ռուբրիկաները'],
  [/^Лимит рубрик: (\d+)$/, 'Series limit: $1', 'Ռուբրիկաների սահմանաչափը՝ $1'],
  [/^Выберите подключённый аккаунт Instagram$/, 'Choose a connected Instagram account', 'Ընտրեք միացված Instagram հաշիվ'],
  [/^Аккаунт не найден$/, 'Account not found', 'Հաշիվը չի գտնվել'],
  [/^Идёт публикация, попробуйте через минуту$/, 'Publishing is in progress, try again in a minute', 'Հրապարակումն ընթացքի մեջ է․ փորձեք մեկ րոպեից'],
  [/^Рубрика не найдена$/, 'Series not found', 'Ռուբրիկան չի գտնվել'],
  [/^Ссылка устарела, попробуйте ещё раз$/, 'The link has expired, please try again', 'Հղումը հնացել է, փորձեք կրկին'],
  [/^Этот аккаунт уже привязан к другому пользователю$/, 'This account is already linked to another user', 'Այս հաշիվն արդեն կապված է այլ օգտատիրոջ'],
  [/^Пост не найден$/, 'Post not found', 'Գրառումը չի գտնվել'],
  [/^Этот пост уже выброшен$/, 'This post has already been discarded', 'Այս գրառումն արդեն մերժված է'],
  [/^Выберите время в будущем$/, 'Choose a time in the future', 'Ընտրեք ապագա ժամ'],
  [/^Переносить можно только пост из очереди$/, 'Only a scheduled post can be moved', 'Կարելի է տեղափոխել միայն հերթի գրառումը'],
  [/^На это время уже стоит другой пост$/, 'Another post is already scheduled for this time', 'Այս ժամին արդեն այլ գրառում կա'],
  [/^Этот пост уже обработан$/, 'This post has already been handled', 'Այս գրառումն արդեն մշակված է'],
  [/^Другой вариант можно сделать только для поста на одобрении$/, 'Another version can only be made for a post awaiting approval', 'Այլ տարբերակ կարելի է ստանալ միայն հաստատման սպասող գրառման համար'],
  [/^Пост уже опубликован$/, 'The post is already published', 'Գրառումն արդեն հրապարակված է'],
  [/^Текст на картинке есть только у AI-постов$/, 'Only AI posts have text on the image', 'Նկարի վրա տեքստ ունեն միայն AI գրառումները'],
  [/^Текст на картинке: 1-200 символов$/, 'Text on the image: 1-200 characters', 'Նկարի տեքստը՝ 1-200 նիշ'],
  [/^Опубликовать сейчас можно только пост из очереди$/, 'Only a scheduled post can be published now', 'Հիմա կարելի է հրապարակել միայն հերթի գրառումը'],
  [/^Опубликованный пост удаляется в самом Instagram$/, 'A published post can only be deleted in Instagram itself', 'Հրապարակված գրառումը ջնջվում է հենց Instagram-ում'],
  [/^Нужен JPEG\/PNG\/WebP или MP4\/MOV$/, 'JPEG/PNG/WebP or MP4/MOV only', 'Անհրաժեշտ է JPEG/PNG/WebP կամ MP4/MOV'],
  [/^Файл не получен$/, 'No file received', 'Ֆայլը չի ստացվել'],
  [/^Выберите рубрику$/, 'Choose a series', 'Ընտրեք ռուբրիկա'],
  [/^@(\S+) уже подключён другим пользователем$/, '@$1 is already connected by another user', '@$1-ն արդեն միացված է այլ օգտատիրոջ կողմից'],
];

export function translate(message: string, lang: string | undefined): string {
  if (lang !== 'en' && lang !== 'hy') return message;
  for (const [re, en, hy] of MESSAGES) if (re.test(message)) return message.replace(re, lang === 'en' ? en : hy);
  return message;
}

@Catch(HttpException)
export class I18nFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(e: HttpException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const lang = req.headers?.['x-lang'] as string | undefined;
    const body = e.getResponse();
    if (lang && lang !== 'ru' && typeof body === 'object' && body && typeof (body as any).message === 'string') {
      const res = host.switchToHttp().getResponse<Response>();
      return res.status(e.getStatus()).json({ ...body, message: translate((body as any).message, lang) });
    }
    return super.catch(e, host);
  }
}
