/* ============================================================
   app.js — App State, Router, API Client, Utilities
   ============================================================ */

// ---- API Base ----
// 通过 Cloudflare Functions 代理请求
const API_BASE = '/api/deepseek';

// ---- State ----
const state = {
  user: null,
  currentPage: 'loading',
  story: null,
  chapters: [],
  currentChapter: null,
  vocabBook: [],
  choiceLog: [],
  storyHistory: [],    // [{storyId, title, type, words, chapters, choiceLog, date}, ...]
};

// ---- Toast ----
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type || 'info');
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ---- API Client ----
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

// ---- Router ----
const router = {
  routes: {},
  register(name, fn) { this.routes[name] = fn; },
  go(name, params) {
    state.currentPage = name;
    state._pageParams = params;
    history.pushState({ page: name, params }, '', '#' + name);
    this._render();
  },
  _render() {
    const main = document.getElementById('main-content');
    const header = document.getElementById('app-header');
    const fn = this.routes[state.currentPage];
    if (!fn) { main.innerHTML = '<div class="page page-center"><h2>404</h2></div>'; return; }
    if (state.user && state.currentPage !== 'login') {
      header.classList.remove('hidden');
      document.getElementById('user-badge').textContent =
        (state.user.name || state.user.uid) + ' · ' + (state.user.level || 'L2');
      // 计算并显示剩余会员时间
      const expireEl = document.getElementById('user-expire');
      if (state.user.expireDate) {
        const today = new Date();
        const expire = new Date(state.user.expireDate);
        const diff = Math.ceil((expire - today) / (1000 * 60 * 60 * 24));
        if (diff > 0) {
          expireEl.textContent = '剩余 ' + diff + ' 天';
          expireEl.className = 'user-expire';
        } else if (diff === 0) {
          expireEl.textContent = '今日到期';
          expireEl.className = 'user-expire user-expire-warn';
        } else {
          expireEl.textContent = '已到期';
          expireEl.className = 'user-expire user-expire-expired';
        }
      } else {
        expireEl.textContent = '永久会员';
        expireEl.className = 'user-expire';
      }
    } else {
      header.classList.add('hidden');
    }
    fn(main, state._pageParams);
  },
  init() {
    window.addEventListener('popstate', (e) => {
      if (e.state) { state.currentPage = e.state.page; state._pageParams = e.state.params; this._render(); }
    });
    const hash = location.hash.slice(1) || 'login';
    this.go(hash);
  }
};

// ---- Logout ----
function appLogout() {
  if (!confirm('确定要退出吗？')) return;
  state.user = null; state.story = null; state.chapters = []; state.currentChapter = null; state.choiceLog = [];
  router.go('login');
}

// ---- Safe LocalStorage (sandbox fallback) ----
function safeGet(key, def) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); return true; } catch(e) { return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch(e) {}
}

// ---- Auto-login ----
function checkAutoLogin() {
  const saved = safeGet('story_user');
  if (saved) { try { state.user = JSON.parse(saved); return true; } catch(e) { safeRemove('story_user'); } }
  return false;
}

// ---- History persistence ----
function saveStoryHistory() {
  const game = state._gameData;
  if (!game || state.chapters.length === 0) return;
  const entry = {
    storyId: game.storyId,
    title: game.title,
    type: game.type,
    words: game.words.slice(),
    chapters: state.chapters.map(c => ({
      id: c.id || 'ch',
      title: c.title || '',
      text: c.text || '',
      choices: c.choices || [],
      e: !!c.e,
      ty: c.ty,
      badge: c.badge,
    })),
    choiceLog: state.choiceLog.slice(),
    vocabBook: state.vocabBook.slice(),
    reviewAccuracy: state.reviewAccuracy || null,
    reviewWordResults: state._reviewWordResults || null,
    date: new Date().toISOString().slice(0, 10),
  };
  // Load existing history
  const key = 'story_history_' + (state.user ? state.user.uid : 'default');
  let history = [];
  try { const raw = safeGet(key); if (raw) history = JSON.parse(raw); } catch(e) {}
  // Replace or append
  const idx = history.findIndex(h => h.storyId === entry.storyId);
  if (idx >= 0) history[idx] = entry;
  else history.unshift(entry);
  // Keep max 20
  if (history.length > 20) history = history.slice(0, 20);
  safeSet(key, JSON.stringify(history));
  state.storyHistory = history;
}

function loadStoryHistory() {
  const key = 'story_history_' + (state.user ? state.user.uid : 'default');
  try { const raw = safeGet(key); if (raw) state.storyHistory = JSON.parse(raw); } catch(e) {}
  return state.storyHistory;
}

// ---- Translation cache (for words not in MEANINGS) ----
var _translationCache = {};

