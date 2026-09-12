"""Reset the local shared-workspace login from an administrator terminal."""
import getpass
import os
from pathlib import Path
import secrets
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.storage.settings import load_storage_env
load_storage_env()
from app.services.auth import database, password_digest
from app.storage.settings import postgres_enabled


def main():
    if postgres_enabled() or os.getenv("CLOUD_ACCESS_PASSWORD"):
        raise SystemExit("请修改 CLOUD_ACCESS_USER / CLOUD_ACCESS_PASSWORD 配置并重启服务。")
    username = input("新的访问账号: ").strip()
    password = getpass.getpass("新密码（至少 12 位）: ")
    confirmation = getpass.getpass("再次输入密码: ")
    if not username or len(username) > 64 or not 12 <= len(password) <= 256 or password != confirmation:
        raise SystemExit("账号或密码不符合要求，未修改任何数据。")
    salt = secrets.token_hex(16)
    digest = password_digest(password, salt)
    with database() as db:
        db.execute("INSERT INTO account VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, salt=excluded.salt, digest=excluded.digest",
                   (username, salt, digest))
        db.execute("DELETE FROM sessions")
        db.execute("DELETE FROM attempts")
    print("访问账号已更新，所有旧会话已撤销。")


if __name__ == "__main__":
    main()
