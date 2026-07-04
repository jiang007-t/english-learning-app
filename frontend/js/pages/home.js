/* ============================================================
   home.js — Home Dashboard
   ============================================================ */

const STORY_TYPES = [
  { id:'adventure',  icon:'🏔️', name:'Adventure',          nameCN:'探险' },
  { id:'survival',   icon:'🌴', name:'Survival',            nameCN:'荒野求生' },
  { id:'scifi',      icon:'🚀', name:'Sci-Fi',              nameCN:'科幻' },
  { id:'mystery',    icon:'🔍', name:'Mystery',             nameCN:'侦探推理' },
  { id:'fairytale',  icon:'🏰', name:'Fairy Tale',          nameCN:'童话城堡' },
  { id:'magicschool',icon:'🔮', name:'Magic School',        nameCN:'魔法学院' },
  { id:'animal',     icon:'🐾', name:'Animal Friends',      nameCN:'动物伙伴' },
  { id:'school',     icon:'🏫', name:'School Growth',       nameCN:'校园成长' },
];

let _pendingWords = [];
let _selectedType = null;

router.register('home', function render(main) {
  _pendingWords = [];
  _selectedType = null;
  loadStoryHistory();
  _renderHome(main);
});

function _renderHome(main) {
  const u = state.user;
  const history = state.storyHistory || [];

  // ---- Calculate stats ----
  const totalStories = history.length;
  const totalWords = [...new Set(history.flatMap(h => h.words || []))].length;
  const totalVocab = [...new Set(history.flatMap(h => h.vocabBook || []))].length;

  // Calculate average accuracy
  let totalCorrect = 0, totalReviewed = 0;
  for (const h of history) {
    if (h.reviewAccuracy) {
      totalCorrect += h.reviewAccuracy.correct || 0;
      totalReviewed += h.reviewAccuracy.total || 0;
    }
  }
  const avgAccuracy = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : null;

  // Type selection buttons
  const typeBtns = STORY_TYPES.map(t => `
    <div class="type-card ${_selectedType === t.id ? 'selected' : ''}"
         data-type="${t.id}" onclick="selectHomeType('${t.id}')">
      <div style="font-size:1.5rem">${t.icon}</div>
      <div style="font-size:0.75rem;margin-top:2px">${t.name}</div>
      <div style="font-size:0.6rem;color:var(--text-light)">${t.nameCN}</div>
    </div>
  `).join('');

  main.innerHTML = `
    <div class="page page-wide" style="max-width:640px">

      <!-- ===== Header ===== -->
      <h2 class="page-title">👋 你好，${u.name || u.uid}！</h2>
      <p class="page-subtitle">输入你想学习的单词，生成专属互动故事</p>

      <!-- ===== SECTION 1: Word Input + Story Type + Generate ===== -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div class="card-title">📝 输入单词</div>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <button class="btn btn-outline" onclick="openHomeCamera()" style="flex:1;font-size:0.8rem">📷 拍照识别</button>
          <button class="btn btn-outline" onclick="openHomeGallery()" style="flex:1;font-size:0.8rem">🖼️ 从相册选择</button>
        </div>
        <input type="file" id="home-photo-input" accept="image/*" capture="environment" style="display:none" onchange="handleHomePhoto(event)">
        <input type="file" id="home-gallery-input" accept="image/*" style="display:none" onchange="handleHomePhoto(event)">

        <div id="home-photo-preview" style="display:none;text-align:center;margin-bottom:10px">
          <img id="home-photo-img" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border)">
          <p style="font-size:0.78rem;color:var(--text-light);margin-top:4px">📸 识别图片中的英文单词...</p>
        </div>

        <textarea id="home-word-input" class="input" rows="2" placeholder="手动输入单词，用逗号或空格分隔，例如: brave, castle, bridge, forest" style="margin-bottom:10px"></textarea>

        <div style="display:flex;gap:8px">
          <button class="btn" onclick="addHomeWords()" style="flex:1">➕ 添加单词</button>
        </div>
        <div id="home-word-tags" class="tag-list" style="margin-top:8px;min-height:28px">
          <span style="color:var(--text-light);font-size:0.8rem">暂无单词</span>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
          <div class="card-title" style="margin-bottom:8px">🎭 选择故事类型</div>
          <div class="type-grid" style="grid-template-columns:repeat(4,1fr);gap:8px">${typeBtns}</div>
        </div>

        <button id="home-generate-btn" class="btn btn-lg btn-block" disabled onclick="startHomeStory()" style="margin-top:12px">
          ✨ 生成故事
        </button>
        <p id="home-generate-hint" style="font-size:0.8rem;color:var(--text-light);text-align:center;margin-top:6px">至少添加 3 个单词</p>
      </div>

      <!-- ===== SECTION 2: Quick stats ===== -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div class="card-title">📊 学习统计</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center">
          <div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--primary)">${totalStories}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">已完成<br>故事</div>
          </div>
          <div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--success)">${totalWords}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">已学<br>目标单词</div>
          </div>
          <div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--accent)">${totalVocab}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">查询<br>生词</div>
          </div>
          <div>
            <div style="font-size:1.3rem;font-weight:700;color:#ffd700">${avgAccuracy !== null ? avgAccuracy + '%' : '--'}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">单词复习<br>正确率</div>
          </div>
        </div>
      </div>

      <!-- ===== SECTION 3: Pre-written story games (compact) ===== -->
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div class="card-title">🎮 经典互动故事</div>
        <p style="font-size:0.78rem;color:var(--text-light);margin:-4px 0 10px">点击即玩，无需输入单词</p>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
          ${STORY_TYPES.map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);transition:all 0.2s"
                 onmouseover="this.style.borderColor='rgba(255,215,0,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'"
                 onclick="openClassicGame('${t.id}')">
              <span style="font-size:1.4rem">${t.icon}</span>
              <div>
                <div style="font-size:0.78rem;font-weight:600;color:#fff">${t.name}</div>
                <div style="font-size:0.65rem;color:var(--text-light)">${t.nameCN}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${state.user.isAdmin ? `
      <!-- ===== ADMIN SECTION ===== -->
      <div class="card" style="padding:20px;margin-bottom:16px;border:2px solid #f59e0b">
        <div class="card-title" style="color:#f59e0b">🔐 管理面板</div>
        <p style="font-size:0.78rem;color:var(--text-light);margin:-4px 0 10px">管理员专属功能</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="admin-mini-btn" onclick="window.open('admin.html','_blank')">
            <div style="font-size:1.5rem">👥</div>
            <div style="font-size:0.72rem">用户管理</div>
          </div>
          <div class="admin-mini-btn" onclick="window.open('admin.html#stats','_blank')">
            <div style="font-size:1.5rem">📊</div>
            <div style="font-size:0.72rem">统计看板</div>
          </div>
          <div class="admin-mini-btn" onclick="window.open('admin.html#words','_blank')">
            <div style="font-size:1.5rem">📖</div>
            <div style="font-size:0.72rem">单词库</div>
          </div>
        </div>
      </div>
      ` : ''}
      <div style="text-align:center;padding:4px 0 16px">
        <button class="btn btn-ghost" onclick="router.go('history')" style="font-size:0.85rem">
          📜 查看故事历史 ${history.length > 0 ? `(${history.length})` : ''}
        </button>
      </div>
    </div>
  `;
}

