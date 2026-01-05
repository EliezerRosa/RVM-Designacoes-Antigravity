import os
import datetime

files = [
    r"c:\Antigravity - RVM Designações\backup_rvm_2026-01-05.json",
    r"c:\Antigravity - RVM Designações\backup_rvm_2026-01-05.xlsx"
]

print("--- FILE TIMESTAMP CHECK ---")
for f in files:
    if os.path.exists(f):
        ts = os.path.getmtime(f)
        dt = datetime.datetime.fromtimestamp(ts)
        print(f"File: {os.path.basename(f)}")
        print(f"  Modified: {dt} (Timestamp: {ts})")
        print(f"  Size: {os.path.getsize(f)} bytes")
    else:
        print(f"File: {os.path.basename(f)} - NOT FOUND")