// ---- Vocab Panel ----
function showVocab(word) {
  const old = document.querySelector('.vocab-overlay');
  if (old) old.remove();

  const clean = word.toLowerCase().replace(/[^a-z-]/g, '');
  const phonetic = PHONETICS[clean] || '';
  var meaning = getMeaning(clean);

  const div = document.createElement('div');
  div.className = 'vocab-overlay';
  div.innerHTML = `
    <div class="vocab-panel">
      <div class="word">${word}</div>
      ${phonetic ? '<div class="phonetic">' + phonetic + '</div>' : ''}
      <div class="meaning" id="vocab-meaning">${meaning}</div>
      <div style="margin:8px 0">
        <button class="close-btn" onclick="speakWord('${word}')">🔊 听发音</button>
      </div>
      <button class="close-btn" onclick="this.closest('.vocab-overlay').remove()">关闭</button>
    </div>
  `;
  document.body.appendChild(div);
  div.addEventListener('click', (e) => { if (e.target === div) div.remove(); });

  if (!state.vocabBook.includes(word)) state.vocabBook.push(word);

  // If already in cache, use it
  if (_translationCache[clean]) {
    document.getElementById('vocab-meaning').textContent = _translationCache[clean];
    return;
  }

  // If local meaning is just a placeholder, fetch from backend dictionary first
  var needsFetch = !meaning || meaning.indexOf('暂无释义') >= 0 || meaning === clean;
  if (!needsFetch) return; // Local dictionary has good meaning

  document.getElementById('vocab-meaning').textContent = '正在查询...';

  // Try backend dictionary first
  fetch(API_BASE + '/api/dictionary/lookup?word=' + encodeURIComponent(clean))
    .then(function(r) {
      if (r.ok) return r.json();
      throw new Error('not_found');
    })
    .then(function(data) {
      var txt = data.meaning || '';
      if (data.phonetic && !phonetic) {
        var pEl = document.querySelector('.phonetic');
        if (pEl) pEl.textContent = data.phonetic;
      }
      _translationCache[clean] = txt || '（暂无释义）';
      document.getElementById('vocab-meaning').textContent = txt || '（暂无释义）';
    })
    .catch(function() {
      // Fallback to MyMemory free API
      fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(clean) + '&langpair=en|zh-CN')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var translated = '';
          if (data && data.responseData && data.responseData.translatedText) {
            translated = data.responseData.translatedText;
            if (translated.toLowerCase().replace(/[^a-z]/g, '') === clean) translated = '';
          }
          if (translated) {
            _translationCache[clean] = translated;
            document.getElementById('vocab-meaning').textContent = translated;
          } else {
            document.getElementById('vocab-meaning').textContent = '（暂无释义：' + clean + '）';
          }
        })
        .catch(function() {
          document.getElementById('vocab-meaning').textContent = '（暂无释义：' + clean + '）';
        });
    });
}

