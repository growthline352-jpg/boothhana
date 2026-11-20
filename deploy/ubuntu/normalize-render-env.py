"""Convert a Render dotenv export to Compose format: raw without logging secrets."""
import os
import shlex
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:3])
values = {}
for line in source.read_text(encoding="utf-8-sig").splitlines():
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    key, value = line.split("=", 1)
    if value.startswith(('"', "'")):
        parsed = shlex.split(value, comments=False, posix=True)
        if len(parsed) != 1:
            raise ValueError(f"Invalid quoted value for {key}")
        value = parsed[0]
    if "\n" in value or "\r" in value:
        raise ValueError(f"Multiline value unsupported for {key}")
    values[key] = value
if not values.get("DATABASE_URL", "").startswith("jdbc:postgresql:"):
    raise ValueError("Expected PostgreSQL JDBC URL")
os.umask(0o077)
target.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
target.chmod(0o600)
