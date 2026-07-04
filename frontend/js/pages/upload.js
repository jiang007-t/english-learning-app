/* ============================================================
   upload.js — Story Games Library + Word Upload
   ============================================================ */

const STORY_GAMES = [
  { id:'adventure',  file:'adventure.html',  icon:'🏔️', name:'Jungle Quest',          nameCN:'探险',        desc:'Explore ancient ruins in the jungle!',        age:'6-16', color:'#2e7d32' },
  { id:'survival',   file:'survival.html',   icon:'🌴', name:'Island Survivors',       nameCN:'荒野求生',     desc:'Work together to survive on a tropical island!', age:'6-16', color:'#f57c00' },
  { id:'scifi',      file:'scifi.html',      icon:'🚀', name:'Space Explorers',        nameCN:'科幻',        desc:'Make contact with alien life among the stars!', age:'7-16', color:'#1565c0' },
  { id:'mystery',    file:'mystery.html',    icon:'🔍', name:'The Missing Blue Diamond',nameCN:'侦探推理',    desc:'Solve the mystery of the missing gem!',         age:'7-16', color:'#6a1b9a' },
  { id:'fairytale',  file:'fairytale.html',  icon:'🏰', name:'The Enchanted Castle',   nameCN:'童话城堡',     desc:'Break the spell with kindness and courage!',     age:'4-12', color:'#e91e63' },
  { id:'magicschool',file:'magicschool.html',icon:'🔮', name:'Spellcraft Academy',     nameCN:'魔法学院',     desc:'Win the Friendship Tournament at magic school!', age:'6-14', color:'#00838f' },
  { id:'animal',     file:'animal.html',     icon:'🐾', name:'Paws & Friends',         nameCN:'动物伙伴',     desc:'Save the animal shelter with love and teamwork!',age:'4-12', color:'#e65100' },
  { id:'school',     file:'school.html',     icon:'🏫', name:'The Friendship Project',  nameCN:'校园成长',     desc:'Build a Kindness Garden with your classmates!',  age:'6-14', color:'#37474f' },
];

let pendingWords = [];
let selectedType = null;
let photoWords = [];

router.register('upload', function render(main) {
  pendingWords = [];
  selectedType = null;
  photoWords = [];
  _renderUpload(main);
});

function _renderUpload(main) {
  const gameCards = STORY_GAMES.map(g => `
    <div class="game-card" style="--card-color:${g.color}" onclick="openGame('${g.file}')">
      <div class="game-card-icon">${g.icon}</div>
      <div class="game-card-info">
        <div class="game-card-title">${g.name}</div>
        <div class="game-card-namecn">${g.nameCN}</div>
        <div class="game-card-desc">${g.desc}</div>
        <div class="game-card-age">👶 Ages ${g.age}</div>
      </div>
    </div>
  `).join('');

  main.innerHTML = `
    <div class="page page-wide" style="max-width:720px">

      <!-- ===== SECTION: Play Story Games ===== -->
      <div class="card" style="padding:0;overflow:hidden;background:linear-gradient(135deg, #0f0c29, #1a1a4e, #24243e);margin-bottom:24px;border:1px solid rgba(255,215,0,0.25)">
        <div style="padding:24px 24px 12px;text-align:center">
          <h2 style="margin:0;color:#ffd700;font-size:1.5rem;letter-spacing:2px">🎮 Story Games</h2>
          <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin:4px 0 0">
            Choose a story. Make choices. Every decision changes your ending!
          </p>
        </div>
        <div class="game-grid">
          ${gameCards}
        </div>
      </div>

      <!-- ===== SECTION: Word Upload (secondary) ===== -->
      <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:16px">
        <h3 style="font-size:1rem;color:var(--text-light);margin:0 0 4px">📝 单词学习</h3>
        <p style="font-size:0.8rem;color:var(--text-light);margin:0 0 12px">
          手动输入或拍照上传你想学习的单词，AI 会为你生成专属故事
        </p>
      </div>

      <!-- Word input -->
      <div class="card">
        <div class="card-title">输入单词</div>

        <div style="display:flex;gap:10px;margin-bottom:12px">
          <button class="btn btn-outline" onclick="openCamera()" style="flex:1">
            📷 拍照识别
          </button>
          <button class="btn btn-outline" onclick="openGallery()" style="flex:1">
            🖼️ 从相册选择
          </button>
        </div>
        <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none" onchange="handlePhoto(event)">
        <input type="file" id="gallery-input" accept="image/*" style="display:none" onchange="handlePhoto(event)">

        <div id="photo-preview" style="display:none;text-align:center;margin-bottom:12px">
          <img id="photo-img" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)">
          <p style="font-size:0.8rem;color:var(--text-light);margin-top:4px">📸 已拍照 — 正在识别图片中的英文单词...</p>
        </div>

        <div class="form-group">
          <label>手动输入（用逗号或空格分隔）</label>
          <textarea id="word-input" class="input" rows="3" placeholder="例如: brave, castle, bridge, forest, key, river"></textarea>
        </div>
        <button class="btn btn-block" onclick="addWords()">添加单词</button>
        <div id="word-tags" class="tag-list"></div>
      </div>

      <!-- Story type selection + Generate -->
      <div class="card" id="type-card" style="display:none">
        <div class="card-title">选择故事类型</div>
        <div class="type-grid" id="type-grid"></div>
      </div>

      <button id="generate-btn" class="btn btn-lg btn-block" disabled onclick="startStory()" style="display:none">
        ✨ 生成故事
      </button>
      <p id="generate-hint" style="font-size:0.85rem;color:var(--text-light);text-align:center;margin-top:8px"></p>
    </div>
  `;
}

