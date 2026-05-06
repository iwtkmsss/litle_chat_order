# Little Chat Order

Небольшой fullstack-проект для рабочих обсуждений:

- первый экран это логин без регистрации
- две роли: `manager` и `user`
- менеджер создает обычных пользователей, чаты и доступы к ним
- пользователи видят только назначенные им чаты
- сообщения и вложения сохраняются на сервере

## Стек

- `Vite + React` на клиенте
- `Express` на сервере
- `SQLite` для постоянного хранения истории
- файловые вложения в `server/uploads`

## Быстрый старт

```bash
npm install
npm run create-manager -- --name "Иван Менеджер" --password "secret123"
npm run dev
```

После запуска:

- сайт: `http://localhost:5173`
- API: `http://localhost:3001`

## Что умеет менеджер

- создавать аккаунты пользователей по имени и фамилии + паролю
- создавать новые чаты
- выдавать доступ к каждому чату одному или нескольким пользователям
- участвовать в обсуждениях как отдельная роль

## Что умеет пользователь

- входить только в уже созданный аккаунт
- видеть сверху вкладки только тех чатов, куда его добавили
- читать полную историю обсуждений
- отправлять сообщения и прикреплять файлы

## Важные команды

```bash
npm run dev
npm run build
npm run start
npm run create-manager -- --name "Иван Менеджер" --password "secret123"
```

## Переменные окружения

Файл: `server/.env`

```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_PATH=server/data/chat-storage.db
UPLOADS_DIR=server/uploads
```

`DATABASE_PATH` и `UPLOADS_DIR` можно переопределить, если нужно временное окружение или другой путь хранения.

## Структура

```text
client/         React интерфейс
server/         Express API
server/data/    SQLite база
server/uploads/ вложения чатов
```

npm run create-manager -- --name "манагер" --password "123"
npm run dev