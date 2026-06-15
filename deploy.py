#!/usr/bin/env python3
"""Deploy health-diary to Vercel via REST API."""
import os, json, hashlib, base64, sys
import urllib.request, urllib.error

VERCEL_TOKEN = os.environ["VERCEL_TOKEN"]
PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "prj_L467QiaDCufdjnBJsMmwZEDih9Jq")
BASE = "https://api.vercel.com"
HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}", "Content-Type": "application/json"}

ROOT = os.path.dirname(os.path.abspath(__file__))
skip_dirs = {'.git', 'node_modules', 'scripts', 'prompts', 'video-test'}
skip_ext = {'.md', '.txt'}
include_knowledge = {'core-style.js', 'cards.json', 'articles.json'}

def collect_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            _, ext = os.path.splitext(fn)
            if 'knowledge' in rel and fn not in include_knowledge:
                continue
            if ext in skip_ext and 'api' not in rel:
                continue
            if fn in ('deploy.py', '.gitignore'):
                continue
            with open(full, 'rb') as f:
                data = f.read()
            # Авто-bump cache-busters в index.html: ?v=XXX заменяется на текущий timestamp.
            # Так браузер ВСЕГДА видит свежие версии после deploy.
            if rel == 'index.html':
                import re
                from datetime import datetime
                stamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
                text = data.decode('utf-8')
                text = re.sub(r'\.(js|css)\?v=[A-Za-z0-9\-]+', lambda m: f'.{m.group(1)}?v={stamp}', text)
                data = text.encode('utf-8')
                print(f"  [auto-versioned scripts to v={stamp}]")
            sha = hashlib.sha1(data).hexdigest()
            files.append({"file": rel, "data": base64.b64encode(data).decode(), "sha": sha, "size": len(data)})
    return files

def deploy():
    files = collect_files()
    print(f"Deploying {len(files)} files...")
    for f in files:
        print(f"  {f['file']} ({f['size']} bytes)")
    payload = json.dumps({
        "name": "health-diary",
        "project": PROJECT_ID,
        "target": "production",
        "files": [{"file": f["file"], "data": f["data"], "encoding": "base64"} for f in files],
    }).encode()
    req = urllib.request.Request(f"{BASE}/v13/deployments", data=payload, headers=HEADERS, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        url = result.get("url", "unknown")
        print(f"\nDeployed: https://{url}")
        print(f"Status: {result.get('readyState', 'unknown')}")
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Deploy failed ({e.code}): {body[:500]}")
        return False

if __name__ == "__main__":
    ok = deploy()
    sys.exit(0 if ok else 1)
