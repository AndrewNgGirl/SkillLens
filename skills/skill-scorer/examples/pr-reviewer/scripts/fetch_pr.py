"""Fetch a GitHub PR's unified diff and changed file list.

Usage:
    python fetch_pr.py <pr_url> [--token $GH_TOKEN]
"""
import sys
import urllib.request
import urllib.error
import json
import re

PR_URL_RE = re.compile(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)")


def fetch(pr_url: str, token: str | None = None) -> dict:
    m = PR_URL_RE.search(pr_url)
    if not m:
        raise ValueError(f"not a recognizable PR URL: {pr_url}")
    owner, repo, num = m.group(1), m.group(2), m.group(3)
    api = f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}"
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(api, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            meta = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub API {e.code}: {e.reason}")

    diff_req = urllib.request.Request(api, headers={**headers, "Accept": "application/vnd.github.v3.diff"})
    with urllib.request.urlopen(diff_req, timeout=20) as r:
        diff = r.read().decode("utf-8")
    return {"head_sha": meta["head"]["sha"], "title": meta["title"], "diff": diff}


if __name__ == "__main__":
    print(json.dumps(fetch(sys.argv[1]), ensure_ascii=False, indent=2))
