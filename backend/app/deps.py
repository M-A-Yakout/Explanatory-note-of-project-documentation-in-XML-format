from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .core.db import get_db
from .core.errors import api_error
from .core.security import TokenError, decode_token
from .models import Role, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise api_error(401, "unauthorized", "Требуется вход в систему")
    try:
        user_id = decode_token(creds.credentials, "access")
    except TokenError as e:
        raise api_error(401, "token_expired" if e.expired else "unauthorized", "Сессия недействительна")
    user = db.get(User, user_id)
    if user is None or not user.is_active or (user.organization and not user.organization.is_active):
        raise api_error(401, "unauthorized", "Сессия недействительна")
    return user


def require_roles(*roles: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise api_error(403, "forbidden", "Недостаточно прав")
        return user

    return checker
