import os
import sys
from pathlib import Path

# Add backend directory to sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ["VERCEL"] = "1"

import django
django.setup()

# Ensure SQLite schema is created if running in /tmp
try:
    from django.conf import settings
    db_name = str(settings.DATABASES["default"].get("NAME", ""))
    if "/tmp" in db_name and (not os.path.exists(db_name) or os.path.getsize(db_name) == 0):
        from django.core.management import call_command
        call_command("migrate", interactive=False)
except Exception as e:
    import logging
    logging.warning(f"Database setup error in /tmp: {e}")

from django.core.wsgi import get_wsgi_application
app = get_wsgi_application()
