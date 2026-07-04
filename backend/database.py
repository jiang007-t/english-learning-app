"""
database.py — SQLite 数据库层
功能：用户/故事/使用记录/复习结果/单词库/统计/90天清理
"""

import sqlite3
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'english_app.db')


# ==================== 密码加密 ====================

def _hash_password(password):
    """加盐 SHA-256 哈希，返回 $sha256$salt$hash 格式"""
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return f'$sha256${salt}${h}'


def _check_password(password, stored):
    """验证密码是否匹配存储的哈希值"""
    if not stored or not stored.startswith('$sha256$'):
        # 兼容旧数据（明文密码），自动升级为哈希
        return stored == password
    parts = stored.split('$')
    if len(parts) != 4:
        return False
    _, algo, salt, h = parts
    return hashlib.sha256((salt + password).encode('utf-8')).hexdigest() == h


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            uid         TEXT PRIMARY KEY,
            password    TEXT NOT NULL,
            name        TEXT DEFAULT '',
            age         INTEGER DEFAULT 8,
            level       TEXT DEFAULT 'L2',
            total_days  INTEGER DEFAULT 30,
            activate_date TEXT DEFAULT NULL,
            is_deleted  INTEGER DEFAULT 0,
            is_admin    INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS stories (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            uid           TEXT NOT NULL,
            story_id      TEXT NOT NULL UNIQUE,
            title         TEXT NOT NULL,
            story_type    TEXT NOT NULL,
            level         TEXT NOT NULL,
            words_json    TEXT NOT NULL,
            chapters_json TEXT NOT NULL,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE INDEX IF NOT EXISTS idx_stories_uid ON stories(uid);

        CREATE TABLE IF NOT EXISTS usage_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            uid         TEXT NOT NULL,
            login_time  TEXT DEFAULT (datetime('now','localtime')),
            logout_time TEXT DEFAULT NULL,
            duration_seconds INTEGER DEFAULT 0,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE INDEX IF NOT EXISTS idx_usage_uid ON usage_log(uid);

        CREATE TABLE IF NOT EXISTS review_results (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            uid         TEXT NOT NULL,
            story_id    TEXT NOT NULL,
            word        TEXT NOT NULL,
            correct     INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS word_library (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            word            TEXT NOT NULL UNIQUE,
            phonetic        TEXT DEFAULT '',
            meaning         TEXT DEFAULT '',
            example_sentence TEXT DEFAULT '',
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_wordlib_word ON word_library(word);
    """)
    conn.commit()
    conn.close()


# ==================== 90-day cleanup ====================

def cleanup_expired_users():
    """Hard-delete soft-deleted users whose last login was >90 days ago."""
    conn = get_db()
    cutoff = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')

    uids = conn.execute(
        """SELECT uid FROM users WHERE is_deleted=1
           AND uid NOT IN (
               SELECT DISTINCT uid FROM usage_log
               WHERE login_time > ?
           )""", (cutoff,)
    ).fetchall()

    for r in uids:
        uid = r['uid']
        conn.execute("DELETE FROM review_results WHERE uid=?", (uid,))
        conn.execute("DELETE FROM usage_log WHERE uid=?", (uid,))
        conn.execute("DELETE FROM stories WHERE uid=?", (uid,))
        conn.execute("DELETE FROM users WHERE uid=?", (uid,))

    conn.commit()
    conn.close()
    return len(uids)


# ==================== User CRUD ====================

def create_user(uid, password, name=None, age=8, level='L2',
                total_days=30, activate_date=None, is_admin=0):
    conn = get_db()
    conn.execute(
        "INSERT INTO users (uid,password,name,age,level,total_days,activate_date,is_admin) VALUES (?,?,?,?,?,?,?,?)",
        (uid, _hash_password(password), name or uid, age, level, total_days,
         activate_date or datetime.now().strftime('%Y-%m-%d'), is_admin)
    )
    conn.commit()
    conn.close()


def get_user(uid):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE uid=? AND is_deleted=0", (uid,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_users():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM users WHERE is_deleted=0 ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_user(uid, **kwargs):
    allowed = ['password', 'name', 'age', 'level', 'total_days', 'activate_date', 'is_admin']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return
    # 如果更新密码，自动哈希
    if 'password' in updates:
        updates['password'] = _hash_password(updates['password'])
    set_clause = ', '.join(f"{k}=?" for k in updates)
    conn = get_db()
    conn.execute(f"UPDATE users SET {set_clause} WHERE uid=?", list(updates.values()) + [uid])
    conn.commit()
    conn.close()


def soft_delete_user(uid):
    conn = get_db()
    conn.execute("UPDATE users SET is_deleted=1 WHERE uid=?", (uid,))
    conn.commit()
    conn.close()


def rename_user(old_uid, new_uid):
    """重命名用户UID，同步更新所有关联表（事务保护）"""
    if old_uid == new_uid:
        return
    conn = get_db()
    try:
        # 先检查新UID是否已存在
        existing = conn.execute("SELECT uid FROM users WHERE uid=? AND is_deleted=0", (new_uid,)).fetchone()
        if existing:
            raise ValueError(f"UID '{new_uid}' 已存在")
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("UPDATE users SET uid=? WHERE uid=?", (new_uid, old_uid))
        conn.execute("UPDATE stories SET uid=? WHERE uid=?", (new_uid, old_uid))
        conn.execute("UPDATE usage_log SET uid=? WHERE uid=?", (new_uid, old_uid))
        conn.execute("UPDATE review_results SET uid=? WHERE uid=?", (new_uid, old_uid))
        conn.execute("PRAGMA foreign_keys=ON")
        conn.commit()
    except:
        conn.rollback()
        raise
    finally:
        conn.close()


def verify_login(uid, password):
    """Returns user dict if valid, or error string: 'not_found', 'wrong_password', 'expired'."""
    user = get_user(uid)
    if not user:
        return 'not_found'
    if not _check_password(password, user['password']):
        return 'wrong_password'
    if user['activate_date'] and user['total_days']:
        expire = datetime.strptime(user['activate_date'], '%Y-%m-%d') + timedelta(days=user['total_days'])
        if datetime.now() > expire:
            return 'expired'
    return user


# ==================== Story CRUD ====================

def save_story(uid, story_id, title, story_type, level, words, chapters):
    conn = get_db()
    conn.execute(
        "INSERT INTO stories (uid,story_id,title,story_type,level,words_json,chapters_json) VALUES (?,?,?,?,?,?,?)",
        (uid, story_id, title, story_type, level,
         json.dumps(words, ensure_ascii=False),
         json.dumps(chapters, ensure_ascii=False))
    )
    conn.commit()
    conn.close()


def get_user_stories(uid, limit=50):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM stories WHERE uid=? ORDER BY created_at DESC LIMIT ?",
        (uid, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_story_detail(uid, story_id):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM stories WHERE uid=? AND story_id=?", (uid, story_id)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_today_story_count(uid):
    today = datetime.now().strftime('%Y-%m-%d')
    conn = get_db()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM stories WHERE uid=? AND created_at LIKE ?",
        (uid, today + '%')
    ).fetchone()
    conn.close()
    return row['cnt']


# ==================== Usage Log ====================

def log_login(uid):
    conn = get_db()
    conn.execute("INSERT INTO usage_log (uid) VALUES (?)", (uid,))
    conn.commit()
    log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return log_id


def log_logout(log_id):
    if not log_id:
        return
    conn = get_db()
    conn.execute(
        "UPDATE usage_log SET logout_time=datetime('now','localtime'), "
        "duration_seconds=(strftime('%s','now')-strftime('%s',login_time)) WHERE id=?",
        (log_id,)
    )
    conn.commit()
    conn.close()


# ==================== Word Library ====================

def lookup_word(word):
    conn = get_db()
    row = conn.execute(
        "SELECT word, phonetic, meaning, example_sentence FROM word_library WHERE LOWER(word)=LOWER(?)",
        (word.strip(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_words(limit=500):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM word_library ORDER BY word ASC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_word(word, phonetic='', meaning='', example_sentence=''):
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO word_library (word,phonetic,meaning,example_sentence) VALUES (?,?,?,?)",
        (word.strip().lower(), phonetic, meaning, example_sentence)
    )
    conn.commit()
    conn.close()


def update_word(word_id, **kwargs):
    allowed = ['word', 'phonetic', 'meaning', 'example_sentence']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return
    set_clause = ', '.join(f"{k}=?" for k in updates)
    conn = get_db()
    conn.execute(f"UPDATE word_library SET {set_clause} WHERE id=?", list(updates.values()) + [word_id])
    conn.commit()
    conn.close()


def delete_word(word_id):
    conn = get_db()
    conn.execute("DELETE FROM word_library WHERE id=?", (word_id,))
    conn.commit()
    conn.close()


def batch_add_words(word_list):
    """word_list: [{word, phonetic, meaning, example_sentence}, ...]"""
    conn = get_db()
    for w in word_list:
        conn.execute(
            "INSERT OR REPLACE INTO word_library (word,phonetic,meaning,example_sentence) VALUES (?,?,?,?)",
            (w['word'].strip().lower(), w.get('phonetic', ''),
             w.get('meaning', ''), w.get('example_sentence', ''))
        )
    conn.commit()
    conn.close()


# ==================== Stats ====================

def get_user_stats(uid):
    conn = get_db()

    total_stories = conn.execute(
        "SELECT COUNT(*) as cnt FROM stories WHERE uid=?", (uid,)
    ).fetchone()['cnt']

    total_days = conn.execute(
        "SELECT COUNT(DISTINCT date(login_time)) as cnt FROM usage_log WHERE uid=?",
        (uid,)
    ).fetchone()['cnt']

    total_sec = conn.execute(
        "SELECT COALESCE(SUM(duration_seconds),0) as sec FROM usage_log WHERE uid=?",
        (uid,)
    ).fetchone()['sec']

    total_words = set()
    for r in conn.execute("SELECT words_json FROM stories WHERE uid=?", (uid,)).fetchall():
        try:
            total_words.update(json.loads(r['words_json']))
        except:
            pass

    rr = conn.execute(
        "SELECT COUNT(*) as total, SUM(correct) as correct FROM review_results WHERE uid=?",
        (uid,)
    ).fetchone()
    accuracy = round(rr['correct'] / rr['total'] * 100, 1) if rr['total'] and rr['total'] > 0 else None

    conn.close()
    return {
        'total_stories': total_stories,
        'total_days': total_days,
        'total_duration_seconds': total_sec,
        'total_words_count': len(total_words),
        'review_accuracy': accuracy,
    }


def get_user_trends(uid, period='week'):
    """Per-day trend data for charts."""
    days_map = {'3': 3, 'week': 7, '15': 15, 'month': 30}
    days = days_map.get(period, 7)
    conn = get_db()
    results = []

    for offset in range(days - 1, -1, -1):
        day = (datetime.now() - timedelta(days=offset)).strftime('%Y-%m-%d')

        stories_cnt = conn.execute(
            "SELECT COUNT(*) as cnt FROM stories WHERE uid=? AND created_at LIKE ?",
            (uid, day + '%')
        ).fetchone()['cnt']

        duration = conn.execute(
            "SELECT COALESCE(SUM(duration_seconds),0) as sec FROM usage_log WHERE uid=? AND login_time LIKE ?",
            (uid, day + '%')
        ).fetchone()['sec']

        rr = conn.execute(
            "SELECT COUNT(*) as total, SUM(correct) as correct FROM review_results WHERE uid=? AND created_at LIKE ?",
            (uid, day + '%')
        ).fetchone()
        accuracy = round(rr['correct'] / rr['total'] * 100, 1) if rr['total'] and rr['total'] > 0 else None

        results.append({
            'date': day,
            'stories': stories_cnt,
            'duration_minutes': round(duration / 60, 1),
            'accuracy': accuracy,
        })

    conn.close()
    return results


def get_admin_dashboard():
    """Aggregate stats for admin dashboard."""
    conn = get_db()
    today = datetime.now().strftime('%Y-%m-%d')

    total_users = conn.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE is_deleted=0"
    ).fetchone()['cnt']

    active_today = conn.execute(
        "SELECT COUNT(DISTINCT uid) as cnt FROM usage_log WHERE login_time LIKE ?",
        (today + '%',)
    ).fetchone()['cnt']

    today_duration = conn.execute(
        "SELECT COALESCE(SUM(duration_seconds),0) as sec FROM usage_log WHERE login_time LIKE ?",
        (today + '%',)
    ).fetchone()['sec']

    all_rr = conn.execute(
        "SELECT COUNT(*) as total, SUM(correct) as correct FROM review_results"
    ).fetchone()
    avg_accuracy = round(all_rr['correct'] / all_rr['total'] * 100, 1) if all_rr['total'] and all_rr['total'] > 0 else None

    total_stories = conn.execute("SELECT COUNT(*) as cnt FROM stories").fetchone()['cnt']

    word_lib_count = conn.execute("SELECT COUNT(*) as cnt FROM word_library").fetchone()['cnt']

    conn.close()
    return {
        'total_users': total_users,
        'active_today': active_today,
        'today_duration_minutes': round(today_duration / 60, 1),
        'avg_accuracy': avg_accuracy,
        'total_stories': total_stories,
        'word_library_count': word_lib_count,
    }
