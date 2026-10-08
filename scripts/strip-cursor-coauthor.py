import sys

lines = sys.stdin.read().splitlines(True)
out = []
for line in lines:
    low = line.lower()
    if "cursoragent@cursor.com" in low:
        continue
    if low.startswith("co-authored-by: cursor"):
        continue
    if low.startswith("made-with: cursor"):
        continue
    out.append(line)
sys.stdout.write("".join(out))