// ---- Open game in new tab ----
function openGame(file) {
  window.open('text_games/' + file, '_blank');
}

// ---- Camera / Photo ----
function openCamera() {
  const input = document.getElementById('photo-input');
  input.click();
}

function openGallery() {
  const input = document.getElementById('gallery-input');
  input.click();
}

let _ocrRunning = false;

function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const preview = document.getElementById('photo-preview');
  const img = document.getElementById('photo-img');
  const reader = new FileReader();
  reader.onload = async (e) => {
    img.src = e.target.result;
    preview.style.display = 'block';
    await runOCR(e.target.result);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function runOCR(imageDataUrl) {
  if (_ocrRunning) return;

  if (typeof Tesseract === 'undefined') {
    toast('加载 OCR 引擎中...', 'info');
    try {
      await loadTesseract();
    } catch (e) {
      toast('OCR引擎加载失败，请手动输入单词', 'error');
      return;
    }
  }

  _ocrRunning = true;
  toast('🔍 正在识别图片中的文字...', 'info');

  try {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          const hint = document.getElementById('generate-hint');
          if (hint) hint.textContent = 'OCR 识别中: ' + pct + '%';
        }
      }
    });

    const text = result.data.text;
    if (!text.trim()) {
      toast('未识别到文字，请手动输入', 'error');
      _ocrRunning = false;
      return;
    }

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

    if (unique.length === 0) {
      toast('未识别到英文单词，请手动输入', 'error');
      _ocrRunning = false;
      return;
    }

    const input = document.getElementById('word-input');
    input.value = unique.join(', ');
    const hint = document.getElementById('generate-hint');
    if (hint) hint.textContent = 'OCR 识别到 ' + unique.length + ' 个单词，点击"添加单词"使用';

    toast('OCR 识别完成！找到 ' + unique.length + ' 个单词', 'success');
  } catch (e) {
    toast('OCR识别失败: ' + e.message, 'error');
    console.error('OCR error:', e);
  }

  _ocrRunning = false;
}

// ---- Add words ----
function addWords() {
  const input = document.getElementById('word-input');
  const raw = input.value.trim();
  if (!raw) { toast('请输入单词', 'error'); return; }

  const words = raw.split(/[,\s\n]+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z][a-z-]*$/.test(w) && w.length > 0);
  if (words.length === 0) { toast('没有有效的英文单词', 'error'); return; }

  const existing = new Set(pendingWords);
  for (const w of words) {
    if (!existing.has(w)) { pendingWords.push(w); existing.add(w); }
  }

  _renderTags();
  input.value = '';
  _checkReady();
  if (words.length > 0) toast(`已添加 ${words.length} 个单词`, 'success');
}

function removeWord(idx) {
  pendingWords.splice(idx, 1);
  _renderTags();
  _checkReady();
}

function _renderTags() {
  const el = document.getElementById('word-tags');
  if (!el) return;
  if (pendingWords.length === 0) {
    el.innerHTML = '<span style="color:var(--text-light);font-size:0.85rem">暂无单词</span>';
    return;
  }
  el.innerHTML = pendingWords.map((w, i) =>
    `<span class="tag">${w} <span class="remove" onclick="removeWord(${i})">×</span></span>`
  ).join('');
  el.innerHTML += `<span style="color:var(--text-light);font-size:0.8rem;margin-left:8px">共 ${pendingWords.length} 个单词</span>`;
}

function selectType(id) {
  selectedType = id;
  document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected'));
  const card = document.querySelector(`.type-card[data-type="${id}"]`);
  if (card) card.classList.add('selected');
  _checkReady();
}

function _checkReady() {
  const btn = document.getElementById('generate-btn');
  const hint = document.getElementById('generate-hint');
  if (!btn) return;
  if (pendingWords.length < 3) {
    btn.disabled = true;
    hint.textContent = '至少需要 3 个单词才能生成故事';
  } else if (!selectedType) {
    btn.disabled = true;
    hint.textContent = '请选择一个故事类型';
  } else {
    btn.disabled = false;
    hint.textContent = `准备好啦！${pendingWords.length} 个单词`;
  }
}

// ---- Start story ----
async function startStory() {
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.textContent = '故事生成中...';

  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'story-loading';
  overlay.innerHTML = `
    <div class="spinner"></div>
    <p>📖 AI 正在创作你的冒险故事...</p>
    <p style="font-size:0.8rem;color:var(--text-light);margin-top:4px">这需要几秒钟</p>
  `;
  document.body.appendChild(overlay);

  try {
    const data = await api('POST', '/api/story/generate', {
      uid: state.user.uid,
      level: state.user.level || 'L2',
      type: selectedType,
      words: pendingWords,
    });

    // Validate the response has actual chapters
    if (!data.chapters || !data.chapters.start) {
      overlay.remove();
      btn.disabled = false;
      btn.textContent = '✏️ 生成故事';
      console.error('Invalid story data:', data);
      toast('生成的故事数据不完整，请重试', 'error');
      return;
    }

    state._gameData = data;
    state.chapters = [];
    state.choiceLog = [];
    state.vocabBook = state.vocabBook || [];

    overlay.remove();
    router.go('story');
  } catch (e) {
    overlay.remove();
    btn.disabled = false;
    btn.textContent = '✏️ 生成故事';
    toast('生成失败：' + e.message, 'error');
  }
}

/** Dynamically load Tesseract.js from CDN */
function loadTesseract() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => { setTimeout(resolve, 500); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
