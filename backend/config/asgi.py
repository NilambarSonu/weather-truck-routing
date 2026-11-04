import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

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

from django.core.asgi import get_asgi_application

application = get_asgi_application()
app = application
