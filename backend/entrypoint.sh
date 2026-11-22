#!/bin/sh
# Container start: wait for the database -> apply migrations -> create the first admin (idempotent) -> run the API.
set -eu

python - <<'PY'
import sys, time
from sqlalchemy import create_engine, text
from app.core.config import settings   # also refuses to start with unsafe production settings

engine = create_engine(settings.database_url)
for attempt in range(1, 61):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        break
    except Exception as exc:  # noqa: BLE001
        print(f"database not ready ({exc.__class__.__name__}), attempt {attempt}/60", flush=True)
        time.sleep(2)
else:
    sys.exit("database is unreachable")
PY

alembic upgrade head
python -m app.seed

# --proxy-headers: the real client IP comes from nginx (it overwrites X-Forwarded-For). Never publish this port directly.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-2}" \
  --proxy-headers --forwarded-allow-ips='*'
