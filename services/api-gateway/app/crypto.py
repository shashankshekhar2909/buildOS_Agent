"""Symmetric encryption for secrets at rest.

The master key is derived from FERNET_KEY env var (urlsafe-base64 32-byte key).
Generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
"""
import base64
import hashlib
import os
from cryptography.fernet import Fernet, InvalidToken


def _key() -> bytes:
    raw = os.environ.get("FERNET_KEY")
    if raw:
        return raw.encode()
    # Dev fallback: derive a deterministic key from JWT_SECRET so things boot
    # without setup. NEVER rely on this in production — set FERNET_KEY.
    seed = os.environ.get("JWT_SECRET", "dev-only-do-not-ship").encode()
    return base64.urlsafe_b64encode(hashlib.sha256(seed).digest())


_fernet = Fernet(_key())


def encrypt(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise ValueError("invalid ciphertext") from e
