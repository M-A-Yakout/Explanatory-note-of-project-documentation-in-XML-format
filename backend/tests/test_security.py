import pytest
from pydantic import ValidationError

from app import ratelimit
from app.core.config import Settings, settings
from app.core.security import create_token
from app.models import User

from .conftest import PASSWORD, register_payload
from .test_admin import hdr
from .test_projects import auth


def login(client, email="anna@psi.ru", password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bad_login(client, email="anna@psi.ru"):
    return login(client, email, "WrongPass12345")


# ---------------- brute-force protection ----------------
def test_account_is_locked_out_after_five_failures_even_for_the_right_password(client):
    auth(client)
    for _ in range(5):
        assert bad_login(client).status_code == 401
    r = login(client)  # correct password, but the budget is gone
    assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_attempts"
    assert int(r.headers["retry-after"]) > 0
    assert "мин" in r.json()["detail"]["message"]


def test_lockout_is_per_account_and_failures_are_counted_not_successes(client):
    auth(client)
    for _ in range(5):
        bad_login(client)
    assert login(client, "other@x.ru").status_code == 401  # another account is not locked (unknown user -> plain 401)
    with client.session_factory() as db:
        ratelimit.reset_all(db)
    for _ in range(12):  # many successful logins never use the budget
        assert login(client).status_code == 200


def test_success_resets_the_failure_counter(client):
    auth(client)
    for _ in range(4):
        bad_login(client)
    assert login(client).status_code == 200  # 4 failures, then a success
    for _ in range(4):
        assert bad_login(client).status_code == 401  # a fresh budget
    assert bad_login(client).status_code == 401  # 5th failure of the new window still allowed
    assert login(client).status_code == 429


def test_unknown_accounts_are_limited_too_so_enumeration_is_not_a_back_door(client):
    for _ in range(5):
        assert bad_login(client, "ghost@x.ru").status_code == 401
    assert bad_login(client, "ghost@x.ru").status_code == 429


def test_one_address_cannot_spray_many_accounts(client):
    for i in range(30):
        assert bad_login(client, f"u{i}@x.ru").status_code == 401  # 1 failure per account: the account limit never fires
    r = bad_login(client, "u31@x.ru")
    assert r.status_code == 429  # the per-address budget did


def test_forgot_password_cannot_be_used_to_mail_bomb(client, outbox):
    auth(client)
    for _ in range(5):
        assert client.post("/api/auth/forgot-password", json={"email": "anna@psi.ru"}).status_code == 202
    r = client.post("/api/auth/forgot-password", json={"email": "anna@psi.ru"})
    assert r.status_code == 429 and len(outbox) == 5
    assert client.post("/api/auth/forgot-password", json={"email": "someone-else@x.ru"}).status_code == 429  # same address budget


def test_registration_and_invite_acceptance_are_limited(client):
    for i in range(10):
        client.post("/api/auth/register", json=register_payload(f"u{i}@x.ru", {"mode": "create", "name": f"Орг {i}", "inn": "7701234567"}))
    assert client.post("/api/auth/register", json=register_payload("late@x.ru", {"mode": "create", "name": "Поздняя", "inn": "7701234568"})).status_code == 429
    with client.session_factory() as db:
        ratelimit.reset_all(db)
    for _ in range(10):
        assert client.post("/api/auth/accept-invite", json={"token": "garbage", "fullName": "Иван Иванов", "password": PASSWORD}).status_code == 400
    assert client.post("/api/auth/accept-invite", json={"token": "garbage", "fullName": "Иван Иванов", "password": PASSWORD}).status_code == 429


def test_rate_limit_can_be_switched_off_for_development(client):
    auth(client)
    settings.rate_limit_enabled = False
    try:
        for _ in range(8):
            assert bad_login(client).status_code == 401
        assert login(client).status_code == 200
    finally:
        settings.rate_limit_enabled = True


# ---------------- session invalidation ----------------
def test_logout_ends_every_session_of_the_user(client):
    auth(client)
    a, _ = hdr(client, "anna@psi.ru")
    b, _ = hdr(client, "anna@psi.ru")  # a second device
    assert client.get("/api/auth/me", headers=a).status_code == 200 and client.get("/api/auth/me", headers=b).status_code == 200
    assert client.post("/api/auth/logout", headers=a).status_code == 204
    assert client.get("/api/auth/me", headers=a).status_code == 401
    assert client.get("/api/auth/me", headers=b).status_code == 401  # logout is global
    c, r = hdr(client, "anna@psi.ru")
    assert r.status_code == 200 and client.get("/api/auth/me", headers=c).status_code == 200
    assert client.post("/api/auth/logout").status_code == 401


def test_password_change_signs_out_other_devices_but_keeps_this_one(client):
    auth(client)
    here, _ = hdr(client, "anna@psi.ru")
    other, _ = hdr(client, "anna@psi.ru")
    r = client.post("/api/users/me/password", json={"currentPassword": PASSWORD, "newPassword": "NewStrong2026x"}, headers=here)
    fresh = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/auth/me", headers=fresh).status_code == 200
    assert client.get("/api/auth/me", headers=here).status_code == 401
    assert client.get("/api/auth/me", headers=other).status_code == 401


def test_password_reset_signs_everyone_out(client, outbox):
    auth(client)
    old, _ = hdr(client, "anna@psi.ru")
    with client.session_factory() as db:
        uid = db.query(User).one().id
    assert client.post("/api/auth/reset-password", json={"token": create_token(uid, "reset", 10), "password": "AnotherPass2026"}).status_code == 204
    assert client.get("/api/auth/me", headers=old).status_code == 401  # a stolen session dies with the old password


def test_tokens_issued_before_the_upgrade_keep_working_until_the_first_bump(client):
    auth(client)
    with client.session_factory() as db:
        uid = db.query(User).one().id
    legacy = {"Authorization": f"Bearer {create_token(uid, 'access', 10)}"}  # no "v" claim, like tokens from older versions
    assert client.get("/api/auth/me", headers=legacy).status_code == 200
    client.post("/api/auth/logout", headers=legacy)
    assert client.get("/api/auth/me", headers=legacy).status_code == 401


def test_a_token_for_another_purpose_is_not_a_session(client):
    auth(client)
    with client.session_factory() as db:
        uid = db.query(User).one().id
    reset_token = {"Authorization": f"Bearer {create_token(uid, 'reset', 10)}"}
    assert client.get("/api/auth/me", headers=reset_token).status_code == 401


# ---------------- headers ----------------
def test_security_headers_on_every_api_answer(client):
    h = auth(client)
    for r in (client.get("/api/health"), client.get("/api/auth/me", headers=h), client.get("/api/auth/me"), client.get("/api/nonexistent")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["referrer-policy"] == "same-origin"
        assert r.headers["cache-control"] == "no-store"


# ---------------- production configuration ----------------
STRONG = dict(environment="production", secret_key="x" * 40, seed_admin_password="Sup3rSecret-Pass")


def test_production_refuses_the_development_defaults():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", seed_admin_password="Sup3rSecret-Pass")
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(**{**STRONG, "secret_key": "short"})
    with pytest.raises(ValidationError, match="SEED_ADMIN_PASSWORD"):
        Settings(**{**STRONG, "seed_admin_password": "ChangeMe2026"})
    with pytest.raises(ValidationError, match="RATE_LIMIT"):
        Settings(**{**STRONG, "rate_limit_enabled": False})


def test_production_accepts_a_hardened_configuration_and_development_stays_easy():
    assert Settings(**STRONG).environment == "production"
    dev = Settings()
    assert dev.environment == "development" and dev.rate_limit_enabled is True


def test_attempts_are_shared_through_the_database_not_process_memory(client):
    """Two API workers see the same budget: the counter must live in shared storage."""
    from app.models import AuthAttempt

    auth(client)
    for _ in range(5):
        bad_login(client)
    with client.session_factory() as db:  # what a second worker process would read
        assert db.query(AuthAttempt).filter(AuthAttempt.key == "login:email:anna@psi.ru").count() == 5
        assert db.query(AuthAttempt).filter(AuthAttempt.key.like("login:ip:%")).count() == 5  # failures counted per address too
    assert login(client).status_code == 429


def test_expired_attempts_stop_counting(client):
    from datetime import datetime, timedelta, timezone

    from app.models import AuthAttempt

    auth(client)
    with client.session_factory() as db:
        old = datetime.now(timezone.utc) - timedelta(minutes=16)
        for _ in range(5):
            db.add(AuthAttempt(key="login:email:anna@psi.ru", created_at=old))
        db.commit()
    assert login(client).status_code == 200  # five failures, but all older than the 15-minute window


def test_retry_after_reflects_the_remaining_window(client):
    auth(client)
    for _ in range(5):
        bad_login(client)
    retry = int(login(client).headers["retry-after"])
    assert 800 < retry <= 900  # about 15 minutes, counted from the oldest attempt
