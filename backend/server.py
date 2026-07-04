"""
server.py — Flask API for Story English
Integrates story pipeline, database, auth, admin, word library.
"""

import sys
import os

_SP = os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages')
if os.path.isdir(_SP) and _SP not in sys.path:
    sys.path.insert(0, _SP)

import json
import traceback
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# 前端目录路径（GitHub 仓库结构: frontend/）
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')

# CORS: 允许 Cloudflare Pages 和本地开发
ALLOWED_ORIGINS = [
    "http://localhost:5050",
    "http://127.0.0.1:5050",
    "https://*.pages.dev",       # Cloudflare Pages
    "https://*.onrender.com",     # Render 默认域名
]
CORS(app, origins=ALLOWED_ORIGINS)

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    init_db, create_user, get_user, get_all_users, update_user,
    soft_delete_user, rename_user, verify_login, save_story, get_user_stories,
    get_story_detail, get_today_story_count, get_user_stats,
    log_login, log_logout,
    lookup_word, get_all_words, add_word, update_word, delete_word, batch_add_words,
    get_user_trends, get_admin_dashboard, cleanup_expired_users,
)
from story_pipeline import generate_story_tree_with_retry

# ⚠️ 安全提示：管理员密码通过环境变量读取
# 设置方式（Windows PowerShell）：
#   $env:ADMIN_PASSWORD="你的管理员密码"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "yhw20001228")
MAX_STORIES_PER_DAY = 20


@app.before_request
def _ensure_db():
    init_db()


def _calc_expire(user):
    if not user.get('activate_date') or not user.get('total_days'):
        return None
    from datetime import timedelta
    expire = datetime.strptime(user['activate_date'], '%Y-%m-%d') + timedelta(days=user['total_days'])
    return expire.strftime('%Y-%m-%d')


def _calc_status(user, today):
    es = _calc_expire(user)
    if not es:
        return 'active'
    expire = datetime.strptime(es, '%Y-%m-%d')
    days_left = (expire - today).days
    if days_left <= 0:
        return 'expired'
    elif days_left <= 7:
        return 'warning'
    return 'active'


# ==================== Login / Logout ====================

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True) or {}
    uid = data.get('uid', '').strip()
    password = data.get('password', '').strip()
    if not uid or not password:
        return jsonify({'error': 'UID and password required'}), 400
    user = verify_login(uid, password)
    if user == 'wrong_password':
        return jsonify({'error': '密码错误'}), 401
    if user == 'expired':
        return jsonify({'error': '该账户已到期，请及时续费'}), 401
    if user == 'not_found':
        return jsonify({'error': '账号不存在'}), 401
    log_id = log_login(uid)
    return jsonify({
        'uid': user['uid'],
        'name': user['name'],
        'age': user['age'],
        'level': user['level'],
        'expireDate': _calc_expire(user),
        'isAdmin': bool(user.get('is_admin', 0)),
        'logId': log_id,
    })


@app.route('/api/logout', methods=['POST'])
def api_logout():
    data = request.get_json(silent=True) or {}
    log_logout(data.get('logId'))
    return jsonify({'ok': True})


# ==================== Dictionary Lookup ====================

@app.route('/api/dictionary/lookup', methods=['GET'])
def api_dictionary_lookup():
    word = request.args.get('word', '').strip()
    if not word:
        return jsonify({'error': 'word required'}), 400
    result = lookup_word(word)
    if not result:
        return jsonify({'error': 'not found'}), 404
    return jsonify(result)


# ==================== Story Generate ====================

@app.route('/api/story/generate', methods=['POST'])
def api_story_generate():
    data = request.get_json(silent=True) or {}
    uid = data.get('uid', '').strip()
    words = data.get('words', [])
    story_type = data.get('type', 'adventure')
    level = data.get('level', 'L2')

    if not uid:
        return jsonify({'error': 'UID required'}), 400
    if not words or len(words) < 3:
        return jsonify({'error': 'At least 3 words required'}), 400

    user = get_user(uid)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    today_count = get_today_story_count(uid)
    if today_count >= MAX_STORIES_PER_DAY:
        return jsonify({'error': f'Daily limit ({MAX_STORIES_PER_DAY}) reached'}), 429

    try:
        story, passed, attempts, errors = generate_story_tree_with_retry(
            level, story_type, words
        )
        if not story or not passed:
            return jsonify({'error': 'Story generation failed', 'detail': str(errors)}), 500

        save_story(
            uid=uid,
            story_id=story.get('storyId', ''),
            title=story.get('title', 'Untitled'),
            story_type=story_type,
            level=level,
            words=words,
            chapters=story.get('chapters', {}),
        )

        return jsonify(story)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ==================== Story History ====================