// ---- Pronunciation ----
function speakWord(word) {
  if (!window.speechSynthesis) { toast('浏览器不支持语音', 'error'); return; }
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US'; u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---- Dictionaries ----
const PHONETICS = {
  brave: '/breɪv/', castle: '/ˈkæsəl/', bridge: '/brɪdʒ/', forest: '/ˈfɔrɪst/',
  key: '/kiː/', river: '/ˈrɪvər/', door: '/dɔr/', tree: '/triː/', water: '/ˈwɔtər/',
  friend: '/frɛnd/', house: '/haʊs/', book: '/bʊk/', school: '/skuːl/',
  teacher: '/ˈtitʃər/', student: '/ˈstudənt/', cat: '/kæt/', dog: '/dɔɡ/',
  bird: '/bɜrd/', fish: '/fɪʃ/', sun: '/sʌn/', moon: '/muːn/', star: '/stɑr/',
  happy: '/ˈhæpi/', sad: '/sæd/', big: '/bɪɡ/', small: '/smɔl/',
  run: '/rʌn/', jump: '/dʒʌmp/', swim: '/swɪm/', fly: '/flaɪ/', eat: '/iːt/',
  drink: '/drɪŋk/', sleep: '/sliːp/', read: '/riːd/', write: '/raɪt/', draw: '/drɔ/',
  sing: '/sɪŋ/', dance: '/dæns/', play: '/pleɪ/', think: '/θɪŋk/', know: '/noʊ/',
  see: '/siː/', hear: '/hɪr/', say: '/seɪ/', go: '/ɡoʊ/', come: '/kʌm/',
  look: '/lʊk/', find: '/faɪnd/', give: '/ɡɪv/', make: '/meɪk/', help: '/hɛlp/',
  want: '/wɒnt/', like: '/laɪk/', love: '/lʌv/', have: '/hæv/',
  good: '/ɡʊd/', bad: '/bæd/', new: '/njuː/', old: '/oʊld/',
  beautiful: '/ˈbjutəfəl/', strong: '/strɔŋ/', fast: '/fæst/', slow: '/sloʊ/',
  hot: '/hɒt/', cold: '/koʊld/', open: '/ˈoʊpən/', close: '/kloʊz/',
  magic: '/ˈmædʒɪk/', secret: '/ˈsiːkrɪt/', treasure: '/ˈtrɛʒər/',
  dragon: '/ˈdræɡən/', knight: '/naɪt/', king: '/kɪŋ/', queen: '/kwiːn/',
  world: '/wɜrld/', sky: '/skaɪ/', ground: '/ɡraʊnd/', mountain: '/ˈmaʊntən/',
  ocean: '/ˈoʊʃən/', lake: '/leɪk/', island: '/ˈaɪlənd/',
  garden: '/ˈɡɑrdən/', village: '/ˈvɪlɪdʒ/', city: '/ˈsɪti/',
  mother: '/ˈmʌðər/', father: '/ˈfɑðər/', brother: '/ˈbrʌðər/', sister: '/ˈsɪstər/',
  hero: '/ˈhɪroʊ/', journey: '/ˈdʒɜrni/', adventure: '/ədˈvɛntʃər/',
  courage: '/ˈkɜrɪdʒ/', wisdom: '/ˈwɪzdəm/', strength: '/strɛŋkθ/',
  mysterious: '/mɪˈstɪriəs/', ancient: '/ˈeɪnʃənt/',
  suddenly: '/ˈsʌdənli/', quickly: '/ˈkwɪkli/', slowly: '/ˈsloʊli/',
  carefully: '/ˈkɛrfəli/', quietly: '/ˈkwaɪətli/',
  gold: '/ɡoʊld/', silver: '/ˈsɪlvər/', stone: '/stoʊn/',
  fire: '/faɪər/', water: '/ˈwɔtər/', wind: '/wɪnd/', cloud: '/klaʊd/',
  path: '/pæθ/', gate: '/ɡeɪt/', wall: '/wɔl/', window: '/ˈwɪndoʊ/',
  room: '/ruːm/', bed: '/bɛd/', table: '/ˈteɪbəl/', chair: '/tʃɛr/',
  map: '/mæp/', clue: '/kluː/', lock: '/lɒk/', bell: '/bɛl/',
  north: '/nɔrθ/', south: '/saʊθ/', east: '/iːst/', west: '/wɛst/',
  morning: '/ˈmɔrnɪŋ/', night: '/naɪt/', today: '/təˈdeɪ/', tomorrow: '/təˈmɒroʊ/',
  explore: '/ɪkˈsplɔr/', discover: '/dɪˈskʌvər/', rescue: '/ˈrɛskjuː/',
  escape: '/ɪˈskeɪp/', arrive: '/əˈraɪv/', decide: '/dɪˈsaɪd/',
  believe: '/bɪˈliːv/', remember: '/rɪˈmɛmbər/', understand: '/ˌʌndərˈstænd/',
  follow: '/ˈfɒloʊ/', enter: '/ˈɛntər/', leave: '/liːv/', return: '/rɪˈtɜrn/',
  cross: '/krɔs/', climb: '/klaɪm/', hide: '/haɪd/',
  whisper: '/ˈwɪspər/', smile: '/smaɪl/', laugh: '/læf/',
  step: '/stɛp/', track: '/træk/', sign: '/saɪn/',
  stairs: '/stɛrz/', roof: '/ruːf/', floor: '/flɔr/',
  corner: '/ˈkɔrnər/', edge: '/ɛdʒ/', middle: '/ˈmɪdəl/',
  top: '/tɒp/', bottom: '/ˈbɒtəm/', end: '/ɛnd/',
  piece: '/piːs/', part: '/pɑrt/', line: '/laɪn/',
  circle: '/ˈsɜrkəl/', shape: '/ʃeɪp/',
};

const MEANINGS = {
  brave:'勇敢的', castle:'城堡', bridge:'桥', forest:'森林',
  key:'钥匙', river:'河流', door:'门', tree:'树', water:'水',
  friend:'朋友', house:'房子', book:'书', school:'学校',
  teacher:'老师', student:'学生', cat:'猫', dog:'狗',
  bird:'鸟', fish:'鱼', sun:'太阳', moon:'月亮', star:'星星',
  happy:'快乐的', sad:'悲伤的', big:'大的', small:'小的',
  run:'跑', jump:'跳', swim:'游泳', fly:'飞', eat:'吃',
  drink:'喝', sleep:'睡觉', read:'阅读', write:'写', draw:'画',
  sing:'唱歌', dance:'跳舞', play:'玩', think:'想', know:'知道',
  see:'看见', hear:'听见', say:'说', go:'去', come:'来',
  look:'看', find:'找到', give:'给', make:'做', help:'帮助',
  want:'想要', like:'喜欢', love:'爱', have:'有',
  good:'好的', bad:'坏的', new:'新的', old:'旧的',
  beautiful:'美丽的', strong:'强壮的', fast:'快的', slow:'慢的',
  hot:'热的', cold:'冷的', open:'打开', close:'关闭',
  up:'向上', down:'向下', in:'在...里', out:'在...外',
  on:'在...上', under:'在...下', near:'在...附近',
  left:'左边', right:'右边',
  secret:'秘密', magic:'魔法', adventure:'冒险', treasure:'宝藏',
  dragon:'龙', knight:'骑士', king:'国王', queen:'王后',
  prince:'王子', princess:'公主', monster:'怪物', giant:'巨人',
  fairy:'精灵', witch:'女巫', wizard:'巫师', hero:'英雄',
  journey:'旅程', quest:'任务', battle:'战斗', victory:'胜利',
  golden:'金色的', silver:'银色的', ancient:'古老的',
  mysterious:'神秘的', dark:'黑暗的', light:'光亮的',
  take:'拿', bring:'带来', carry:'携带', hold:'握住',
  push:'推', pull:'拉', stand:'站', sit:'坐', walk:'走路',
  stop:'停下', turn:'转弯', listen:'听', watch:'观看',
  call:'呼叫', shout:'大喊', whisper:'低语', smile:'微笑',
  cry:'哭', laugh:'笑', thank:'感谢', please:'请',
  morning:'早上', night:'晚上', today:'今天', tomorrow:'明天',
  world:'世界', sky:'天空', ground:'地面', mountain:'山',
  hill:'小山', ocean:'海洋', lake:'湖', island:'岛屿',
  garden:'花园', farm:'农场', village:'村庄', town:'城镇',
  city:'城市', street:'街道', food:'食物', bread:'面包',
  milk:'牛奶', apple:'苹果', name:'名字', family:'家庭',
  mother:'妈妈', father:'爸爸', brother:'兄弟', sister:'姐妹',
  head:'头', hand:'手', foot:'脚', eye:'眼睛', ear:'耳朵',
  nose:'鼻子', mouth:'嘴巴', red:'红色', blue:'蓝色',
  green:'绿色', yellow:'黄色', white:'白色', black:'黑色',
  tall:'高的', short:'矮的', long:'长的', wide:'宽的',
  young:'年轻的', thin:'瘦的', fat:'胖的', clean:'干净的',
  dirty:'脏的', interesting:'有趣的', important:'重要的',
  path:'小路', gate:'大门', wall:'墙', window:'窗户',
  room:'房间', bed:'床', table:'桌子', chair:'椅子',
  box:'盒子', bag:'包', hat:'帽子', bell:'铃铛',
  rope:'绳子', stone:'石头', stick:'棍子', fire:'火',
  wind:'风', rain:'雨', snow:'雪', cloud:'云',
  feel:'感觉', try:'尝试', need:'需要', use:'使用',
  work:'工作', study:'学习', wait:'等待', follow:'跟随',
  enter:'进入', leave:'离开', return:'返回', start:'开始',
  finish:'完成', win:'赢', lose:'输', save:'拯救',
  guard:'守卫', attack:'攻击', protect:'保护',
  wise:'聪明的', clever:'机灵的', kind:'善良的', honest:'诚实的',
  funny:'有趣的', quiet:'安静的', loud:'大声的', gentle:'温柔的',
  strange:'奇怪的', special:'特别的', common:'普通的',
  across:'穿过', through:'通过', around:'周围', between:'之间',
  behind:'在后面', front:'前面', beside:'旁边', above:'上面',
  below:'下面', inside:'里面', outside:'外面',
  suddenly:'突然', quickly:'快速地', slowly:'慢慢地',
  carefully:'小心地', loudly:'大声地', quietly:'安静地',
  maybe:'也许', always:'总是', never:'从不', often:'经常',
  sometimes:'有时', then:'然后', now:'现在', soon:'很快',
  again:'再次', also:'也', very:'非常', too:'太',
  courage:'勇气', strength:'力量', wisdom:'智慧',
  hope:'希望', dream:'梦想', wish:'愿望',
  explore:'探索', discover:'发现', solve:'解决',
  rescue:'营救', escape:'逃脱', arrive:'到达',
  begin:'开始', continue:'继续', decide:'决定',
  choose:'选择', change:'改变', believe:'相信',
  remember:'记住', forget:'忘记', understand:'理解',
  notice:'注意到', recognize:'认出', realize:'意识到',
  imagine:'想象', appear:'出现', disappear:'消失',
  belong:'属于', contain:'包含', describe:'描述',
  explain:'解释', step:'脚步', track:'轨迹',
  map:'地图', clue:'线索', lock:'锁', stairs:'楼梯',
  roof:'屋顶', floor:'地板', corner:'角落', edge:'边缘',
  middle:'中间', center:'中心', top:'顶部', bottom:'底部',
  side:'侧面', end:'末端', point:'点', piece:'片',
  part:'部分', group:'组', line:'线', circle:'圆',
  shape:'形状', size:'尺寸', gold:'金子', silver:'银子',
  // === Animals ===
  animal:'动物', elephant:'大象', tiger:'老虎', lion:'狮子', bear:'熊',
  rabbit:'兔子', monkey:'猴子', panda:'熊猫', horse:'马', sheep:'羊',
  pig:'猪', chicken:'鸡', duck:'鸭子', snake:'蛇', turtle:'乌龟',
  frog:'青蛙', mouse:'老鼠', fox:'狐狸', wolf:'狼', deer:'鹿',
  whale:'鲸鱼', dolphin:'海豚', shark:'鲨鱼', seal:'海豹', eagle:'鹰',
  owl:'猫头鹰', crow:'乌鸦', parrot:'鹦鹉', penguin:'企鹅', swan:'天鹅',
  bee:'蜜蜂', ant:'蚂蚁', butterfly:'蝴蝶', spider:'蜘蛛', snail:'蜗牛',
  // === Food & Drink ===
  food:'食物', fruit:'水果', vegetable:'蔬菜', rice:'米饭', noodle:'面条',
  egg:'鸡蛋', meat:'肉', fish:'鱼', chicken:'鸡肉', beef:'牛肉',
  cake:'蛋糕', candy:'糖果', cookie:'饼干', ice:'冰', cream:'奶油',
  soup:'汤', salad:'沙拉', pizza:'比萨', hamburger:'汉堡', sandwich:'三明治',
  breakfast:'早餐', lunch:'午餐', dinner:'晚餐', tea:'茶', coffee:'咖啡',
  juice:'果汁', sugar:'糖', salt:'盐', honey:'蜂蜜', butter:'黄油',
  // === Body & Health ===
  body:'身体', arm:'手臂', leg:'腿', finger:'手指', toe:'脚趾',
  shoulder:'肩膀', knee:'膝盖', elbow:'肘部', face:'脸', hair:'头发',
  tooth:'牙齿', tongue:'舌头', back:'背部', neck:'脖子', stomach:'胃',
  heart:'心脏', bone:'骨头', skin:'皮肤', healthy:'健康的', sick:'生病的',
  // === Clothes ===
  clothes:'衣服', shirt:'衬衫', pants:'裤子', shoes:'鞋子', socks:'袜子',
  dress:'连衣裙', coat:'外套', jacket:'夹克', hat:'帽子', scarf:'围巾',
  glove:'手套', belt:'腰带', uniform:'制服', pocket:'口袋', button:'纽扣',
  // === Weather & Nature ===
  weather:'天气', season:'季节', spring:'春天', summer:'夏天', autumn:'秋天',
  winter:'冬天', warm:'温暖的', cool:'凉爽的', dry:'干燥的', wet:'潮湿的',
  sky:'天空', sun:'太阳', moon:'月亮', star:'星星', cloud:'云',
  rainbow:'彩虹', thunder:'雷', lightning:'闪电', storm:'暴风雨', flower:'花',
  grass:'草', leaf:'叶子', tree:'树', seed:'种子', plant:'植物',
  river:'河流', lake:'湖', ocean:'海洋', sea:'海', beach:'海滩',
  island:'岛屿', mountain:'山', hill:'山丘', valley:'山谷', cave:'洞穴',
  desert:'沙漠', forest:'森林', jungle:'丛林', swamp:'沼泽', field:'田野',
  // === Time & Calendar ===
  year:'年', month:'月', week:'周', day:'天', hour:'小时',
  minute:'分钟', second:'秒', clock:'时钟', calendar:'日历',
  monday:'星期一', tuesday:'星期二', wednesday:'星期三', thursday:'星期四',
  friday:'星期五', saturday:'星期六', sunday:'星期日',
  january:'一月', february:'二月', march:'三月', april:'四月',
  may:'五月', june:'六月', july:'七月', august:'八月',
  september:'九月', october:'十月', november:'十一月', december:'十二月',
  birthday:'生日', holiday:'假日', festival:'节日',
  // === School & Learning ===
  learn:'学习', teach:'教', study:'学习', lesson:'课', class:'班级',
  homework:'作业', exam:'考试', test:'测试', grade:'年级', score:'分数',
  answer:'回答', question:'问题', example:'例子', exercise:'练习',
  library:'图书馆', lab:'实验室', pen:'钢笔', pencil:'铅笔', ruler:'尺子',
  eraser:'橡皮', paper:'纸', notebook:'笔记本', backpack:'背包',
  math:'数学', science:'科学', history:'历史', english:'英语', art:'艺术',
  music:'音乐', sport:'体育', subject:'科目', knowledge:'知识',
  // === Emotions & Feelings ===
  emotion:'情绪', feeling:'感觉', angry:'生气的', excited:'兴奋的',
  nervous:'紧张的', scared:'害怕的', surprised:'惊讶的', proud:'自豪的',
  lonely:'孤独的', bored:'无聊的', tired:'疲劳的', hungry:'饿的',
  thirsty:'口渴的', calm:'平静的', friendly:'友好的', shy:'害羞的',
  brave:'勇敢的', curious:'好奇的', cheerful:'快乐的', grateful:'感激的',
  // === Places & Directions ===
  place:'地方', country:'国家', capital:'首都', province:'省',
  north:'北边', south:'南边', east:'东边', west:'西边',
  direction:'方向', address:'地址', bridge:'桥', building:'建筑',
  park:'公园', zoo:'动物园', museum:'博物馆', theater:'剧院',
  hospital:'医院', bank:'银行', shop:'商店', market:'市场',
  airport:'机场', station:'车站', restaurant:'餐厅', hotel:'酒店',
  church:'教堂', temple:'寺庙', square:'广场',
  // === Family & People ===
  people:'人们', person:'人', man:'男人', woman:'女人', boy:'男孩',
  girl:'女孩', baby:'婴儿', child:'孩子', adult:'成年人',
  grandfather:'爷爷', grandmother:'奶奶', grandson:'孙子', granddaughter:'孙女',
  uncle:'叔叔', aunt:'阿姨', cousin:'堂兄妹', neighbor:'邻居',
  friend:'朋友', enemy:'敌人', leader:'领导者', member:'成员', team:'团队',
  // === Actions & Verbs ===
  action:'行动', move:'移动', stop:'停止', turn:'转弯', catch:'抓住',
  throw:'扔', kick:'踢', push:'推', pull:'拉', lift:'举起',
  drop:'放下', carry:'搬运', climb:'爬', dig:'挖', build:'建造',
  break:'打破', fix:'修理', wash:'洗', clean:'清理', cook:'烹饪',
  bake:'烘焙', cut:'切', mix:'混合', plant:'种植', water:'浇水',
  feed:'喂养', pick:'挑选', count:'数数', measure:'测量', weigh:'称重',
  pay:'付款', buy:'买', sell:'卖', share:'分享', borrow:'借',
  lend:'借出', send:'发送', receive:'收到', collect:'收集', save:'保存',
  wave:'挥手', nod:'点头', shake:'摇晃', bow:'鞠躬', kneel:'跪下',
  // === Science & Space ===
  space:'太空', earth:'地球', planet:'行星', rocket:'火箭', astronaut:'宇航员',
  satellite:'卫星', orbit:'轨道', telescope:'望远镜', microscope:'显微镜',
  magnet:'磁铁', energy:'能量', force:'力', motion:'运动', gravity:'重力',
  experiment:'实验', chemical:'化学的', atom:'原子', molecule:'分子',
  electric:'电的', light:'光', sound:'声音', heat:'热量', temperature:'温度',
  // === Sports, Hobbies & Activities ===
  sport:'运动', game:'游戏', race:'赛跑', ball:'球', team:'队伍',
  soccer:'足球', basketball:'篮球', tennis:'网球', baseball:'棒球',
  swimming:'游泳', cycling:'骑行', skiing:'滑雪', skating:'滑冰',
  dance:'舞蹈', yoga:'瑜伽', hike:'徒步', camp:'露营', fishing:'钓鱼',
  hobby:'爱好', travel:'旅行', picnic:'野餐', party:'聚会',
  // === Nature & Environment ===
  environment:'环境', pollution:'污染', recycle:'回收', trash:'垃圾',
  garden:'花园', farm:'农场', crop:'庄稼', harvest:'收获',
  animal:'动物', nature:'自然', resource:'资源', energy:'能源',
  forest:'森林', ocean:'海洋', climate:'气候',
  // === Technology ===
  computer:'电脑', phone:'电话', tablet:'平板', screen:'屏幕',
  keyboard:'键盘', mouse:'鼠标', internet:'网络', website:'网站',
  email:'邮件', message:'信息', robot:'机器人', machine:'机器',
  camera:'相机', battery:'电池', charging:'充电',
  // === Numbers & Quantity ===
  number:'数字', zero:'零', one:'一', two:'二', three:'三',
  four:'四', five:'五', six:'六', seven:'七', eight:'八',
  nine:'九', ten:'十', hundred:'百', thousand:'千', million:'百万',
  first:'第一', second:'第二', third:'第三', last:'最后',
  many:'许多', some:'一些', few:'很少', several:'几个', all:'全部',
  both:'两者', each:'每个', every:'每个', none:'没有',
  // === Describing words ===
  pretty:'漂亮的', handsome:'英俊的', cute:'可爱的', lovely:'可爱的',
  ugly:'丑陋的', scary:'可怕的', funny:'有趣的', silly:'傻乎乎的',
  clever:'聪明的', smart:'聪明的', stupid:'愚蠢的', lazy:'懒惰的',
  hard:'困难的', easy:'简单的', soft:'柔软的', hard:'坚硬的',
  smooth:'光滑的', rough:'粗糙的', sharp:'锋利的', dull:'钝的',
  heavy:'重的', light:'轻的', full:'满的', empty:'空的',
  rich:'富裕的', poor:'贫穷的', famous:'著名的', popular:'流行的',
  correct:'正确的', wrong:'错误的', true:'真实的', false:'假的',
  real:'真实的', fake:'假的', safe:'安全的', dangerous:'危险的',
  // === Connecting & Function words ===
  about:'关于', above:'在...之上', after:'在...之后', along:'沿着',
  although:'虽然', because:'因为', before:'在...之前', below:'在...之下',
  beside:'在...旁边', between:'在...之间', during:'在...期间',
  except:'除了', for:'为了', from:'从', into:'进入', off:'离开',
  onto:'到...上', over:'在...上方', since:'自从', through:'穿过',
  toward:'朝向', until:'直到', with:'和', without:'没有',
  if:'如果', or:'或者', but:'但是', so:'所以', when:'当...时',
  while:'当...时', where:'哪里', why:'为什么', how:'如何',
  // === Halloween & Special ===
  costume:'服装', mask:'面具', pumpkin:'南瓜', ghost:'鬼魂',
  skeleton:'骷髅', vampire:'吸血鬼', zombie:'僵尸',
  gift:'礼物', card:'卡片', balloon:'气球', ribbon:'丝带',
  candle:'蜡烛', lantern:'灯笼', firework:'烟花',
  // === Extra story words ===
  kingdom:'王国', palace:'宫殿', tower:'塔', throne:'王座',
  crown:'王冠', sword:'剑', shield:'盾牌', arrow:'箭',
  treasure:'宝藏', jewel:'珠宝', diamond:'钻石', ruby:'红宝石',
  emerald:'翡翠', pearl:'珍珠', coin:'硬币', chest:'箱子',
  scroll:'卷轴', parchment:'羊皮纸', ink:'墨水', feather:'羽毛',
  nest:'鸟巢', paw:'爪子', tail:'尾巴', wing:'翅膀', fur:'皮毛',
  shell:'贝壳', wave:'波浪', tide:'潮汐', shore:'岸边',
  forest:'森林', meadow:'草地', stream:'小溪', pond:'池塘',
  bridge:'桥', path:'小路', trail:'小径', camp:'营地',
  adventure:'冒险', mystery:'神秘', legend:'传说', myth:'神话',
  danger:'危险', risk:'风险', safety:'安全', protect:'保护',
  attack:'攻击', defend:'防御', defeat:'击败', destroy:'摧毁',
  create:'创造', explore:'探索', discover:'发现', invent:'发明',
  connect:'连接', combine:'结合', separate:'分离', prepare:'准备',
  collect:'收集', gather:'聚集', spread:'传播', rise:'升起',
  fall:'落下', grow:'生长', shine:'闪耀', flow:'流动',
  hide:'隐藏', seek:'寻找', search:'搜索', chase:'追逐',
  flee:'逃跑', fight:'战斗', win:'赢得', lose:'输掉',
  praise:'赞美', blame:'责备', reward:'奖赏', punish:'惩罚',
  allow:'允许', forbid:'禁止', invite:'邀请', refuse:'拒绝',
  agree:'同意', argue:'争论', promise:'承诺', warn:'警告',
  admit:'承认', deny:'否认', report:'报告', announce:'宣布',
  produce:'生产', provide:'提供', support:'支持', require:'需要',
  include:'包括', exclude:'排除', affect:'影响', reflect:'反映',
  connect:'连接', attach:'附上', remove:'移除', insert:'插入',
  replace:'替换', exchange:'交换', trade:'交易', supply:'供应',
  imagine:'想象', suppose:'假设', consider:'考虑', examine:'检查',
  observe:'观察', measure:'测量', calculate:'计算', estimate:'估计',
  compare:'比较', contrast:'对比', sort:'分类', arrange:'排列',
  organize:'组织', manage:'管理', control:'控制', direct:'指导',
  suggest:'建议', recommend:'推荐', insist:'坚持', doubt:'怀疑',
  wonder:'想知道', realize:'意识到', appreciate:'感激',
  celebrate:'庆祝', congratulate:'祝贺', encourage:'鼓励',
  survive:'幸存', struggle:'挣扎', succeed:'成功', fail:'失败',
  improve:'提高', develop:'发展', advance:'前进',
  spin:'旋转', swing:'摇摆', slide:'滑行', float:'漂浮',
  sink:'下沉', roll:'滚动', bounce:'弹跳', balance:'平衡',
  bend:'弯曲', twist:'扭动', fold:'折叠', wrap:'包裹',
  tie:'系', untie:'解开', lock:'锁', unlock:'解锁',
  load:'加载', unload:'卸载', pack:'打包', unpack:'打开包',
  dress:'穿衣服', undress:'脱衣服', button:'扣扣子', zip:'拉上拉链',
  brush:'刷', comb:'梳', wipe:'擦', rub:'摩擦',
  knock:'敲', tap:'轻拍', pat:'轻抚', pinch:'捏',
  slip:'滑倒', trip:'绊倒', crash:'撞', explode:'爆炸',
  melt:'融化', freeze:'冻结', boil:'煮沸', fry:'煎',
  bake:'烘烤', roast:'烤', steam:'蒸', grill:'烧烤',
  strange:'奇怪的', familiar:'熟悉的', ordinary:'普通的',
  extraordinary:'非凡的', magnificent:'壮丽的', splendid:'辉煌的',
  delightful:'令人愉快的', wonderful:'精彩的', terrible:'可怕的',
  horrible:'恐怖的', dreadful:'可怕的', awful:'糟糕的',
  pleasant:'舒适的', comfortable:'舒适的', peaceful:'和平的',
  gentle:'温和的', fierce:'凶猛的', wild:'野生的', tame:'驯服的',
  loyal:'忠诚的', faithful:'忠实的', brave:'勇敢的', bold:'大胆的',
  timid:'胆小的', shy:'害羞的', proud:'骄傲的', humble:'谦卑的',
  generous:'慷慨的', selfish:'自私的', greedy:'贪婪的',
  honest:'诚实的', dishonest:'不诚实的', polite:'礼貌的',
  rude:'粗鲁的', cruel:'残忍的', kind:'善良的', tender:'温柔的',
  strict:'严格的', fair:'公平的', wise:'睿智的', foolish:'愚蠢的',
  silly:'傻的', clever:'聪明的', bright:'聪明的', brilliant:'杰出的',
  dull:'迟钝的', sharp:'敏锐的', lazy:'懒惰的', active:'活跃的',
  patient:'耐心的', impatient:'不耐烦的', careful:'小心的',
  careless:'粗心的', responsible:'负责的', reliable:'可靠的'
};

function getMeaning(word) {
  const w = word.toLowerCase().replace(/[^a-z-]/g, '');
  return MEANINGS[w] || '（暂无释义：' + w + '）';
}

function getPhonetic(word) {
  return PHONETICS[word.toLowerCase()] || '';
}

// ---- Render story text — ALL words clickable ----
function renderStoryText(text) {
  // Phase 1: Replace __word__ target markers with highlighted spans
  let html = text.replace(/__(\w+)__/g, (_, w) =>
    '<span class="word-highlight" onclick="showVocab(\'' + w + '\')">' + w + '</span>');
  // Phase 2: Wrap remaining plain words (outside HTML tags) as clickable
  html = html.replace(/(^|>)([^<]+)(<|$)/g, (match, open, content, close) => {
    const wrapped = content.replace(/\b([a-zA-Z']+)\b/g, (word) => {
      if (!word.trim() || word === "'") return word;
      const safe = word.replace(/'/g, "\\'");
      return '<span class="word-clickable" onclick="showVocab(\'' + safe + '\')">' + word + '</span>';
    });
    return open + wrapped + close;
  });
  return html;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Always check auto-login first
    const autoLogin = checkAutoLogin();

    // Check if server rendered the login form
    const serverLogin = document.getElementById('server-login');

    if (autoLogin) {
      // User was logged in — go to home (replaces server form if present)
      loadStoryHistory();
      router.go('home');
      return;
    }

    if (serverLogin) {
      // Server-side login form is visible. User will login via srvLogin().
      // Remove any JS-rendered login to avoid overlap
      return;
    }

    // No server form, no auto-login — JS render the login page
    router.go('login');
  } catch(e) {
    console.error('Init error:', e);
    if (!document.getElementById('server-login')) {
      const main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = `<div class="page page-center">
          <div class="card" style="max-width:380px;padding:32px;text-align:center">
            <h2>📖 故事英语</h2>
            <p style="color:var(--secondary);margin:12px 0">加载失败</p>
            <p style="font-size:0.8rem;color:var(--text-light)">${e.message}</p>
            <button class="btn" onclick="location.reload()" style="margin-top:16px">刷新重试</button>
          </div>
        </div>`;
      }
    }
  }
});