// ---- Word input ----
function addHomeWords() {
  const input = document.getElementById('home-word-input');
  const raw = input.value.trim();
  if (!raw) { toast('请输入单词', 'error'); return; }

  const words = raw.split(/[,\s\n]+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z][a-z-]*$/.test(w) && w.length > 0);
  if (words.length === 0) { toast('没有有效的英文单词', 'error'); return; }

  const existing = new Set(_pendingWords);
  for (const w of words) {
    if (!existing.has(w)) { _pendingWords.push(w); existing.add(w); }
  }

  _renderHomeTags();
  input.value = '';
  _checkHomeReady();
  if (words.length > 0) toast(`已添加 ${words.length} 个单词`, 'success');
}

function removeHomeWord(idx) {
  _pendingWords.splice(idx, 1);
  _renderHomeTags();
  _checkHomeReady();
}

function _renderHomeTags() {
  const el = document.getElementById('home-word-tags');
  if (!el) return;
  if (_pendingWords.length === 0) {
    el.innerHTML = '<span style="color:var(--text-light);font-size:0.8rem">暂无单词</span>';
    return;
  }
  el.innerHTML = _pendingWords.map((w, i) =>
    `<span class="tag">${w} <span class="remove" onclick="removeHomeWord(${i})">×</span></span>`
  ).join('');
  el.innerHTML += `<span style="color:var(--text-light);font-size:0.75rem;margin-left:6px">共 ${_pendingWords.length} 个单词</span>`;
}

function selectHomeType(id) {
  _selectedType = id;
  document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected'));
  const card = document.querySelector(`.type-card[data-type="${id}"]`);
  if (card) card.classList.add('selected');
  _checkHomeReady();
}

