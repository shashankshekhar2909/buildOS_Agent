"""Refresh token rotation store.

Each issued refresh token gets a (jti, family). On rotate we mark the old jti
consumed and issue a new one within the same family. If we ever see a refresh
whose jti is already consumed, that family is treated as compromised — we
revoke the whole family.

Backed by redis.
"""
from app.events import client


def _jti_key(jti: str) -> str:
    return f"refresh:jti:{jti}"


def _family_key(family: str) -> str:
    return f"refresh:family:{family}"


async def register(sub: str, jti: str, family: str, ttl_seconds: int) -> None:
    r = client()
    await r.set(_jti_key(jti), f"active:{sub}:{family}", ex=ttl_seconds)
    await r.sadd(_family_key(family), jti)
    await r.expire(_family_key(family), ttl_seconds)


async def consume(jti: str) -> str | None:
    """Returns marker if active. Marks consumed atomically. Returns None if missing/already-used."""
    r = client()
    pipe = r.pipeline()
    pipe.getdel(_jti_key(jti))
    res = await pipe.execute()
    return res[0]


async def revoke_family(family: str) -> int:
    r = client()
    jtis = await r.smembers(_family_key(family))
    if jtis:
        await r.delete(*[_jti_key(j) for j in jtis])
    await r.delete(_family_key(family))
    return len(jtis)
