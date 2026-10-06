"""Atomic state replacement with a bounded retry for Windows sharing violations."""
import os
import sys
import time


def replace_with_retry(source,destination):
    for attempt in range(6):
        try:
            os.replace(source,destination)
            return
        except PermissionError:
            if sys.platform!='win32' or attempt==5:raise
            time.sleep(0.02*(2**attempt))
