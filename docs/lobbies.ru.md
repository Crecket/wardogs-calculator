# Лобби: быстрый запуск

Лобби можно выключить параметром `collab.enabled`. После этого браузер не загружает код лобби, не показывает меню и не обращается к Worker. В production создание комнат после этого патча работает по принципу fail closed: пока не настроены оба ключа Cloudflare Turnstile, создать новую комнату нельзя. Вход по уже выданному подписанному приглашению отдельной проверки не требует.

## Что менять в конфиге

Основные параметры находятся в одном блоке `collab` файла `config/app.json`:

- `enabled` — общий выключатель;
- `serverUrl` — адрес Cloudflare Worker без `/rooms`;
- `maxParticipants` — максимум участников одного лобби, по умолчанию 8;
- `roomLifetimeHours` — срок жизни комнаты, по умолчанию 6 часов;
- `maxRoomsPerDay` — максимум новых комнат за сутки UTC;
- `maxChangeBatchesPerDay` — общий суточный лимит принятых пачек правок;
- `maxChangeBatchesPerRoom` — лимит правок одной комнаты;
- `batchDelayMs` — задержка объединения правок и обновления позиций игроков, минимум 250 мс;
- `allowedOrigins` — только точные production-origin сайта;
- `developmentOrigins` — локальные origin, которые добавляются только при `LOBBIES_DEV=true`;
- `maxRoomsPerAdmission` — сколько комнат можно создать по одному пройденному Turnstile, по умолчанию 3;
- `admissionLifetimeMinutes` — срок действия подписанного допуска, по умолчанию 30 минут;
- `maxInvalidMessages` — сколько некорректных WebSocket-сообщений допускается до отключения;
- `turnstile.enabled` — обязательна ли проверка при создании комнаты в production;
- `turnstile.siteKey` — публичный site key, который можно хранить в репозитории;
- `turnstile.hostname` и `turnstile.action` — значения, которые Worker строго проверяет в ответе Turnstile.

Лимиты проверяются сервером. После их изменения нужно заново развернуть Worker. После изменения `enabled` или `serverUrl` нужно также пересобрать и опубликовать сайт.

## Первое развёртывание

1. Поставь Node.js 22 или новее.
2. В Cloudflare открой **Turnstile**, создай виджет типа **Managed** и разреши только hostname `wardogs-artillery.com`. Если приложение действительно работает на другом hostname, добавь его отдельно.
3. Скопируй публичный **Site key** в `config/app.json` → `collab.turnstile.siteKey`. Секретный ключ в конфиг и Git не добавляй.
4. Оставь в `allowedOrigins` только production-origin. `localhost` и `127.0.0.1` должны находиться только в `developmentOrigins`.
5. Проверь `collab.enabled: true`, адрес `https://lobby.wardogs-artillery.com` и совпадающий custom domain в `sync/wrangler.jsonc`.
6. В PowerShell выполни:

   ```powershell
   cd sync
   npm ci
   npx wrangler login
   ```

7. Если Worker разворачивается впервые, создай `ROOM_SECRET`:

   ```powershell
   $roomSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   $roomSecret | npx wrangler secret put ROOM_SECRET
   Remove-Variable roomSecret
   ```

   Если Worker уже работает, не заменяй существующий `ROOM_SECRET`: ротация немедленно делает все текущие приглашения недействительными.

8. Сохрани секрет Turnstile; команда сама запросит значение:

   ```powershell
   npx wrangler secret put TURNSTILE_SECRET
   ```

9. Проверь и разверни Worker:

   ```powershell
   npm test
   npm audit --audit-level=high
   npx wrangler deploy --dry-run
   npm run deploy
   ```

10. В корне проекта собери и проверь сайт:

    ```powershell
    npm ci
    npm run build
    npm run test:build
    npm run test:scripts
    ```

    После этого опубликуй содержимое `dist` обычным GitHub Pages workflow.

Этот патч одновременно меняет протокол браузера и допуск к созданию комнат. Для аккуратного обновления временно установи `LOBBIES_DISABLED=true` в Variables and Secrets текущего Worker, разверни Worker и сайт, затем удали этот выключатель. Во время окна обновления лобби будут недоступны. Уже подключённым участникам нужно перезагрузить страницу и создать или заново открыть комнату. Новая миграция Durable Objects и новый `ROOM_SECRET` не нужны.

В `sync/wrangler.jsonc` используются четыре namespace rate limiter: `73101`–`73104`. Они должны быть уникальны в пределах аккаунта Cloudflare. `workers.dev` и preview URL отключены, поэтому production-сервис доступен только через `lobby.wardogs-artillery.com`.

Секрет нельзя отправлять кому-либо или коммитить. Файл `sync/.dev.vars` тоже не коммитится.

## Проверка локально

Скопируй `sync/.dev.vars.example` в `sync/.dev.vars` и замени тестовый секрет. Временно укажи:

```json
"enabled": true,
"serverUrl": "http://localhost:8799"
```

Запусти сайт и Worker в разных окнах PowerShell:

```powershell
# окно 1, корень проекта
npm run dev

# окно 2
cd sync
npm ci
npm run dev
```

Открой `http://localhost:8000`. Перед коммитом верни production-адрес или выключи лобби.

Команда `npm run dev` запускает Worker с `LOBBIES_DEV=true`: только в этом режиме разрешаются `developmentOrigins`, не требуется Turnstile и допускается отсутствие production rate-limit bindings. Никогда не добавляй `LOBBIES_DEV=true` в production Worker.

## Экстренное отключение

В настройках Worker в Cloudflare создай переменную `LOBBIES_DISABLED` со значением `true`. Сервер перестанет создавать комнаты и принимать подключения даже при `enabled: true`. Затем поставь `enabled: false` в репозитории и опубликуй обе части.

## Нагрузка при 4 000 визитах в день

Обычный просмотр страницы не создаёт запросов к Worker. Соединение появляется только после нажатия «Создать лобби» или «Войти». Курсоры, движение мыши, камера, масштаб и слои не передаются; завершённые правки объединяются в пачки.

Орудие, активная цель и выбранное оружие у каждого игрока свои. Остальные участники видят подписанные ником точки орудия и цели, соединённые линией, но не видят чужой круг дальности. Эти позиции передаются как временное WebSocket presence-состояние, не записываются в документ комнаты, не входят в резервный экспорт и исчезают после отключения игрока. Поэтому перемещения личных точек не расходуют лимит сохранённых пачек правок.

При настройках по умолчанию сервер остановится после 250 новых комнат или 20 000 пачек правок за сутки. Создание дополнительно требует серверной проверки Turnstile, один короткоживущий допуск связан с IP и позволяет создать не больше трёх комнат. Повторные, конфликтные и некорректные правки получают маленький `ack/rejected`, а полный snapshot отправляется только при подключении.

Например, 400 пользователей лобби по 30 пачек — около 12 000 пачек. Если все 4 000 посетителей сделают по 10 пачек, спрос составит около 40 000, но приложение примет первые 20 000 и затем включит режим только для чтения. Перед увеличением лимитов сначала посмотри фактическое использование Durable Objects в Cloudflare.

Полное описание поведения, защиты, восстановления и ссылки на актуальные лимиты Cloudflare находятся в [lobbies.md](lobbies.md). Настройки заголовков, GitHub и модель угроз открытого проекта — в [security.md](security.md).
