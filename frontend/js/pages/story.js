/* ============================================================
   story.js — Branching Tree Game Engine
   Renders a complete branching story tree from the server.
   Uses event delegation for all click handling (no inline onclick).
   ============================================================ */

// ---- Game state ----
let _game = null;        // The loaded game tree
let _currentId = 'start'; // Current chapter ID
let _visited = [];       // Path history (for go back)
let _gameWords = [];     // All target words used


router.register('story', function render(main) {
  _game = state._gameData;
  if (!_game || !_game.chapters || !_game.chapters.start) {
    main.innerHTML = `<div class="page page-center">
      <h2>故事数据不完整</h2>
      <p style="margin:12px 0;color:var(--text-light)">故事生成可能未完成，请重新尝试</p>
      <button class="btn" data-action="goto-upload">返回重试</button>
    </div>`;
    return;
  }

  // Reset game state
  _currentId = 'start';
  _visited = ['start'];
  _gameWords = _game.words || _game.allWords || [];

  _renderChapter(main, 'start');
});


// ============================================
// Render a chapter by ID
// ============================================
function _renderChapter(main, chapterId) {
  const ch = _game.chapters[chapterId];
  if (!ch) {
    // Fallback: find the last visited chapter
    const backId = _visited.length > 1 ? _visited[_visited.length - 2] : 'start';
    if (backId !== chapterId && _game.chapters[backId]) {
      main.innerHTML = `<div class="page page-center">
        <h2>这个分支还在创作中...</h2>
        <p style="margin:16px 0;color:var(--text-light)">回到之前的选择重新探索吧</p>
        <button class="btn" data-action="goto-chapter" data-chapter="${backId}">← 返回上一节</button>
      </div>`;
      return;
    }
    main.innerHTML = `<div class="page page-center"><h2>章节未找到</h2></div>`;
    return;
  }

  // If ending node, show ending screen
  if (ch.e) {
    _renderEnding(main, ch);
    return;
  }

  const chapterNum = _visited.length;
  const choices = ch.choices || [];

  main.innerHTML = `
    <div class="page page-wide" style="max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2 class="page-title" style="margin-bottom:0;font-size:1.15rem">${_game.title}</h2>
        <div style="display:flex;gap:8px">
          ${_visited.length > 1 ? `<button class="btn-sm btn-ghost" data-action="go-back" title="上一步">← 返回</button>` : ''}
          <button class="btn-sm btn-ghost" data-action="exit-game" title="退出故事">✕ 退出</button>
        </div>
      </div>
      <div class="top-bar">
        <span class="badge">Chapter ${chapterNum}</span>
        <span class="step">Path: ${chapterNum} step${chapterNum > 1 ? 's' : ''}</span>
      </div>

      <div class="chapter-title">${ch.title || ''}</div>

      <div class="card" id="story-card">
        <div id="story-text" class="story-text">
          ${renderStoryText(ch.text)}
        </div>
      </div>

      <div class="choices-label">— Make Your Choice —</div>
      <div id="story-choices" class="story-choices">
        ${choices.map((c, i) => `
          <button class="btn-choice" data-action="make-choice" data-next="${c.n}" data-text="${_escapeAttr(c.t)}">
            <span class="choice-num">${i + 1}</span>
            <span>${_escapeHtml(c.t)}</span>
          </button>
        `).join('')}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="card-title" style="margin-bottom:6px">📝 我的生词本</div>
        <div id="vocab-tags" class="tag-list">
          ${state.vocabBook.length === 0
            ? '<span style="color:var(--text-light);font-size:0.85rem">点击任意单词可查看释义和发音</span>'
            : state.vocabBook.map(w => `<span class="tag tag-ok">${w}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}


// ============================================
// Render ending screen
// ============================================
function _renderEnding(main, ch) {
  const chapterNum = _visited.length;

  main.innerHTML = `
    <div class="page page-wide" style="max-width:640px">
      <div class="top-bar">
        <span class="badge">Chapter ${chapterNum}</span>
        <span class="step">Path: ${chapterNum} steps</span>
      </div>

      <div class="ending-screen">
        <div class="ending-badge" style="background:${ch.bbg};color:#1a1a2e">
          ${ch.badge || 'Ending'}
        </div>
        <div class="ending-title">${ch.title || 'The End'}</div>
        <div class="ending-text">${renderStoryText(ch.text)}</div>
        <div class="ending-tip">${ch.tip || ''}</div>
        <br>
        <button class="btn btn-lg" data-action="finish-game">
          📝 复习单词
        </button>
        &nbsp;&nbsp;
        <button class="btn btn-lg btn-outline" data-action="exit-game">
          🏠 返回主页
        </button>
      </div>

      <div class="card" style="margin-top:12px">
        <div class="card-title" style="margin-bottom:6px">📝 我的生词本</div>
        <div id="vocab-tags" class="tag-list">
          ${state.vocabBook.length === 0
            ? '<span style="color:var(--text-light);font-size:0.85rem">点击任意单词可查看释义和发音</span>'
            : state.vocabBook.map(w => `<span class="tag tag-ok">${w}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}


// ============================================
// Event Delegation — all clicks go through here
// ============================================
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.getAttribute('data-action');

  switch (action) {

    case 'make-choice': {
      const nextId = btn.getAttribute('data-next');
      const choiceText = btn.getAttribute('data-text');
      state.choiceLog.push({
        chapterId: _currentId,
        choiceText: choiceText,
        nextChapterId: nextId,
      });
      _currentId = nextId;
      _visited.push(nextId);
      const main = document.getElementById('main-content');
      _renderChapter(main, nextId);
      break;
    }

    case 'go-back': {
      if (_visited.length <= 1) break;
      _visited.pop();
      const prevId = _visited[_visited.length - 1];
      _currentId = prevId;
      state.choiceLog.pop();
      const main = document.getElementById('main-content');
      _renderChapter(main, prevId);
      break;
    }

    case 'exit-game': {
      if (!confirm('确认退出当前故事？进度将丢失。')) break;
      state._gameData = null;
      _game = null;
      router.go('home');
      break;
    }

    case 'finish-game': {
      state.chapters = _visited.map(id => _game.chapters[id]).filter(Boolean);
      state.currentChapter = _game.chapters[_currentId];
      state.story = _game;
      saveStoryHistory();
      router.go('timeline');
      break;
    }

    case 'goto-chapter': {
      const chId = btn.getAttribute('data-chapter');
      const main = document.getElementById('main-content');
      _renderChapter(main, chId);
      break;
    }

    case 'goto-upload': {
      router.go('upload');
      break;
    }
  }
});


// ============================================
// Helpers for escaping HTML/attribute content
// ============================================
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttr(str) {
  // Escape for HTML attribute values (double-quoted)
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
