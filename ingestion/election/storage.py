"""Source snapshots and atomic JSON writes."""

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value, *, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     delete=False) as output:
        temp = Path(output.name)
        try:
            json.dump(value, output, ensure_ascii=False, indent=None if compact else 2,
                      separators=(",", ":") if compact else None, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        except Exception:
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


class SourceError(ValueError):
    pass


class SourceStore:
    def __init__(self, root, *, offline=False, refresh=False, http_hosts=(), raw_root=None):
        self.root = Path(raw_root) if raw_root is not None else Path(root) / "raw"
        self.offline = offline
        self.refresh = refresh
        self.used = {}
        self.http_hosts = set(http_hosts)

    def import_file(self, url, path):
        """Import a separately downloaded source, never treating it as reviewed."""
        url = quote(url, safe=":/%?=&+#@")
        self._check_url(url)
        return self._save(url, Path(path).read_bytes())

    def _check_url(self, url):
        parsed = urlparse(url)
        if not parsed.hostname or (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in self.http_hosts)):
            raise SourceError(f"Source must have an HTTPS URL: {url}")

    def _save(self, url, data):
        key = hashlib.sha256(url.encode()).hexdigest()
        digest = hashlib.sha256(data).hexdigest()
        folder = self.root / key
        folder.mkdir(parents=True, exist_ok=True)
        blob = folder / digest
        if not blob.exists():
            blob.write_bytes(data)
        meta = {"id": f"source-{key}", "url": url, "retrieved_at": now(),
                "sha256": digest, "blob": str(blob.relative_to(self.root))}
        atomic_json(folder / "latest.json", meta)
        self.used[meta["id"]] = meta
        return data, meta

    def get(self, url):
        url = quote(url, safe=":/%?=&+#@")
        self._check_url(url)
        key = hashlib.sha256(url.encode()).hexdigest()
        cached = read_json(self.root / key / "latest.json")
        if cached and (self.offline or not self.refresh):
            data = (self.root / cached["blob"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != cached["sha256"]:
                raise SourceError(f"Corrupt source snapshot: {url}")
            self.used[cached["id"]] = cached
            return data, cached
        if self.offline:
            raise SourceError(f"Source not cached: {url}")
        try:
            request = Request(url, headers={"User-Agent": "BC-Election-Research/0.1"})
            with urlopen(request, timeout=30) as response:
                data = response.read()
        except (URLError, TimeoutError, OSError) as error:
            raise SourceError(f"Could not fetch {url}: {error}") from error
        return self._save(url, data)

    def text(self, url):
        data, meta = self.get(url)
        return data.decode("utf-8-sig"), meta
