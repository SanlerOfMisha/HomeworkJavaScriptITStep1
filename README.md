# Менеджер контактів

Навчальний Node.js + Express проєкт для роботи з контактами. Frontend знаходиться у папці `public` і звертається до сервера через `fetch()`. Основні дані зберігаються на сервері у JSON-файлі `data/data.json`.

## Структура

```text
project/
  public/
    index.html
    script.js
    style.css
  data/
    data.json
  routes/
    routes.js
  services/
    service.js
  repositories/
    jsonRepository.js
  utils/
    validation.js
  server.js
  package.json
  README.md
```

## Формат даних

`data/data.json` містить JSON масив контактів:

```json
[
  {
    "id": "3c30e4a7-35fa-4e2c-bbb7-207ad5c9b587",
    "name": "Alex Morgan",
    "phone": "+380501112233",
    "email": "alex@example.com",
    "company": "OpenAI",
    "favorite": true,
    "createdAt": "2026-09-05T14:00:00.000Z",
    "updatedAt": "2026-09-05T14:00:00.000Z"
  }
]
```

Email має бути унікальним. Поля `name`, `phone`, `email` є обов'язковими. Якщо `company` не передано, сервер встановлює значення `Без компанії`.

## Запуск

```bash
npm install
npm start
```

Сервер запускається на `process.env.PORT` або на `3000` за замовчуванням:

```text
http://localhost:3000
```

Тестовий токен для зовнішнього API зберігається у файлі `.env`:

```env
API_TOKEN=test-token
```

## Маршрути

Успішні відповіді повертаються у форматі:

```json
{
  "success": true,
  "data": []
}
```

Помилки повертаються у форматі:

```json
{
  "success": false,
  "error": "Human readable message"
}
```

### GET /api/contacts

Отримати всі контакти.

Підтримує query-параметри:

```text
GET /api/contacts?favorite=true
GET /api/contacts?search=alex
```

Пошук працює одночасно за `name`, `email`, `company` і `phone` без урахування регістру.

### GET /api/contacts/:id

Отримати один контакт за UUID.

Якщо `id` некоректний, сервер повертає `400`. Якщо контакт не знайдено, сервер повертає `404`.

### POST /api/contacts

Створити контакт. `id` генерується через `crypto.randomUUID()`.

```json
{
  "name": "Alex Morgan",
  "phone": "+380501112233",
  "email": "alex@example.com",
  "company": "OpenAI",
  "favorite": true
}
```

Успішний статус: `201`.

### PATCH /api/contacts/:id

Частково оновити контакт. Можна передати тільки поля, які треба змінити:

```json
{
  "favorite": false
}
```

Після об'єднання старих і нових даних сервер виконує повну валідацію.

### PUT /api/contacts/:id

Повністю замінити контакт. Не можна змінювати `id` через тіло запиту.

```json
{
  "name": "Alex Morgan",
  "phone": "+380501112233",
  "email": "alex@example.com",
  "company": "OpenAI",
  "favorite": true
}
```

### DELETE /api/contacts/:id

Видалити контакт за UUID. Успішна відповідь має статус `204` і не містить тіла.

### GET /api/contacts/stats

Статистика контактів. Цей route оголошений перед `/api/contacts/:id`.

```json
{
  "success": true,
  "data": {
    "total": 2,
    "favorites": 1,
    "companies": 2,
    "byCompany": {
      "OpenAI": 1,
      "Без компанії": 1
    }
  }
}
```

### GET /api/contacts/grouped

Групування контактів за компанією.

### GET /api/import

Завантажує користувачів із зовнішнього API:

```text
https://jsonplaceholder.typicode.com/users
```

Сервер перевіряє статус відповіді, `Content-Type`, формат масиву та має timeout. Дані нормалізуються до локального формату контакту перед передачею на frontend.

### /api/items

Для відповідності універсальному формулюванню завдання також додані alias routes:

```text
GET /api/items
GET /api/items/stats
GET /api/items/:id
POST /api/items
PATCH /api/items/:id
PUT /api/items/:id
DELETE /api/items/:id
```

Вони працюють з тими самими контактами.

## Коди статусів

```text
200 OK - успішне отримання або оновлення
201 Created - контакт створено
204 No Content - контакт видалено
400 Bad Request - неправильні дані або некоректний id
404 Not Found - route або контакт не знайдено
500 Internal Server Error - проблема читання data.json або пошкоджений JSON
502 Bad Gateway - проблема із зовнішнім API
```

## Захист JSON

Repository працює асинхронно через `fs/promises` і не використовує `readFileSync` або `writeFileSync`.

Якщо `data/data.json` відсутній, repository створює папку `data` і файл з порожнім масивом `[]`.

Якщо файл існує, але містить пошкоджений JSON або не JSON масив, сервер повертає `500`. Файл не очищується і не перезаписується автоматично, щоб не втратити дані.

Для захисту від одночасного запису використовується внутрішня черга `writeQueue` у `jsonRepository.js`. Кожна операція `create`, `update`, `patch`, `delete` чекає завершення попередньої операції, потім читає актуальний файл, змінює дані й записує результат. Це не дає двом паралельним запитам одночасно прочитати старий стан і перезаписати зміни один одного.

## Приклади перевірки

Створення:

```bash
curl -X POST http://localhost:3000/api/contacts ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Alex Morgan\",\"phone\":\"+380501112233\",\"email\":\"alex@example.com\",\"company\":\"OpenAI\",\"favorite\":true}"
```

Пошук:

```bash
curl http://localhost:3000/api/contacts?search=alex
```

Статистика:

```bash
curl http://localhost:3000/api/contacts/stats
```

Імпорт:

```bash
curl http://localhost:3000/api/import
```

## Підготовка до захисту

Студент має вміти пояснити шлях даних:

```text
Натискання кнопки у public/script.js
  -> fetch("/api/contacts")
  -> Express route у routes/routes.js
  -> service у services/service.js
  -> validation у utils/validation.js
  -> repository у repositories/jsonRepository.js
  -> запис у data/data.json
  -> JSON відповідь
  -> оновлення DOM у frontend
```

Для самостійної зміни на захисті можна:

- змінити бізнес правило, наприклад зробити поле `company` обов'язковим;
- додати перевірку формату телефону;
- пояснити, чому email перевіряється на унікальність у service шарі під час послідовної repository transaction.