function _checkHomeReady() {
  const btn = document.getElementById('home-generate-btn');
  const hint = document.getElementById('home-generate-hint');
  if (!btn) return;
  if (_pendingWords.length < 3) {
    btn.disabled = true;
    hint.textContent = '至少需要 3 个单词才能生成故事';
  } else if (!_selectedType) {
    btn.disabled = true;
    hint.textContent = '请选择一个故事类型';
  } else {
    btn.disabled = false;
    hint.textContent = `✅ ${_pendingWords.length} 个单词 · ${STORY_TYPES.find(t => t.id === _selectedType)?.nameCN || _selectedType}`;
  }
}

// ---- Generate story from home ----
async function startHomeStory() {
  const btn = document.getElementById('home-generate-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 故事生成中...';

  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'home-story-loading';
  overlay.innerHTML = '<div class="spinner"></div><p>📖 AI 正在创作你的冒险故事...</p>';
  document.body.appendChild(overlay);

  try {
    const data = await api('POST', '/api/story/generate', {
      uid: state.user.uid,
      level: state.user.level || 'L2',
      type: _selectedType,
      words: _pendingWords,
    });

    state._gameData = data;
    state.chapters = [];
    state.choiceLog = [];
    state.vocabBook = state.vocabBook || [];
    state.reviewAccuracy = null;

    overlay.remove();
    router.go('story');
  } catch (e) {
    overlay.remove();
    btn.disabled = false;
    btn.textContent = '✏️ 生成故事';
    toast('生成失败：' + e.message, 'error');
  }
}

// ---- Classic pre-written games ----
function openClassicGame(typeId) {
  const map = {
    adventure:'adventure.html', survival:'survival.html', scifi:'scifi.html',
    mystery:'mystery.html', fairytale:'fairytale.html', magicschool:'magicschool.html',
    animal:'animal.html', school:'school.html'
  };
  window.open('text_games/' + (map[typeId] || typeId + '.html'), '_blank');
}

// ---- OCR helpers (reuse from upload.js) ----
function openHomeCamera() {
  document.getElementById('home-photo-input').click();
}
function openHomeGallery() {
  document.getElementById('home-gallery-input').click();
}
function handleHomePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById('home-photo-preview');
  const img = document.getElementById('home-photo-img');
  const reader = new FileReader();
  reader.onload = async (e) => {
    img.src = e.target.result;
    preview.style.display = 'block';
    await runHomeOCR(e.target.result);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function runHomeOCR(imageDataUrl) {
  if (typeof Tesseract === 'undefined') {
    toast('加载 OCR 引擎中...', 'info');
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => { setTimeout(resolve, 1500); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch (e) {
      toast('OCR引擎加载失败，请手动输入', 'error');
      return;
    }
  }

  const hint = document.getElementById('home-generate-hint');
  if (hint) hint.textContent = '🔍 正在识别图片中的文字...';

  try {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && hint) {
          hint.textContent = 'OCR 识别中: ' + Math.round(m.progress * 100) + '%';
        }
      }
    });

    const text = result.data.text;
    if (!text.trim()) { toast('未识别到文字', 'error'); return; }

    // Strategy 1: Line-by-line — first English word per line (works for vocab lists: "hero /ˈhɪroʊ/ 英雄")
    let candidates = [];
    if (result.data.lines && result.data.lines.length > 0) {
      for (const line of result.data.lines) {
        const m = line.text.match(/\b([a-zA-Z]{3,})\b/);
        if (m) candidates.push(m[1]);
      }
    }

    // Strategy 2: Fallback to full-text regex if line approach barely found anything
    if (candidates.length < 3) {
      candidates = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
    }

    // Filter: dictionary words pass through; others need >= 4 chars AND a vowel
    const filtered = candidates.filter(w => {
      const lower = w.toLowerCase();
      if (MEANINGS[lower] !== undefined) return true;
      return w.length >= 4 && /[aeiouy]/i.test(w);
    });

    const unique = [...new Set(filtered.map(w => w.toLowerCase()))];
    if (unique.length === 0) { toast('未识别到英文单词', 'error'); return; }

    const input = document.getElementById('home-word-input');
    if (input) input.value = unique.join(', ');
    if (hint) hint.textContent = 'OCR 识别到 ' + unique.length + ' 个单词，点击"添加单词"使用';
    toast('OCR 识别完成！找到 ' + unique.length + ' 个单词', 'success');
  } catch (e) {
    toast('OCR失败: ' + e.message, 'error');
  }
}
