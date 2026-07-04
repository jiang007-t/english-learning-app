"""Test all API endpoints and full workflow."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages'))
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

os.environ['FLASK_ENV'] = 'production'

from server import app
import json

with app.test_client() as client:
    # 1. Health
    resp = client.get('/health')
    print(f'[健康检查] {resp.status_code} {resp.get_json()}')

    # 2. Admin login
    resp = client.post('/api/admin/login', json={'password': 'yhw20001228'})
    assert resp.status_code == 200, f"Admin login failed: {resp.get_json()}"
    print(f'[管理员登录] {resp.status_code} OK')

    # 3. Create test user
    resp = client.post('/api/admin/users', json={
        'uid': 'test_full', 'password': '123456', 'name': '全流程测试',
        'age': 10, 'level': 'L2', 'totalDays': 30
    })
    print(f'[创建用户] {resp.status_code} {resp.get_json()}')

    # 4. User login
    resp = client.post('/api/login', json={'uid': 'test_full', 'password': '123456'})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    login_data = resp.get_json()
    print(f'[用户登录] {resp.status_code} uid={login_data["uid"]} level={login_data["level"]} expire={login_data["expireDate"]}')

    # 5. Dictionary lookup (no word added yet)
    resp = client.get('/api/dictionary/lookup?word=apple')
    print(f'[字典查询] {resp.status_code} {resp.get_json()}')

    # 6. Add a word to library
    resp = client.post('/api/admin/words', json={'word': 'apple', 'phonetic': '/ˈæp.əl/', 'meaning': '苹果'})
    print(f'[添加单词] {resp.status_code} {resp.get_json()}')

    # 7. Dictionary lookup again
    resp = client.get('/api/dictionary/lookup?word=apple')
    print(f'[字典查询2] {resp.status_code} {resp.get_json()}')

    # 8. Get words list
    resp = client.get('/api/admin/words')
    words = resp.get_json()
    print(f'[单词列表] {resp.status_code} count={len(words)}')

    # 9. Story generation
    print('\n[故事生成] 调用 DeepSeek API...')
    import time
    t0 = time.time()
    resp = client.post('/api/story/generate', json={
        'uid': 'test_full', 'words': ['brave', 'castle', 'dragon'],
        'type': 'adventure', 'level': 'L2'
    })
    elapsed = time.time() - t0
    data = resp.get_json()
    if resp.status_code == 200:
        print(f'[故事生成] 成功! 耗时={elapsed:.1f}s')
        print(f'  标题: {data.get("title")}')
        chapters = data.get('chapters', {})
        print(f'  章节数: {len(chapters)}')
        print(f'  章节: {list(chapters.keys())}')
        print(f'  目标单词: {data.get("words")}')
    else:
        print(f'[故事生成] 失败! 耗时={elapsed:.1f}s')
        print(f'  错误: {data.get("error")}')
        print(f'  详情: {data.get("detail")}')
        # Print debug log if available
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server_debug.log')
        if os.path.isfile(log_path):
            with open(log_path, 'r', encoding='utf-8') as f:
                print(f'  Debug log ({log_path}):')
                print(f'  {f.read()[-2000:]}')

    # 10. Story history
    resp = client.get('/api/story/history/test_full')
    stories = resp.get_json()
    print(f'\n[故事历史] {resp.status_code} count={len(stories)}')

    # 11. Story detail
    if stories:
        story_id = stories[0]['storyId']
        resp = client.get(f'/api/story/detail/test_full/{story_id}')
        print(f'[故事详情] {resp.status_code} OK' if resp.status_code == 200 else f'FAIL: {resp.get_json()}')

    # 12. Admin dashboard
    resp = client.get('/api/admin/dashboard')
    print(f'[管理面板] {resp.status_code} {resp.get_json()}')

    # 13. User stats
    resp = client.get('/api/admin/users/test_full/stats')
    print(f'[用户统计] {resp.status_code} OK')

    # 14. User trends
    resp = client.get('/api/admin/users/test_full/trends?period=week')
    trends = resp.get_json()
    print(f'[学习趋势] {resp.status_code} days={len(trends)}')

    # 15. Sync review
    resp = client.post('/api/sync/review', json={
        'uid': 'test_full', 'storyId': 'test', 'results': {'brave': True, 'castle': False}
    })
    print(f'[复习同步] {resp.status_code} {resp.get_json()}')

    # 16. User stats again (should show review data)
    resp = client.get('/api/admin/users/test_full/stats')
    stats = resp.get_json()
    print(f'[用户统计2] accuracy={stats.get("review_accuracy")}')

    # 17. Get all users
    resp = client.get('/api/admin/users')
    users = resp.get_json()
    print(f'[用户列表] count={len(users)}')

    print('\n========== 全流程测试完成 ==========')
