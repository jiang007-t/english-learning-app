/* ============================================================
   login.js — Login Page (connected to backend)
   ============================================================ */

router.register('login', function render(main) {
  main.innerHTML = `
    <div class="page page-center" style="min-height:80vh">
      <div class="card" style="max-width:380px;width:100%;padding:32px">
        <h1 class="page-title" style="text-align:center">📖 故事英语</h1>
        <p class="page-subtitle" style="text-align:center">在冒险故事中学会英语单词</p>
        <div class="form-group">
          <label>UID</label>
          <input id="login-uid" class="input" type="text" placeholder="输入你的 UID" autocomplete="off">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input id="login-pwd" class="input" type="password" placeholder="输入密码" autocomplete="off">
        </div>
        <button id="login-btn" class="btn btn-block btn-lg" onclick="handleLogin()">登录</button>
        <p id="login-error" style="color:#e74c3c;font-size:0.85rem;margin-top:12px;display:none"></p>
        <p style="font-size:0.8rem;color:var(--text-light);text-align:center;margin-top:16px">
          没有账号？请联系管理员开通
        </p>
        <p style="font-size:0.8rem;color:var(--text-light);text-align:center;margin-top:4px">
          管理员微信：jiang-xue-zhang
        </p>
      </div>
    </div>
  `;
  document.getElementById('login-uid').focus();
  document.getElementById('login-pwd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

async function handleLogin() {
  const uid = document.getElementById('login-uid').value.trim();
  const pwd = document.getElementById('login-pwd').value.trim();
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!uid || !pwd) {
    errEl.textContent = '请输入 UID 和密码';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '登录中...';

  try {
    const data = await api('POST', '/api/login', { uid, password: pwd });
    state.user = data;
    safeSet('story_user', JSON.stringify(state.user));
    toast('登录成功！', 'success');
    router.go('home');
  } catch (e) {
    errEl.textContent = e.message || '登录失败，请检查账号状态';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
}
