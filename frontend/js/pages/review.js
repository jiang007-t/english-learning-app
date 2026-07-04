/* ============================================================
   review.js — Story Timeline + Review + History Pages
   ============================================================ */

// ============================================
// ROUTE: timeline — Show full story with choices
// ============================================
router.register('timeline', function render(main) {
  const story = state.story;
  const chapters = state.chapters;
  const choiceLog = state.choiceLog;

  if (!story || chapters.length === 0) {
    router.go('home');
    return;
  }

  // Build choice map: chapterId -> choice made
  const choiceMap = {};
  for (const c of choiceLog) {
    choiceMap[c.chapterId] = c;
  }

  // Build timeline steps: each step is a chapter + the choice that led TO it
  const timelineSteps = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const isEnding = ch.e;
    const stepNum = i + 1;
    // The choice that was made AT this chapter (to go to the next)
    const choiceOut = ch.id ? choiceMap[ch.id] : null;
    // The chapter title
    const title = ch.title || 'Chapter ' + stepNum;
    timelineSteps.push({ ch, isEnding, stepNum, choiceOut, title });
  }

  main.innerHTML = `
    <div class="page page-wide" style="max-width:680px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 class="page-title" style="margin-bottom:0">🎉 冒险结束！</h2>
        <button class="btn-sm btn-ghost" onclick="finishStory()">✕ 关闭</button>
      </div>
      <p class="page-subtitle" style="margin-bottom:16px">"${story.title}" — ${chapters.length} 章 · ${story.words ? story.words.length : 0} 个目标单词</p>

      <div class="card" style="padding:16px 0;overflow:hidden">
        <div style="padding:0 20px 12px;border-bottom:1px solid var(--border);margin-bottom:8px">
          <strong>📖 你的完整故事时间线</strong>
        </div>

        ${timelineSteps.map((step, idx) => {
          const { ch, isEnding, stepNum, choiceOut, title } = step;
          return `
            <div class="timeline-chapter">
              <div class="timeline-dot ${isEnding ? 'dot-end' : ''}">
                ${isEnding ? '🏁' : stepNum}
              </div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <strong style="color:${isEnding ? 'var(--secondary)' : 'var(--text)'}">
                    ${isEnding ? '🏆 ' : ''}${title}
                  </strong>
                  ${idx > 0 ? `<span class="timeline-choice">← ${choiceOut ? '"' + choiceOut.choiceText + '"' : '开始'}</span>` : ''}
                  ${isEnding ? '<span class="tag tag-ok" style="margin-left:8px">结局</span>' : ''}
                </div>
                <div class="timeline-text" style="font-size:0.85rem;color:var(--text-light);line-height:1.7">
                  ${renderStoryText(ch.text ? ch.text.slice(0, 120) + (ch.text.length > 120 ? '...' : '') : '')}
                </div>
                ${!isEnding && ch.choices ? `
                  <div class="timeline-options" style="margin-top:6px">
                    <span style="font-size:0.75rem;color:var(--text-light);margin-right:6px">选择: </span>
                    ${ch.choices.map(c => `
                      <span class="tag ${choiceOut && choiceOut.choiceText === c.t ? 'tag-ok' : ''}">
                        ${choiceOut && choiceOut.choiceText === c.t ? '✓ ' : ''}${c.t}
                      </span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Vocab summary -->
      ${state.vocabBook.length > 0 ? `
        <div class="card">
          <div class="card-title">📝 阅读中查询过的生词</div>
          <div class="tag-list">
            ${state.vocabBook.map(w => {
              const m = getMeaning(w);
              return `<span class="tag tag-ok">${w} ${m}</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Target word review -->
      <div class="card" style="background:linear-gradient(135deg,rgba(255,215,0,0.05),rgba(255,215,0,0.02));border:1px solid rgba(255,215,0,0.15)">
        <div class="card-title" style="color:var(--secondary)">🎯 目标单词复习</div>
        <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px">
          故事中包含了 <strong>${story.words ? story.words.length : 0}</strong> 个目标单词，现在来检测你记住了多少！
        </p>
        ${story.words && story.words.length > 0 ? `
          <div class="tag-list" style="margin-bottom:12px">
            ${story.words.map(w => {
              const correct = state._reviewWordResults && state._reviewWordResults[w];
              var cls = 'tag';
              if (correct === true) cls = 'tag tag-ok';
              else if (correct === false) cls = 'tag tag-wrong';
              return `<span class="${cls}">${w} ${_optionDisplay(w)}</span>`;
            }).join('')}
          </div>
        ` : ''}
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-lg" style="flex:1;min-width:150px" onclick="router.go('review')">
            📝 开始复习
          </button>
          <button class="btn btn-lg btn-outline" style="flex:1;min-width:150px" onclick="finishStory()">
            🏠 返回主页
          </button>
        </div>
      </div>
    </div>
  `;
});

// ---- Toggle history detail expand/collapse ----
function toggleHistoryDetail(id) {
  var el = document.getElementById('ai-detail-' + id.replace('ai-', ''));
  if (!el) el = document.getElementById('detail-' + id);
  if (el) {
    if (el.style.display === 'none' || el.style.display === '') {
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }
}

// ---- Timeline / AI Story review entry point ----

function finishStory() {
  // Save story history before clearing
  saveStoryHistory();
  state.story = null;
  state.chapters = [];
  state.currentChapter = null;
  state.choiceLog = [];
  router.go('home');
}


// Pool of all Chinese meanings from dictionary (for generating wrong answer options)
var _allChineseMeanings = (function() {
  var seen = {};
  var result = [];
  for (var key in MEANINGS) {
    var val = MEANINGS[key];
    if (val && !seen[val]) {
      seen[val] = true;
      result.push(val);
    }
  }
  return result;
})();

// Get display text for a review option — always Chinese characters only
function _optionDisplay(word) {
  var m = getMeaning(word);
  if (m && !m.startsWith('（暂无释义')) return m;
  return '\uff08\u65e0\u8bcd\u4e49\uff09'; // （无词义）— fallback when word is not in dictionary
}

// ============================================
// ROUTE: review — Word review quiz
// ============================================
router.register('review', function render(main) {
  const story = state.story;
  const words = story ? story.words : [];

  if (!words || words.length === 0) {
    main.innerHTML = `
      <div class="page page-center">
        <h2>没有需要复习的单词</h2>
        <button class="btn" onclick="router.go('home')">返回主页</button>
      </div>
    `;
    return;
  }

  // 使用所有上传的单词，不跳过任何单词
  var wordsWithMeanings = words.slice();
  if (wordsWithMeanings.length === 0) {
    main.innerHTML = `
      <div class="page page-center">
        <h2>暂无需要复习的单词</h2>
        <button class="btn" onclick="router.go('home')">返回主页</button>
      </div>
    `;
    return;
  }
  state._reviewWords = wordsWithMeanings.slice().sort(function() { return 0.5 - Math.random(); });
  state._reviewIdx = 0;
  state._reviewCorrect = 0;
  _renderReviewQuestion(main);
});

// 缓存从后端获取的单词释义
var _reviewBackendMeanings = {};

function _ensureMeaning(word, callback) {
  var m = getMeaning(word);
  if (m && !m.startsWith('（暂无释义')) {
    callback(m);
    return;
  }
  // 尝试从后端字典查询
  if (_reviewBackendMeanings[word]) {
    callback(_reviewBackendMeanings[word]);
    return;
  }

  var triedBackend = false;

  function tryBackend() {
    if (triedBackend) return;
    triedBackend = true;
    fetch(API_BASE + '/api/dictionary/lookup?word=' + encodeURIComponent(word))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.meaning) {
          _reviewBackendMeanings[word] = data.meaning;
          callback(data.meaning);
        } else {
          tryMyMemory();
        }
      })
      .catch(function() {
        tryMyMemory();
      });
  }

  function tryMyMemory() {
    fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en|zh-CN')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var translated = '';
        if (data && data.responseData && data.responseData.translatedText) {
          translated = data.responseData.translatedText;
          if (translated.toLowerCase().replace(/[^a-z]/g, '') === word.toLowerCase()) {
            translated = '';
          }
        }
        if (translated) {
          _reviewBackendMeanings[word] = translated;
          callback(translated);
        } else {
          callback(word);
        }
      })
      .catch(function() {
        callback(word);
      });
  }

  tryBackend();
}

function _renderReviewQuestion(main) {
  const words = state._reviewWords;
  const idx = state._reviewIdx;

  if (idx >= words.length) {
    _renderReviewComplete(main, words);
    return;
  }

  const word = words[idx];
  main.innerHTML = `
    <div class="page page-wide" style="max-width:480px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="page-title" style="margin-bottom:0">📝 复习单词</h2>
        <button class="btn-sm btn-ghost" onclick="finishStory()">✕ 跳过</button>
      </div>
      <p class="page-subtitle">第 ${idx + 1}/${words.length} 个</p>

      <div class="card">
        <div class="review-question">
          选出 "<strong>${word}</strong>" 的中文意思：
        </div>
        <div id="review-opts" class="review-options">
          <div style="text-align:center;padding:16px;color:var(--text-light)">加载中...</div>
        </div>
        <p id="review-feedback" style="font-size:0.9rem;margin-top:12px;min-height:24px"></p>
        <button id="review-next-btn" class="btn btn-block" style="display:none" onclick="nextReview()">
          下一题 →
        </button>
      </div>

      <div style="text-align:center;font-size:0.85rem;color:var(--text-light);margin-top:8px">
        正确: ${state._reviewCorrect} · 剩余: ${words.length - idx - 1}
      </div>
    </div>
  `;

  // 异步获取释义后渲染选项
  _ensureMeaning(word, function(correctDisplay) {
    _renderReviewOptions(word, correctDisplay, idx, words);
  });
}

function _renderReviewOptions(word, correctDisplay, idx, words) {
  // Wrong answers: pick 3 random Chinese meanings from the full dictionary
  var wrongOptions = _allChineseMeanings
    .filter(function(m) { return m !== correctDisplay; })
    .sort(function() { return 0.5 - Math.random(); })
    .slice(0, 3);

  // Build options array: each entry is {display, word (English for matching)}
  var optPairs = [{display: correctDisplay, word: word}];
  var allDictKeys = Object.keys(MEANINGS);
  for (var i = 0; i < wrongOptions.length; i++) {
    var randWord = allDictKeys.filter(function(k) {
      return k !== word && MEANINGS[k] === wrongOptions[i];
    })[0] || word + '_opt' + i;
    optPairs.push({display: wrongOptions[i], word: randWord});
  }
  optPairs.sort(function() { return 0.5 - Math.random(); });
  state._reviewOptPairs = optPairs;

  var optsHtml = optPairs.map(function(p, pi) {
    return '<div class="review-opt" data-optidx="' + pi + '" onclick="selectReviewOpt(this,' + idx + ',' + pi + ')">' +
      p.display +
    '</div>';
  }).join('');

  document.getElementById('review-opts').innerHTML = optsHtml;
}

function _renderReviewComplete(main, words) {
  const acc = Math.round((state._reviewCorrect / words.length) * 100);
  state.reviewAccuracy = { correct: state._reviewCorrect, total: words.length, pct: acc };
  main.innerHTML = `
    <div class="page page-center">
      <h2>🎉 复习完成！</h2>
      <p style="font-size:1.2rem;margin:16px 0">
        正确: ${state._reviewCorrect}/${words.length} (${acc}%)
      </p>
      <div class="tag-list" style="justify-content:center;margin-bottom:16px">
        ${words.map(function(w) {
          var correct = state._reviewWordResults && state._reviewWordResults[w];
          var cls = 'tag';
          if (correct === true) cls = 'tag tag-ok';
          else if (correct === false) cls = 'tag tag-wrong';
          return '<span class="' + cls + '">' + w + '</span>';
        }).join('')}
      </div>
      <div style="display:flex;gap:12px">
        <button class="btn" onclick="finishStory()">返回主页</button>
        <button class="btn btn-outline" onclick="router.go('timeline')">📖 回顾故事</button>
      </div>
    </div>
  `;
}

function selectReviewOpt(el, qIdx, optIdx) {
  const opts = document.querySelectorAll('.review-opt');
  const feedback = document.getElementById('review-feedback');
  const nextBtn = document.getElementById('review-next-btn');

  opts.forEach(o => o.style.pointerEvents = 'none');

  if (!state._reviewWordResults) state._reviewWordResults = {};

  const words = state._reviewWords;
  const pairs = state._reviewOptPairs;
  const correctWord = words[qIdx];
  const correctDisplay = _optionDisplay(correctWord);
  const isCorrect = pairs[optIdx].word === correctWord;

  if (isCorrect) {
    el.classList.add('selected-correct');
    feedback.innerHTML = '✅ 正确！ ' + correctDisplay;
    feedback.style.color = 'var(--success)';
    state._reviewCorrect++;
    state._reviewWordResults[correctWord] = true;
  } else {
    el.classList.add('selected-wrong');
    // Highlight the correct option
    opts.forEach(o => {
      var idx = parseInt(o.dataset.optidx);
      if (pairs[idx].word === correctWord) o.classList.add('selected-correct');
    });
    feedback.innerHTML = '❌ 错误。正确答案是: <strong>' + correctDisplay + '</strong>';
    feedback.style.color = 'var(--secondary)';
    state._reviewWordResults[correctWord] = false;
  }

  nextBtn.style.display = 'block';
}

function nextReview() {
  state._reviewIdx++;
  const main = document.getElementById('main-content');
  _renderReviewQuestion(main);
}


// ============================================
// ROUTE: history — Past stories (with specific words)
// ============================================
router.register('history', function render(main) {
  loadStoryHistory();
  const history = state.storyHistory || [];

  // Load game history from localStorage (standalone games)
  let gameHistory = [];
  try {
    gameHistory = JSON.parse(localStorage.getItem('wordQuest_gameHistory') || '[]');
  } catch(e) {}

  // Collect all unique words across all stories (target words + looked-up words)
  const allWords = new Set();
  const wordStats = {};
  for (const h of history) {
    if (h.words) {
      for (const w of h.words) {
        allWords.add(w);
        if (!wordStats[w]) wordStats[w] = 0;
        wordStats[w]++;
      }
    }
    if (h.vocabBook) {
      for (const w of h.vocabBook) {
        allWords.add(w);
        if (!wordStats[w]) wordStats[w] = 0;
        wordStats[w]++;
      }
    }
  }
  const wordList = [...allWords].sort();

  // Build game history HTML
  const gameHistoryHtml = gameHistory.length > 0 ? gameHistory.map((g, gi) => {
    const tl = g.timeline || [];
    const timelineHtml = tl.length > 0 ? tl.map((t, ti) => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0">
        <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:rgba(255,215,0,0.12);color:#ffd700;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold">${ti+1}</span>
        <div style="flex:1;font-size:12px;color:#ccc;line-height:1.4">
          <span style="color:#ffd700;font-weight:600">${t.title || 'Step '+(ti+1)}</span>
          ${t.choice ? `<span style="display:block;font-size:11px;color:rgba(255,215,0,0.5);margin-top:1px">↳ ${t.choice}</span>` : ''}
        </div>
      </div>
      ${ti < tl.length-1 ? '<div style="border-left:1px solid rgba(255,215,0,0.12);margin-left:10px;height:4px"></div>' : ''}
    `).join('') : '';

    return `
      <div class="history-item" style="cursor:pointer;flex-wrap:wrap" onclick="this.classList.toggle('expanded');const n=this.querySelector('.game-timeline');if(n){n.style.display=n.style.display==='none'?'block':'none'}">
        <div class="history-info" style="flex:1;min-width:200px">
          <div class="history-title">${g.title}</div>
          <div class="history-meta">
            ${g.storyType || ''}
            · ${g.date || ''}
            · ${g.endingTy === 'gold' ? '🏆' : g.endingTy === 'silver' ? '🥈' : g.endingTy === 'bronze' ? '🥉' : '💭'} ${g.endingTitle || g.endingTy || ''}
          </div>
        </div>
        <span class="tag tag-ok" style="flex-shrink:0">🎮 已通关</span>
        <div class="game-timeline" style="display:none;width:100%;margin-top:10px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px">
          <div style="font-size:12px;color:rgba(255,215,0,0.5);margin-bottom:8px;font-weight:600;letter-spacing:1px">📜 故事时间线</div>
          ${timelineHtml}
          ${g.words && g.words.length > 0 ? `<div style="margin-top:10px;font-size:11px;color:var(--text-light)">📚 单词: ${g.words.map(w => w.w || w).join(', ')}</div>` : ''}
        </div>
      </div>`;
  }).join('') : '';

  main.innerHTML = `
    <div class="page page-wide" style="max-width:640px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="page-title" style="margin-bottom:0">📜 我的故事历史</h2>
        <button class="btn-sm btn-ghost" onclick="router.go('home')">← 返回</button>
      </div>

      ${history.length === 0 && gameHistory.length === 0 ? `
        <div class="card" style="text-align:center;padding:32px">
          <p style="color:var(--text-light)">还没有完成任何故事</p>
          <p style="font-size:0.85rem;color:var(--text-light);margin-top:8px">开始你的第一个故事吧！</p>
          <button class="btn" style="margin-top:16px" onclick="router.go('upload')">🚀 开始新故事</button>
        </div>
      ` : `
        ${gameHistory.length > 0 ? `
          <div class="card">
            <div class="card-title">🎮 互动故事 (${gameHistory.length})</div>
            ${gameHistoryHtml}
          </div>
        ` : ''}

        ${history.length > 0 ? `
          <div class="card">
            <div class="card-title">📖 AI 生成故事 (${history.length})</div>
            ${history.map((h, i) => `
              <div class="story-entry" onclick="toggleHistoryDetail('ai-${i}')" style="cursor:pointer;margin-bottom:12px;padding:8px;border-radius:8px;border:1px solid var(--border, #eee)">
                <div class="history-info" style="flex:1">
                  <div class="history-title">${h.title}</div>
                  <div class="history-meta">
                    ${h.type || ''} · ${h.words ? h.words.length : 0} 个目标单词 ·
                    ${h.date ? h.date.slice(0, 10) : ''}
                  </div>
                </div>
                <div id="ai-detail-${i}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#eee);font-size:0.85rem">
                  <div style="margin-bottom:4px">
                    <strong>🎯 目标单词:</strong>
                    <div class="tag-list" style="margin-top:4px">
                      ${h.words && h.words.length > 0 ? h.words.map(w => {
                        const wordText = typeof w === 'object' ? (w.w || w.word || '') : w;
                        const correct = h.reviewWordResults && h.reviewWordResults[wordText];
                        var cls = 'tag';
                        if (correct === true) cls = 'tag tag-ok';
                        else if (correct === false) cls = 'tag tag-wrong';
                        return `<span class="${cls}">${wordText} ${getMeaning(wordText)}</span>`;
                      }).join('') : '<span style="color:var(--text-light)">无</span>'}
                    </div>
                  </div>
                  ${h.vocabBook && h.vocabBook.length > 0 ? `
                  <div style="margin-bottom:4px">
                    <strong>🔍 查询过的生词:</strong>
                    <div class="tag-list" style="margin-top:4px">
                      ${h.vocabBook.map(w => `<span class="tag">${w} ${getMeaning(w)}</span>`).join('')}
                    </div>
                  </div>
                  ` : ''}
                  ${h.reviewAccuracy && h.reviewAccuracy.pct != null ? `
                  <div style="margin-top:4px">
                    <strong>📊 复习正确率:</strong> ${h.reviewAccuracy.pct}% (${h.reviewAccuracy.correct}/${h.reviewAccuracy.total})
                  </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Specific word list across all stories -->
        ${wordList.length > 0 ? `
          <div class="card">
            <div class="card-title">📚 所有学过的单词 (共 ${wordList.length} 个)</div>
            <div class="tag-list">
              ${wordList.map(w => {
                const count = wordStats[w];
                const m = getMeaning(w);
                return `<span class="tag tag-ok" title="在 ${count} 个故事中学过">
                  ${w} ${m} <span style="font-size:0.7rem;opacity:0.6">×${count}</span>
                </span>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      `}
    </div>
  `;
});
