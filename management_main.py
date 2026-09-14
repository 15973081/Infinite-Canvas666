"""Run independently: python -m uvicorn management_main:app --host 127.0.0.1 --port 8766."""
from app.management.application import create_app

app = create_app()
