# ПЗ Генератор

Веб-сервис для подготовки раздела «Пояснительная записка» проектной документации в формате XML: заполнение данных в веб-формах, проверка (бизнес-правила и XSD), предпросмотр, выгрузка, импорт существующих файлов, несколько организаций, управление версиями XML-схем.

Заказчик — ООО «ИнПАД». Проект: «Разработка веб-сервиса для формирования раздела «Пояснительная записка» проектной документации в формате XML» (09.03.04 Программная инженерия).

> **Важно.** Сервис работает на упрощённых XSD (01.05, 01.04), составленных под его модель данных. Официальных схем Минстроя в распоряжении не было, поэтому выгружаемый файл пока **не** соответствует формату ведомства. Подробности и план перехода — в [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Быстрый старт

**Продакшен (Docker Compose)** — см. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):
```sh
cp .env.example .env      # заполните пароли и ключ
docker compose up -d --build
```

**Разработка без Docker (SQLite):**
```sh
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                              # DATABASE_URL=sqlite:///./dev.db
alembic upgrade head && python -m app.seed        # таблицы, схемы XSD, супер-админ admin@inpad.ru / ChangeMe2026
uvicorn app.main:app --reload                     # http://localhost:8000/docs
```
```sh
cd frontend && npm install && npm run dev         # http://localhost:5173  (запросы /api проксируются на :8000)
```

**Разработка с PostgreSQL:** `docker compose -f docker-compose.dev.yml up --build`.

## Тесты

```sh
cd backend && python -m pytest -q --cov=app       # 138 тестов, покрытие 98 %
cd frontend && npx tsc --noEmit && npm run build
```
Те же тесты проходят и на PostgreSQL. Подробнее — [docs/TESTING.md](docs/TESTING.md).

## Структура

```
backend/    FastAPI, SQLAlchemy, Alembic, lxml   (app/routers — HTTP, app/models — таблицы, migrations/)
frontend/   React + TypeScript + Tailwind        (src/pages — страницы, src/shared — общие модули)
docs/       приёмка, архитектура, развёртывание, тесты, руководство, ограничения
scripts/    резервное копирование и восстановление
.github/    CI: тесты на SQLite и PostgreSQL, проверка миграций, сборка фронтенда
```

## Документация

| Документ | Содержание |
|---|---|
| [ACCEPTANCE.md](docs/ACCEPTANCE.md) | Соответствие критериям приёмки и то, что **не** выполнено |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Устройство, данные, проверка, безопасность |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Установка, переменные, обновление, резервные копии |
| [TESTING.md](docs/TESTING.md) | Что и как проверено, результаты нагрузки |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | Роли и работа с сервисом |
| [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Ограничения и пределы роста |
