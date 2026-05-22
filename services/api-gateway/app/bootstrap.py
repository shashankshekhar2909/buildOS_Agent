from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import hash_password
from app.config import get_settings
from app.models import User


async def ensure_bootstrap_admin(db: AsyncSession) -> bool:
    settings = get_settings()
    email = settings.bootstrap_admin_email.strip()
    password = settings.bootstrap_admin_password
    if not email or not password:
        return False

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        db.add(User(email=email, password_hash=hash_password(password), role="admin", is_active=True))
    else:
        user.password_hash = hash_password(password)
        user.role = "admin"
        user.is_active = True
    await db.commit()
    return True