@app.route('/api/story/history/<uid>', methods=['GET'])
def api_story_history(uid):
    stories = get_user_stories(uid)
    return jsonify([
        {
            'storyId': s['story_id'],
            'title': s['title'],
            'type': s['story_type'],
            'words': json.loads(s['words_json']),
            'date': s['created_at'][:10] if s['created_at'] else '',
        }
        for s in stories
    ])


@app.route('/api/story/detail/<uid>/<story_id>', methods=['GET'])
def api_story_detail(uid, story_id):
    story = get_story_detail(uid, story_id)
    if not story:
        return jsonify({'error': 'Story not found'}), 404
    return jsonify({
        'storyId': story['story_id'],
        'title': story['title'],
        'type': story['story_type'],
        'level': story['level'],
        'words': json.loads(story['words_json']),
        'chapters': json.loads(story['chapters_json']),
        'date': story['created_at'][:10] if story['created_at'] else '',
    })


# ==================== Sync Review Results ====================

@app.route('/api/sync/review', methods=['POST'])
def api_sync_review():
    data = request.get_json(silent=True) or {}
    uid = data.get('uid')
    story_id = data.get('storyId')
    results = data.get('results', {})

    if not uid or not story_id:
        return jsonify({'error': 'uid and storyId required'}), 400

    import sqlite3 as s3
    conn = s3.connect(
        os.path.join(os.path.dirname(__file__), 'data', 'english_app.db')
    )
    for word, correct in results.items():
        conn.execute(
            "INSERT INTO review_results (uid, story_id, word, correct) VALUES (?,?,?,?)",
            (uid, story_id, word, 1 if correct else 0)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ==================== Admin Login ====================

@app.route('/api/admin/login', methods=['POST'])
def api_admin_login():
    data = request.get_json(silent=True) or {}
    if data.get('password') != ADMIN_PASSWORD:
        return jsonify({'error': 'Wrong password'}), 401
    return jsonify({'token': 'admin-session', 'ok': True})


# ==================== Admin Dashboard ====================

@app.route('/api/admin/dashboard', methods=['GET'])
def api_admin_dashboard():
    return jsonify(get_admin_dashboard())


# ==================== Admin User CRUD ====================

@app.route('/api/admin/users', methods=['GET'])
def api_admin_get_users():
    users = get_all_users()
    today = datetime.now()
    return jsonify([
        {
            'uid': u['uid'],
            'name': u['name'],
            'age': u['age'],
            'level': u['level'],
            'totalDays': u['total_days'],
            'activateDate': u['activate_date'],
            'expireDate': _calc_expire(u),
            'isAdmin': bool(u.get('is_admin', 0)),
            'status': _calc_status(u, today),
        }
        for u in users
    ])


@app.route('/api/admin/users', methods=['POST'])
def api_admin_create_user():
    data = request.get_json(silent=True) or {}
    uid = data.get('uid', '').strip()
    if not uid:
        return jsonify({'error': 'UID required'}), 400
    if get_user(uid):
        return jsonify({'error': 'UID already exists'}), 409
    create_user(
        uid=uid,
        password=data.get('password') or '123456',
        name=data.get('name', uid),
        age=data.get('age', 8),
        level=data.get('level', 'L2'),
        total_days=data.get('totalDays', 30),
        activate_date=data.get('activateDate') or datetime.now().strftime('%Y-%m-%d'),
        is_admin=1 if data.get('isAdmin') else 0,
    )
    return jsonify({'ok': True})


@app.route('/api/admin/users/<uid>', methods=['PUT'])
def api_admin_update_user(uid):
    data = request.get_json(silent=True) or {}
    kwargs = {}
    if 'password' in data:
        kwargs['password'] = data['password']
    if 'name' in data:
        kwargs['name'] = data['name']
    if 'age' in data:
        kwargs['age'] = data['age']
    if 'level' in data:
        kwargs['level'] = data['level']
    if 'totalDays' in data:
        kwargs['total_days'] = data['totalDays']
    if 'activateDate' in data:
        kwargs['activate_date'] = data['activateDate']
    if 'isAdmin' in data:
        kwargs['is_admin'] = 1 if data['isAdmin'] else 0
    update_user(uid, **kwargs)
    return jsonify({'ok': True})


@app.route('/api/admin/users/<uid>', methods=['DELETE'])
def api_admin_delete_user(uid):
    soft_delete_user(uid)
    return jsonify({'ok': True, 'msg': 'User soft-deleted (90-day retention)'})


@app.route('/api/admin/users/<uid>/rename', methods=['PUT'])
def api_admin_rename_user(uid):
    data = request.get_json(silent=True) or {}
    new_uid = data.get('newUid', '').strip()
    if not new_uid:
        return jsonify({'error': '新UID不能为空'}), 400
    if new_uid == uid:
        return jsonify({'ok': True})
    try:
        rename_user(uid, new_uid)
        return jsonify({'ok': True, 'newUid': new_uid})
    except ValueError as e:
        return jsonify({'error': str(e)}), 409
    except Exception as e:
        return jsonify({'error': f'重命名失败: {str(e)}'}), 500


@app.route('/api/admin/users/<uid>/stats', methods=['GET'])
def api_admin_user_stats(uid):
    stats = get_user_stats(uid)
    stories = get_user_stories(uid)
    stats['stories'] = [
        {
            'storyId': s['story_id'],
            'title': s['title'],
            'type': s['story_type'],
            'words': json.loads(s['words_json']),
            'chapters': json.loads(s['chapters_json']),
            'date': s['created_at'][:10] if s['created_at'] else '',
        }
        for s in stories
    ]
    return jsonify(stats)


# ==================== User Trends ====================

@app.route('/api/admin/users/<uid>/trends', methods=['GET'])
def api_admin_user_trends(uid):
    period = request.args.get('period', 'week')
    valid_periods = ('3', 'week', '15', 'month')
    if period not in valid_periods:
        period = 'week'
    return jsonify(get_user_trends(uid, period))


# ==================== Admin Word Library ====================

@app.route('/api/admin/words', methods=['GET'])
def api_admin_get_words():
    return jsonify(get_all_words())


@app.route('/api/admin/words', methods=['POST'])
def api_admin_add_word():
    data = request.get_json(silent=True) or {}
    word = data.get('word', '').strip()
    if not word:
        return jsonify({'error': 'word required'}), 400
    add_word(
        word=word,
        phonetic=data.get('phonetic', ''),
        meaning=data.get('meaning', ''),
        example_sentence=data.get('exampleSentence', ''),
    )
    return jsonify({'ok': True})


@app.route('/api/admin/words/batch', methods=['POST'])
def api_admin_batch_add_words():
    data = request.get_json(silent=True) or {}
    word_list = data.get('words', [])
    if not word_list:
        return jsonify({'error': 'words list required'}), 400
    batch_add_words(word_list)
    return jsonify({'ok': True, 'count': len(word_list)})


@app.route('/api/admin/words/<int:word_id>', methods=['PUT'])
def api_admin_update_word(word_id):
    data = request.get_json(silent=True) or {}
    kwargs = {}
    if 'word' in data:
        kwargs['word'] = data['word'].strip().lower()
    if 'phonetic' in data:
        kwargs['phonetic'] = data['phonetic']
    if 'meaning' in data:
        kwargs['meaning'] = data['meaning']
    if 'exampleSentence' in data:
        kwargs['example_sentence'] = data['exampleSentence']
    update_word(word_id, **kwargs)
    return jsonify({'ok': True})


@app.route('/api/admin/words/<int:word_id>', methods=['DELETE'])
def api_admin_delete_word(word_id):
    delete_word(word_id)
    return jsonify({'ok': True})


# ==================== Health ====================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


# ==================== 前端页面路由 ====================

@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/admin')
def serve_admin():
    return send_from_directory(FRONTEND_DIR, 'admin.html')

@app.route('/test_new.html')
def serve_test_new():
    return send_from_directory(FRONTEND_DIR, 'test_new.html')


# ==================== Run ====================

if __name__ == '__main__':
    init_db()
    cleaned = cleanup_expired_users()
    if cleaned:
        print(f'[CLEANUP] Removed {cleaned} users (90-day retention expired)')
    port = int(os.environ.get('PORT', 5050))
    print(f'[Story English Backend] Running on http://0.0.0.0:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
