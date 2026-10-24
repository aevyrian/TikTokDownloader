import hmac
import hashlib
import math
import json
import secrets
import sqlite3
import time
from calendar import monthrange
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.root.chmod(0o700)
        for path in self.root.rglob("*"):
            if not path.is_symlink():
                path.chmod(0o700 if path.is_dir() else 0o600)
        self.path = self.root / "library.sqlite3"
        self.path.touch(mode=0o600, exist_ok=True)
        self.path.chmod(0o600)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, link TEXT NOT NULL,
                    status TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
                    completed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    accept_quality INTEGER NOT NULL DEFAULT 0,
                    preview TEXT NOT NULL DEFAULT '[]', author_id TEXT);
                CREATE INDEX IF NOT EXISTS task_state ON tasks(status,created_at);
                CREATE TABLE IF NOT EXISTS works (
                    id TEXT PRIMARY KEY, description TEXT, author TEXT, author_id TEXT,
                    type TEXT, created_at TEXT, files TEXT NOT NULL, metadata TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS work_author ON works(author_id);
                CREATE INDEX IF NOT EXISTS work_identity ON works(author_id,created_at,type);
                CREATE TABLE IF NOT EXISTS work_aliases (id TEXT PRIMARY KEY, work_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS favorites (work_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS authors (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
                    enabled INTEGER NOT NULL DEFAULT 0, interval_minutes INTEGER NOT NULL DEFAULT 60,
                    last_checked REAL, next_check REAL NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '');
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def setting(self, key, default=None):
        with self.connect() as db:
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_setting(self, key, value):
        with self.connect() as db:
            db.execute("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                       (key, json.dumps(value, ensure_ascii=False)))

    def set_admin_key(self, key, expected_key, first=False):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            settings = {row["key"]: json.loads(row["value"]) for row in db.execute(
                "SELECT key,value FROM settings WHERE key IN ('access_token','admin_key_set')")}
            if (first and settings.get("admin_key_set")) or not hmac.compare_digest(
                    settings.get("access_token", "").encode(), expected_key.encode()):
                return False
            for name, value in (("access_token", key), ("admin_key_set", True)):
                db.execute("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                           (name, json.dumps(value)))
        return True

    @staticmethod
    def task_dict(row):
        if not row:
            return None
        result = dict(row)
        result["preview"] = json.loads(result["preview"])
        result["accept_quality"] = bool(result["accept_quality"])
        return result

    def create_task(self, link, kind, accept_quality=False, author_id=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM tasks WHERE link=? AND kind=? AND status IN ('queued','parsing','downloading','awaiting_confirmation') ORDER BY created_at LIMIT 1",
                             (link, kind)).fetchone()
            if row:
                return self.task_dict(row)
            task_id = secrets.token_hex(8)
            now = stamp()
            db.execute("INSERT INTO tasks (id,kind,link,status,created_at,updated_at,accept_quality,author_id) VALUES (?,?,?,'queued',?,?,?,?)",
                       (task_id, kind, link, now, now, int(accept_quality), author_id))
        return self.task(task_id)

    def task(self, task_id):
        with self.connect() as db:
            return self.task_dict(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())

    def tasks(self):
        with self.connect() as db:
            return [self.task_dict(row) for row in db.execute("""
                SELECT * FROM tasks WHERE status!='completed' OR id IN (
                    SELECT id FROM tasks WHERE status='completed' ORDER BY created_at DESC,rowid DESC LIMIT 300
                ) ORDER BY created_at DESC,rowid DESC
            """)]

    def update_task(self, task_id, **values):
        allowed = {"status", "message", "completed", "total", "accept_quality", "preview"}
        if not values or not set(values) <= allowed:
            raise ValueError("任务更新字段无效")
        if "preview" in values:
            values["preview"] = json.dumps(values["preview"], ensure_ascii=False)
        values["updated_at"] = stamp()
        with self.connect() as db:
            db.execute("UPDATE tasks SET " + ",".join(f"{key}=?" for key in values) + " WHERE id=?",
                       (*values.values(), task_id))

    def claim_task(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at,rowid LIMIT 1").fetchone()
            if not row:
                return None
            db.execute("UPDATE tasks SET status='parsing',message='正在解析作品',updated_at=? WHERE id=?", (stamp(), row["id"]))
        return self.task(row["id"])

    def recover(self):
        with self.connect() as db:
            db.execute("UPDATE tasks SET status='interrupted',message='上次运行中断，可点击重试',updated_at=? WHERE status IN ('parsing','downloading')", (stamp(),))

    def save_work(self, item, files):
        self.save_works([(item, files)])

    def save_works(self, records):
        with self.connect() as db:
            db.executemany("INSERT INTO works VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET files=excluded.files,metadata=excluded.metadata,description=excluded.description,author=excluded.author,author_id=excluded.author_id,type=excluded.type",
                       [(str(item["id"]), item.get("desc", ""), item.get("nickname", "未知作者"),
                        item.get("sec_uid") or item.get("uid") or "", item.get("type", ""), item.get("create_time") or stamp(),
                        json.dumps(files, ensure_ascii=False), json.dumps(item, ensure_ascii=False)) for item, files in records])

    def legacy_count(self):
        with self.connect() as db:
            return db.execute("SELECT COUNT(*) FROM works WHERE id GLOB 'legacy-*'").fetchone()[0]

    def prune_legacy(self, scan_id):
        with self.connect() as db:
            db.execute("DELETE FROM works WHERE id GLOB 'legacy-*' AND json_extract(metadata,'$._legacy_scan') IS NOT ?", (scan_id,))

    @staticmethod
    def work_dict(row):
        if not row:
            return None
        result = dict(row)
        result["files"] = json.loads(result["files"])
        result.pop("metadata")
        result["source"] = "legacy" if result["id"].startswith("legacy-") else "download"
        result['favorite'] = bool(result.get('favorite',False))
        return result

    def work(self, work_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM works WHERE id=?", (work_id,)).fetchone()
            if row is None:
                row = db.execute("SELECT w.* FROM works w JOIN work_aliases a ON a.work_id=w.id WHERE a.id=?",(work_id,)).fetchone()
        return self.work_dict(row)

    def link_work(self, work_id, local_id):
        with self.connect() as db:
            db.execute("INSERT INTO work_aliases VALUES (?,?) ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id",(work_id,local_id))

    def legacy_matches(self, uid, created, kind):
        with self.connect() as db:
            rows=db.execute("SELECT * FROM works WHERE author_id=? AND created_at=? AND type=? AND id GLOB 'legacy-*'",(uid,created,kind)).fetchall()
        return [self.work_dict(row) for row in rows]

    def legacy_unidentified(self, uid):
        with self.connect() as db:
            return db.execute("SELECT 1 FROM works WHERE author_id=? AND id GLOB 'legacy-*' AND json_extract(files,'$[0]') NOT GLOB ? LIMIT 1",(uid,'*/????-??-?? ??.??.??-*-*')).fetchone() is not None

    def set_favorite(self, work_id, favorite):
        work=self.work(work_id)
        if not work:
            raise ValueError('作品不存在')
        with self.connect() as db:
            if favorite:
                db.execute('INSERT OR IGNORE INTO favorites VALUES (?,?)',(work['id'],stamp()))
            else:
                db.execute('DELETE FROM favorites WHERE work_id=?',(work['id'],))

    def library(self, q="", author="", offset=0, limit=30, seed=None, ceiling=None, favorite=False):
        where, args = ["1=1"], []
        if favorite:
            where.append('id IN (SELECT work_id FROM favorites)')
        if q:
            where.append("(description LIKE ? OR author LIKE ? OR id=? OR id=(SELECT work_id FROM work_aliases WHERE id=?))")
            args.extend((f"%{q}%", f"%{q}%", q, q))
        if author:
            where.append("(author_id=? OR author=?)")
            args.extend((author, author))
        clause = " AND ".join(where)
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM works WHERE " + clause, args).fetchone()[0]
            select='SELECT *,EXISTS(SELECT 1 FROM favorites WHERE work_id=works.id) AS favorite FROM works'
            if seed is not None and not q and not author and not favorite:
                maximum=db.execute('SELECT COALESCE(MAX(rowid),0) FROM works').fetchone()[0]
                ceiling=min(ceiling or maximum,maximum)
                rows=[]; cursor=offset
                if ceiling:
                    # 遍历索引行号的置换，避免对几十万作品全表随机排序。
                    start=seed%ceiling;step=(seed*2+1)%ceiling or 1
                    while math.gcd(step,ceiling)!=1:step=(step+1)%ceiling or 1
                    while len(rows)<limit and cursor<ceiling:
                        ids=[1+(start+i*step)%ceiling for i in range(cursor,min(cursor+limit-len(rows),ceiling))]
                        cursor+=len(ids)
                        found={r['rid']:r for r in db.execute(select.replace('SELECT *,','SELECT rowid AS rid,*,')+' WHERE rowid IN ('+','.join('?' for _ in ids)+')',ids)}
                        rows.extend(found[i] for i in ids if i in found)
                result={'next_offset':cursor,'ceiling':ceiling,'has_more':cursor<ceiling}
            else:
                rows=db.execute(select+' WHERE '+clause+' ORDER BY rowid DESC LIMIT ? OFFSET ?',(*args,limit,offset)).fetchall()
                result={'next_offset':offset+len(rows),'ceiling':None,'has_more':offset+len(rows)<total}
        items=[self.work_dict(row) for row in rows]
        for item in items:item.pop('rid',None)
        return {"items":items,"total":total,**result}

    def author_history(self):
        authors={a['url']:{**a,'registered':True} for a in self.authors()}
        with self.connect() as db:
            tasks=db.execute("SELECT * FROM tasks WHERE kind='author' ORDER BY created_at DESC,rowid DESC").fetchall()
        for row in tasks:
            task=self.task_dict(row);url=task['link']
            if url not in authors:
                authors[url]={'id':hashlib.sha256(url.encode()).hexdigest()[:16],'url':url,'name':'博主信息待获取','enabled':False,'interval_minutes':1440,'last_checked':task['updated_at'],'next_check':0,'last_error':'','registered':False}
            entry=authors[url]
            if 'last_task' not in entry:
                entry['last_task']=task['status']
                if task['preview'] and not entry['registered']:entry['name']=task['preview'][0].get('nickname') or entry['name']
                if task['status']=='failed':entry['last_error']=task['message']
        return sorted(authors.values(),key=lambda a:not a['enabled'])

    def save_author(self, author_id, url, name="", enabled=False, interval_minutes=1440):
        with self.connect() as db:
            old = db.execute("SELECT id FROM authors WHERE url=?", (url,)).fetchone()
            if old:
                author_id = old[0]
            db.execute("INSERT INTO authors(id,name,url,enabled,interval_minutes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,next_check=0",
                       (author_id, name or "待获取作者", url, int(enabled), interval_minutes))
        return next(a for a in self.authors() if a["id"] == author_id)

    def authors(self):
        with self.connect() as db:
            rows = [dict(r) for r in db.execute("SELECT * FROM authors ORDER BY rowid DESC")]
        for row in rows:
            row["enabled"] = bool(row["enabled"])
        return rows

    def author(self, author_id):
        return next((a for a in self.authors() if a["id"] == author_id), None)

    def patch_author(self, author_id, **values):
        if not values or not set(values) <= {"enabled", "interval_minutes", "name", "last_checked", "next_check", "last_error"}:
            raise ValueError("博主更新字段无效")
        with self.connect() as db:
            db.execute("UPDATE authors SET " + ",".join(f"{key}=?" for key in values) + " WHERE id=?", (*values.values(), author_id))
        return self.author(author_id)

    def due_authors(self):
        return [a for a in self.authors() if a["enabled"] and a["next_check"] <= time.time()]

    def mark_author_scheduled(self, author_id):
        author = self.author(author_id)
        if author:
            now = time.time()
            if author["interval_minutes"] == 43200:
                current = datetime.fromtimestamp(now)
                year, month = current.year + (current.month == 12), current.month % 12 + 1
                due = current.replace(year=year, month=month, day=min(current.day, monthrange(year, month)[1])).timestamp()
            else:
                due = now + author["interval_minutes"] * 60
            self.patch_author(author_id, next_check=due)

    def stats(self):
        with self.connect() as db:
            return {table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ("works", "tasks", "authors")}
