# ПЗ Генератор

## Запуск
- БД + API: `docker compose up --build` → http://localhost:8000/docs (проверка: `/api/health`)
- Фронтенд: `cd frontend && npm install && npm run dev` → http://localhost:5173 (запросы `/api` проксируются на :8000)
- Тесты бэкенда: `cd backend && pip install -r requirements.txt && pytest`

## Части проекта
1. Основа (сделано): структура, БД, Docker, health-check
2. Регистрация, роли, организации (JWT)
3. Объекты  4. Документы и версии  5. XSD-схемы
6. Генерация XML + проверка  7. Импорт XML  8. Выгрузка, архив, поиск
9. Администрирование и аудит  10. Тесты и деплой
