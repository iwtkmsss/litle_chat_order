# Сервіс приєднання до теплових мереж

Fullstack-сервіс для ведення заяв на приєднання до теплових мереж, особистого кабінету замовника, контролю етапів, строків, документів і листування.

## Ролі

- `admin` — створює станції/компанії та менеджерів, редагує сталі дані, правила строків, шаблони етапів, бачить усі заявки.
- `manager` — прив’язаний до однієї станції/компанії, створює замовників і заявки тільки в межах своєї станції.
- `customer` — замовник, бачить тільки свої заявки, видимі етапи, документи та чат.

## Що вже закладено

- публічна сторінка “Приєднання” з нормативною інформацією і зразками документів;
- 5 офіційних docx-зразків у `client/public/documents`;
- реєстр заяв із прив’язкою до станції/компанії;
- етапи з очікуваним і граничним строком відповідно до пункту 1.14 Порядку;
- контроль строків: 10 робочих днів, 10 календарних днів, 3 місяці, 1 календарний день;
- email-заглушка під майбутній поштовий клієнт;
- SMS не використовується;
- генерація заповнених docx і постійне збереження у `server/generated-documents`;
- журнал дій у БД.

## Стек

- `Vite + React` — клієнт;
- `Express` — API;
- `SQLite` — дані;
- `better-sqlite3` — робота з БД;
- `docx` — генерація Word-документів;
- файлові вкладення — `server/uploads`;
- згенеровані документи — `server/generated-documents`.

## Швидкий старт

```bash
npm install
npm run create-admin -- --name "Адміністратор Сервісу" --password "secret123"
npm run dev
```

Після запуску:

- сайт: `http://localhost:5173`
- API: `http://localhost:3001`

## Важливі команди

```bash
npm run dev
npm run dev:public
npm run build
npm run build:public
npm run preview:public
npm run start
npm run create-admin -- --name "Адміністратор Сервісу" --password "secret123"
```

## Запуск на локальному IPv4

```bash
npm run preview:public
```

Команда автоматично визначає IPv4, збирає клієнт з `VITE_API_URL=http://<IPv4>:3001` і підіймає:

- сайт: `http://<IPv4>:5173`
- API: `http://<IPv4>:3001`

Якщо треба вказати IP вручну у PowerShell:

```powershell
$env:PUBLIC_HOST="192.168.1.25"; npm run preview:public
```

Для dev-режиму без production build:

```bash
npm run dev:public
```

## Змінні середовища

Файл: `server/.env`

```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_PATH=server/data/chat-storage.db
UPLOADS_DIR=server/uploads
GENERATED_DOCUMENTS_DIR=server/generated-documents
```

## Нормативна основа

Проєкт орієнтований на Порядок приєднання до теплових мереж, затверджений постановою НКРЕКП від 04.10.2023 № 1823, з урахуванням змін, зокрема пункту 1.14 щодо електронного сервісу та відображення строків виконання організаційних і технічних заходів.

Сталі нормативні формулювання, строки та шаблони етапів винесені в адмін-панель, щоб їх можна було оновлювати без редагування коду.

## Структура

```text
client/                  React-інтерфейс
client/public/documents/  Офіційні docx-зразки
server/                  Express API
server/data/             SQLite база
server/uploads/          Вкладення чатів
server/generated-documents/ Згенеровані docx
```
