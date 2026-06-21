const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://team-ranking-backend.onrender.com';

// ===== アクセストークン認証 =====
// すべての API 呼び出し（API_BASE宛）に合言葉トークンを自動付与し、サーバーが
// 401 を返したら合言葉の再入力を促す。各 fetch を個別に書き換えず window.fetch を
// 1か所でラップして全呼び出しに一括適用する。トークンが無い場合はヘッダーを付けない
// ＝旧バックエンド（トークン不要）でもそのまま動く（後方互換）。
const _origFetch = window.fetch.bind(window);
window.fetch = function (url, opts) {
  const u = typeof url === 'string' ? url : (url && url.url) || '';
  if (typeof u === 'string' && u.indexOf(API_BASE) === 0) {
    const tok = localStorage.getItem('access_token');
    opts = Object.assign({}, opts);
    if (tok) opts.headers = Object.assign({}, opts.headers, { 'X-Access-Token': tok });
    return _origFetch(url, opts).then(res => {
      if (res.status === 401) handleAuthExpired();
      return res;
    });
  }
  return _origFetch(url, opts);
};
function handleAuthExpired() {
  if (window.__authExpired) return; // 多重発火防止（複数のAPIが同時に401になっても1回だけ）
  window.__authExpired = true;
  localStorage.removeItem('access_granted');
  localStorage.removeItem('access_token');
  const gate = document.getElementById('passwordGate');
  if (gate) gate.style.display = 'flex';
  const input = document.getElementById('passwordInput');
  if (input && input.parentNode && !document.getElementById('reauthNote')) {
    const note = document.createElement('p');
    note.id = 'reauthNote';
    note.textContent = 'セキュリティ更新のため、お手数ですがもう一度合言葉を入力してください。';
    note.style.cssText = 'color:#f0a000;font-size:0.8rem;margin:8px 0 0;line-height:1.5';
    input.parentNode.insertBefore(note, input);
  }
}

let currentUserId = localStorage.getItem('userId');
let currentYearMonth = new Date().toISOString().slice(0, 7);
let allData = [];

// アクセス合言葉ゲート（初回のみ入力、localStorageで記憶）
if (!localStorage.getItem('access_granted')) {
  const gate = document.getElementById('passwordGate');
  if (gate) gate.style.display = 'flex';
}
{
  const pwSubmit = document.getElementById('passwordSubmit');
  if (pwSubmit) {
    const tryPw = async () => {
      const pw = document.getElementById('passwordInput').value;
      try {
        const res = await fetch(`${API_BASE}/api/verify-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
        });
        const data = await res.json();
        if (data.success) {
          if (data.token) localStorage.setItem('access_token', data.token);
          localStorage.setItem('access_granted', '1');
          document.getElementById('passwordGate').style.display = 'none';
          // 401をきっかけに再入力した場合は、トークン付きで読み込み直すためリロード
          if (window.__authExpired) { window.location.reload(); return; }
        } else {
          document.getElementById('passwordError').style.display = 'block';
        }
      } catch (e) {
        document.getElementById('passwordError').style.display = 'block';
      }
    };
    pwSubmit.addEventListener('click', tryPw);
    document.getElementById('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryPw(); });
  }
}
let sortCol = 'run_distance_km';
let sortAsc = false;
let currentTeamFilter = 'all';
const isAdmin = !!localStorage.getItem('admin_secret');
// 掲示板データのキャッシュ（リアクションを即時反映するため）
let boardMsgs = [];
let boardPolls = [];
// 返信機能: 親コメントごとの返信一覧と、開いている返信エリアのid
let repliesByParent = {};
const expandedReplies = new Set();
let currentNickname = '';

// SNS共有用: 名前を隠す表示モード（この端末のみ・localStorage保存・DBには保存しない）
// hide_names=ON で全員の名前を「-」に。hide_names_self=ON なら自分だけ表示する
let hideNames = localStorage.getItem('hide_names') === '1';
let hideNamesSelf = localStorage.getItem('hide_names_self') === '1';
function nameHidden(userId) {
  if (!hideNames) return false;
  if (hideNamesSelf && String(userId) === String(currentUserId)) return false;
  return true;
}

// ===== 多言語対応（日本語 / 英語） =====
let lang = localStorage.getItem('lang') || 'ja';
const I18N = {
  ja: {
    'toggle': 'EN',
    'h1': '🏃 メンバー別走行距離',
    'pw.title': 'Liberty Team Ranking',
    'pw.prompt': '参加するには合言葉を入力してください',
    'pw.ph': '合言葉',
    'pw.enter': '入る',
    'pw.error': '合言葉が違います',
    'banner.title': '🔒 Stravaに接続するとランキング・掲示板を閲覧できます',
    'banner.note': '接続して取得するのは <b>走行距離・獲得標高・心拍数・プロフィール名</b> だけです。<b>位置情報（GPS・地図・場所）は取得も保存もしません。</b> <b>非公開（自分のみ）の活動は読み取りません。</b> データはあなたが設定した公開範囲でのみチームに表示されます。<a href="privacy.html">取得する情報について詳しく ›</a>',
    'consent.title': 'ご利用前の確認',
    'consent.intro': 'このアプリを使う前に、以下の点にご同意ください。',
    'consent.check1': 'Stravaでフォローし合っていないメンバーにも、私の走行距離・記録（合計距離など）が表示されることを理解しました。',
    'consent.check2': '位置情報（GPS・地図）は利用されないこと、将来利用する仕様に変更する場合は必ず改めて同意を求められることを理解しました。',
    'consent.agree': '同意して始める',
    'consent.detail': '取得する情報について詳しく ›',
    'col.nickname': 'ニックネーム',
    'col.strava': 'Stravaアカウント名',
    'col.team': 'チーム',
    'col.run': 'ランニング(km)',
    'col.ride': '自転車(km)',
    'col.swim': '水泳(m)',
    'col.elev': '獲得標高(m)',
    'col.load': '心拍負荷',
    'col.full': 'フルマラソンベスト',
    'col.half': 'ハーフマラソンベスト',
    'col.race': '参加予定レース',
    'col.comment': 'コメント',
    'guide.link': '📊 各項目の意味・計算方法はこちら →'
  },
  en: {
    'toggle': '日本語',
    'h1': '🏃 Member Distance Ranking',
    'pw.title': 'Liberty Team Ranking',
    'pw.prompt': 'Enter the passcode to continue',
    'pw.ph': 'Passcode',
    'pw.enter': 'Enter',
    'pw.error': 'Incorrect passcode',
    'banner.title': '🔒 Connect with Strava to view the rankings & board',
    'banner.note': 'We only read your <b>distance, elevation gain, heart rate, and profile name</b>. <b>We never collect or store location data (GPS, maps, places).</b> <b>Private ("Only You") activities are not read.</b> Your data is shown to the team only within the visibility you choose. <a href="privacy.html">Learn what we collect ›</a>',
    'consent.title': 'Before you start',
    'consent.intro': 'Please agree to the following before using this app.',
    'consent.check1': 'I understand that my running distance and records (such as total distance) will be visible to other members, even those I do not follow on Strava.',
    'consent.check2': 'I understand that location data (GPS, maps) is not used, and that if this ever changes, my consent will be requested again.',
    'consent.agree': 'Agree & Continue',
    'consent.detail': 'Learn what we collect ›',
    'col.nickname': 'Nickname',
    'col.strava': 'Strava name',
    'col.team': 'Team',
    'col.run': 'Running (km)',
    'col.ride': 'Cycling (km)',
    'col.swim': 'Swim (m)',
    'col.elev': 'Elevation (m)',
    'col.load': 'HR load',
    'col.full': 'Full PB',
    'col.half': 'Half PB',
    'col.race': 'Upcoming races',
    'col.comment': 'Comment',
    'guide.link': '📊 How each metric is calculated →'
  }
};
function t(key) {
  if (I18N[lang] && I18N[lang][key] != null) return I18N[lang][key];
  return I18N.ja[key] != null ? I18N.ja[key] : key;
}
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  updateSortArrows();
}

// 言語トグル（右上）
const langToggleBtn = document.getElementById('langToggle');
if (langToggleBtn) {
  langToggleBtn.addEventListener('click', () => {
    lang = (lang === 'ja') ? 'en' : 'ja';
    localStorage.setItem('lang', lang);
    applyLang();
  });
}

// 同意ゲート（初回のみ。2つのチェックで「同意」ボタンが有効化）
if (!localStorage.getItem('consent_v1')) {
  const cg = document.getElementById('consentGate');
  if (cg) cg.style.display = 'flex';
}
{
  const c1 = document.getElementById('consent1');
  const c2 = document.getElementById('consent2');
  const agree = document.getElementById('consentAgree');
  const sync = () => { if (agree) agree.disabled = !(c1 && c1.checked && c2 && c2.checked); };
  if (c1) c1.addEventListener('change', sync);
  if (c2) c2.addEventListener('change', sync);
  if (agree) agree.addEventListener('click', () => {
    localStorage.setItem('consent_v1', '1');
    const cg = document.getElementById('consentGate');
    if (cg) cg.style.display = 'none';
  });
}

// URLパラメータ処理（OAuth後のリダイレクト）
const params = new URLSearchParams(window.location.search);
if (params.get('auth') === 'success') {
  const uid = params.get('user_id');
  if (uid) {
    localStorage.setItem('userId', uid);
    currentUserId = uid;
  }
  window.history.replaceState({}, '', window.location.pathname);
  // 設定未入力ならsettingsページへ
  checkAndRedirectSettings(currentUserId);
}

async function checkAndRedirectSettings(uid) {
  if (!uid) return;
  const res = await fetch(`${API_BASE}/api/settings/${uid}`).catch(() => null);
  if (!res || !res.ok) return;
  const data = await res.json();
  if (!data.nickname || data.nickname === '') {
    window.location.href = 'settings.html';
  }
}

// 月表示
function updateMonthDisplay() {
  const [y, m] = currentYearMonth.split('-');
  document.getElementById('currentMonth').textContent = `${y}年${parseInt(m)}月`;

  const today = new Date().toISOString().slice(0, 7);
  document.getElementById('nextMonth').disabled = currentYearMonth >= today;
}

document.getElementById('prevMonth').addEventListener('click', () => {
  const d = new Date(currentYearMonth + '-01');
  d.setMonth(d.getMonth() - 1);
  currentYearMonth = d.toISOString().slice(0, 7);
  updateMonthDisplay();
  loadRanking();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  const d = new Date(currentYearMonth + '-01');
  d.setMonth(d.getMonth() + 1);
  const next = d.toISOString().slice(0, 7);
  if (next <= new Date().toISOString().slice(0, 7)) {
    currentYearMonth = next;
    updateMonthDisplay();
    loadRanking();
  }
});

// 閲覧にもStrava接続を必須にする。未接続ならランキング・掲示板を隠し、接続案内だけ表示
function applyAuthGate() {
  const loggedIn = !!currentUserId;
  const tableWrap = document.querySelector('.table-wrapper');
  const chatSection = document.querySelector('.chat-section');
  const banner = document.getElementById('loginBanner');
  if (tableWrap) tableWrap.style.display = loggedIn ? '' : 'none';
  if (chatSection) chatSection.style.display = loggedIn ? '' : 'none';
  if (banner) banner.style.display = loggedIn ? 'none' : 'flex';
  return loggedIn;
}
applyAuthGate();

document.getElementById('loginBtn').addEventListener('click', () => {
  window.location.href = `${API_BASE}/auth/strava`;
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (!currentUserId) {
    window.location.href = `${API_BASE}/auth/strava`;
  } else {
    window.location.href = 'settings.html';
  }
});

// チームフィルター
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTeamFilter = btn.dataset.team;
    renderRanking();
  });
});

// ソート（ラベルは翻訳、矢印は .sort-arrow に分離）
function updateSortArrows() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const active = th.dataset.col === sortCol;
    th.classList.toggle('active', active);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = active ? (sortAsc ? ' ▲' : ' ▼') : '';
  });
}
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = false;
    }
    updateSortArrows();
    renderRanking();
  });
});

// データ取得
async function loadRanking() {
  document.getElementById('rankingBody').innerHTML = '<tr><td colspan="13" class="loading">読み込み中...</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/ranking?year_month=${currentYearMonth}`);
    allData = await res.json();
    const me = allData.find(d => String(d.user_id) === String(currentUserId));
    if (me && me.users && me.users.nickname) currentNickname = me.users.nickname;
    renderRanking();
  } catch (e) {
    document.getElementById('rankingBody').innerHTML = '<tr><td colspan="13" class="loading">読み込みエラー</td></tr>';
  }
  loadChat();
}

// "h:mm:ss" や "mm:ss" を秒数に変換（空欄/不正はInfinity＝末尾）
function timeToSeconds(t) {
  if (!t || typeof t !== 'string') return Infinity;
  const parts = t.split(':').map(Number);
  if (parts.some(isNaN)) return Infinity;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Infinity;
}

function renderRanking() {
  let data = [...allData];

  if (currentTeamFilter !== 'all') {
    data = data.filter(d => d.users?.team === currentTeamFilter);
  }

  data.sort((a, b) => {
    // マラソンベストはタイムを秒に変換して比較（空欄は常に末尾）
    if (sortCol === 'full_marathon_best' || sortCol === 'half_marathon_best') {
      const va = timeToSeconds(a.users?.[sortCol]);
      const vb = timeToSeconds(b.users?.[sortCol]);
      if (va === Infinity && vb === Infinity) return 0;
      if (va === Infinity) return 1;
      if (vb === Infinity) return -1;
      return sortAsc ? va - vb : vb - va;
    }
    let va = a[sortCol] ?? a.users?.[sortCol] ?? '';
    let vb = b[sortCol] ?? b.users?.[sortCol] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortAsc ? va - vb : vb - va;
    }
    return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const tbody = document.getElementById('rankingBody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="loading">データなし</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((row, i) => {
    const u = row.users || {};
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const teamKey = (u.team || '').replace('.', '').replace('元リバティー', 'liberty');
    const teamBadge = u.team ? `<span class="team-badge team-${teamKey}">${u.team}</span>` : '';
    const hidden = nameHidden(row.user_id);
    const nick = hidden ? '-' : (u.nickname || '未設定');
    const stravaName = (u.display_strava_name && !hidden) ? (u.strava_name || '') : '';
    const runKm = u.privacy_distance !== false ? (row.run_distance_km ?? 0).toFixed(1) : '';
    const rideKm = u.privacy_distance !== false ? (row.ride_distance_km ?? 0).toFixed(1) : '';
    const swimM = u.privacy_distance !== false ? (row.swim_distance_m ?? 0) : '';
    const re = u.privacy_heartrate !== false ? (row.relative_effort ?? 0) : '';
    const elev = u.privacy_distance !== false ? (row.elevation_gain_m ?? 0) : '';
    const fullMara = u.privacy_full_marathon !== false ? (u.full_marathon_best || '') : '';
    const halfMara = u.privacy_half_marathon !== false ? (u.half_marathon_best || '') : '';

    return `<tr>
      <td class="rank ${rankClass}">${rank}</td>
      <td class="nickname tc" onclick="openDetail('${row.user_id}')">${escapeHtml(nick)}<span class="mobile-team">${teamBadge}</span>${isAdmin ? `<button class="admin-del" data-uid="${row.user_id}" data-name="${escapeHtml(u.nickname || '未設定')}">×</button>` : ''}</td>
      <td class="tc">${stravaName}</td>
      <td>${teamBadge}</td>
      <td class="num">${runKm}</td>
      <td class="num">${rideKm}</td>
      <td class="num">${swimM}</td>
      <td class="num">${elev}</td>
      <td class="num">${re}</td>
      <td class="tc">${fullMara}</td>
      <td class="tc">${halfMara}</td>
      <td>${u.race || ''}</td>
      <td>${u.comment || ''}</td>
    </tr>`;
  }).join('');

  if (isAdmin) {
    tbody.querySelectorAll('.admin-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`${btn.dataset.name} さんを削除しますか？（記録もすべて消えます）`)) return;
        try {
          const res = await fetch(`${API_BASE}/api/admin/user/${btn.dataset.uid}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_secret: localStorage.getItem('admin_secret') })
          });
          if (res.ok) loadRanking();
          else alert('削除できませんでした（管理者キーを確認してください）');
        } catch (err) {}
      });
    });
  }
}

// 詳細モーダル
// 心拍データ（心拍負荷の数値＋ゾーン色分け）の公開可否。openDetailでユーザーごとに設定
let detailHrPublic = true;
function renderDetailSummary(user, stats, hidden) {
  const cur = stats.find(s => s.year_month === currentYearMonth) || {};
  const teamKey = (user.team || '').replace('.', '').replace('元リバティー', 'liberty');
  const teamBadge = user.team ? `<span class="team-badge team-${teamKey}">${user.team}</span>` : '';
  const g = (label, val) => `<div><span>${label}</span><b>${val}</b></div>`;
  const stravaName = (user.display_strava_name && user.strava_name && !hidden) ? `<span style="color:#888; font-size:0.85rem; margin-left:8px;">${escapeHtml(user.strava_name)}</span>` : '';
  document.getElementById('detailSummary').innerHTML = `
    <div class="detail-meta">${teamBadge}${stravaName}</div>
    <div class="detail-grid">
      ${g('今月ラン', (cur.run_distance_km || 0).toFixed(1) + 'km')}
      ${g('自転車', (cur.ride_distance_km || 0).toFixed(1) + 'km')}
      ${g('水泳', (cur.swim_distance_m || 0) + 'm')}
      ${g('獲得標高', (cur.elevation_gain_m || 0) + 'm')}
      ${user.privacy_heartrate !== false ? g('心拍負荷', cur.relative_effort || 0) : g('心拍負荷', '-')}
      ${g('フルベスト', user.full_marathon_best || '-')}
      ${g('ハーフベスト', user.half_marathon_best || '-')}
    </div>
    ${user.race ? `<div class="detail-row"><span>参加予定レース：</span>${escapeHtml(user.race)}</div>` : ''}
    ${user.comment ? `<div class="detail-row"><span>コメント：</span>${escapeHtml(user.comment)}</div>` : ''}
  `;
}

async function openDetail(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/user/${userId}`);
    if (!res.ok) return;
    const { user, stats } = await res.json();

    detailHrPublic = user.privacy_heartrate !== false;
    const hidden = nameHidden(userId);
    document.getElementById('modalTitle').textContent = hidden ? '-' : user.nickname;
    renderDetailSummary(user, stats, hidden);
    showDetailChart(stats, 'run');
    document.getElementById('detailModal').classList.add('open');
    // 詳細ページでは言語トグルを隠す（スマホでバツ印と干渉するため）
    const lt = document.getElementById('langToggle');
    if (lt) lt.style.display = 'none';

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showDetailChart(stats, btn.dataset.type);
      };
    });
  } catch (e) {}
}

const ZONE_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f97316', '#ef4444'];

// チーム名の文字色（掲示板の投稿者名の横に表示する際に使用。CSSのteam-badgeと同じ色）
const TEAM_COLORS = {
  '3SHINE': '#f5e07d',
  'SKY3.5': '#7de0f5',
  'Be4': '#f57db5',
  '元リバティー': '#f5c07d',
  'リバティースタッフ': '#d4f57d'
};

// 掲示板のリアクション絵文字（👍確認/いいね 👏すごい 🔥熱い ❤️感動）
const REACTION_EMOJIS = ['👍', '👏', '🔥', '❤️'];

function showDetailChart(stats, type) {
  const container = document.getElementById('detailChart');
  const tooltip = document.getElementById('chartTooltip');
  if (tooltip) tooltip.classList.remove('show');

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  // グラフの上限（固定）。ランニング800km / 自転車2000km / 水泳100000m
  const limits = { run: 800, ride: 2000, swim: 100000 };
  const maxVal = limits[type] || 800;

  const tips = [];

  container.innerHTML = months.map((m, idx) => {
    const s = stats.find(r => r.year_month === m);
    const val = s ? (type === 'run' ? s.run_distance_km : type === 'ride' ? s.ride_distance_km : s.swim_distance_m) : 0;
    const pct = (val / maxVal) * 100;
    const label = m.slice(5) + '月';
    const unit = type === 'swim' ? 'm' : 'km';

    let barHtml = '';
    tips[idx] = null;
    let z = null;
    if (s) {
      if (type === 'run') z = [s.hr_z1_percent, s.hr_z2_percent, s.hr_z3_percent, s.hr_z4_percent, s.hr_z5_percent];
      else if (type === 'ride') z = [s.ride_hr_z1_percent, s.ride_hr_z2_percent, s.ride_hr_z3_percent, s.ride_hr_z4_percent, s.ride_hr_z5_percent];
      else if (type === 'swim') z = [s.swim_hr_z1_percent, s.swim_hr_z2_percent, s.swim_hr_z3_percent, s.swim_hr_z4_percent, s.swim_hr_z5_percent];
    }
    if (detailHrPublic && z && val > 0) {
      const total = z.reduce((a, b) => a + (b || 0), 0);
      if (total > 0) {
        // 心拍ゾーンデータがある場合は色分け
        barHtml = z.map((v, i) => `<div class="bar-z${i+1}" style="width:${((v||0)/total)*pct}%"></div>`).join('');
        // ホバー/タップ用のゾーン割合ツールチップ
        tips[idx] = `<strong>${label}</strong>　` + z.map((v, i) => `<span class="tz" style="color:${ZONE_COLORS[i]}">Z${i+1} ${(v||0).toFixed(1)}%</span>`).join('');
      } else {
        // 心拍ゾーンデータがない場合は単色
        barHtml = `<div class="bar-z2" style="width:${pct}%"></div>`;
      }
    } else {
      barHtml = `<div class="bar-z2" style="width:${pct}%"></div>`;
    }

    return `<div class="chart-row" data-idx="${idx}">
      <span class="chart-label">${label}</span>
      <div class="chart-bar-wrap">${barHtml}</div>
      <span class="chart-value">${val > 0 ? val.toFixed(1) + unit : '-'}</span>
    </div>`;
  }).join('');

  // ツールチップ（PCはホバー、スマホはタップでゾーン割合を表示）
  if (tooltip) {
    container.querySelectorAll('.chart-row').forEach(row => {
      const tip = tips[row.dataset.idx];
      if (!tip) return;
      row.style.cursor = 'pointer';
      const show = () => { tooltip.innerHTML = tip; tooltip.classList.add('show'); };
      row.addEventListener('mouseenter', show);
      row.addEventListener('click', show);
    });
  }
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('detailModal').classList.remove('open');
  // 詳細ページを閉じたら言語トグルを再表示
  const lt = document.getElementById('langToggle');
  if (lt) lt.style.display = '';
});

// ========== チャット ==========
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 日時文字列をローカル時刻表示に変換（chatはtz指示子なしUTC、pollsはtimestamptz）
function fmtDateTime(s) {
  const iso = (s.endsWith('Z') || s.includes('+')) ? s : s + 'Z';
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
function tsMs(s) {
  if (!s) return 0;
  const iso = (s.endsWith('Z') || s.includes('+')) ? s : s + 'Z';
  return new Date(iso).getTime();
}
function teamTag(team) {
  if (!team) return '';
  const color = TEAM_COLORS[team] || '#888';
  return `<span class="chat-team" style="color:${color}">${escapeHtml(team)}</span>`;
}

// コメント1件のHTML（リアクション付き）。isReply=true のときは返信（返信欄は出さない）
function renderMsgItem(m, isReply) {
  const name = nameHidden(m.user_id) ? '-' : (m.users?.nickname || '名無し');
  const teamHtml = teamTag(m.users?.team || '');
  const dateStr = fmtDateTime(m.created_at);
  const delBtn = ((currentUserId && String(m.user_id) === String(currentUserId)) || isAdmin) ? `<button class="chat-del" data-id="${m.id}">削除</button>` : '';
  let replySection = '';
  if (!isReply) {
    const replies = repliesByParent[String(m.id)] || [];
    const count = replies.length;
    const open = expandedReplies.has(String(m.id));
    const repliesHtml = replies.map(r => renderMsgItem(r, true)).join('');
    const inputHtml = currentUserId ? `<div class="reply-input-row">
        <input class="reply-input" data-parent="${m.id}" placeholder="返信を書く…" maxlength="300">
        <button class="reply-send" data-parent="${m.id}">送信</button>
      </div>` : '';
    replySection = `<div class="reply-section">
      <button class="reply-toggle" data-id="${m.id}">💬 ${count > 0 ? `返信 ${count}件` : '返信する'} <span class="reply-caret">${open ? '▲' : '▼'}</span></button>
      <div class="reply-area" data-area="${m.id}" style="display:${open ? 'block' : 'none'}">${repliesHtml}${inputHtml}</div>
    </div>`;
  }
  return `<div class="chat-msg${isReply ? ' chat-reply' : ''}">
    <div class="chat-msg-head"><span class="chat-left"><span class="chat-name">${escapeHtml(name)}</span>${teamHtml}</span><span class="chat-time">${dateStr}${delBtn}</span></div>
    <div class="chat-msg-body">${escapeHtml(m.message)}</div>
    ${renderReactions(m)}
    ${replySection}
  </div>`;
}

// リアクションバー。既に押された絵文字だけ数と名前を表示。
// 「＋」を押すと選択肢（ピッカー）が現れる（最初は隠れている）。
function renderReactions(m) {
  const rx = Array.isArray(m.reactions) ? m.reactions : [];
  const existing = REACTION_EMOJIS.filter(emoji => rx.some(r => r.emoji === emoji)).map(emoji => {
    const who = rx.filter(r => r.emoji === emoji);
    const mine = currentUserId && who.some(r => String(r.user_id) === String(currentUserId));
    const names = who.map(r => nameHidden(r.user_id) ? '-' : (r.nickname || '名無し')).join('、');
    return `<button class="react-btn${mine ? ' mine' : ''}" data-msg="${m.id}" data-emoji="${emoji}" title="${escapeHtml(names)}">${emoji}<span class="react-count">${who.length}</span></button>`;
  }).join('');
  const picker = REACTION_EMOJIS.map(emoji =>
    `<button class="react-btn" data-msg="${m.id}" data-emoji="${emoji}" title="リアクション">${emoji}</button>`
  ).join('');
  return `<div class="reaction-bar">${existing}<button class="react-add" title="リアクションを追加">＋</button><div class="react-picker" style="display:none">${picker}</div></div>`;
}

// 投票1件のHTML
function renderPollItem(p) {
  const name = nameHidden(p.user_id) ? '-' : (p.nickname || '名無し');
  const teamHtml = teamTag(p.team || '');
  const dateStr = fmtDateTime(p.created_at);
  const delBtn = ((currentUserId && String(p.user_id) === String(currentUserId)) || isAdmin) ? `<button class="chat-del poll-del" data-id="${p.id}">削除</button>` : '';
  const votes = Array.isArray(p.votes) ? p.votes : [];
  const total = votes.length;
  const myVote = currentUserId ? votes.find(v => String(v.user_id) === String(currentUserId)) : null;
  const opts = (p.options || []).map((opt, i) => {
    const voters = votes.filter(v => v.option_index === i);
    const count = voters.length;
    const pct = total ? Math.round(count / total * 100) : 0;
    const voted = myVote && myVote.option_index === i;
    const voterNames = voters.map(v => nameHidden(v.user_id) ? '-' : (v.nickname || '名無し')).join('、');
    return `<div class="poll-opt${voted ? ' voted' : ''}" data-poll="${p.id}" data-idx="${i}">
      <div class="poll-opt-fill" style="width:${pct}%"></div>
      <span class="poll-opt-label">${escapeHtml(opt)}</span>
      <span class="poll-opt-count">${count}票・${pct}%</span>
      <div class="poll-voters" data-voters="${escapeHtml(voterNames)}"></div>
    </div>`;
  }).join('');
  return `<div class="chat-msg poll-msg">
    <div class="chat-msg-head"><span class="chat-left"><span class="chat-name">${escapeHtml(name)}</span>${teamHtml}<span class="poll-tag">📊投票</span></span><span class="chat-time">${dateStr}${delBtn}</span></div>
    <div class="poll-question">${escapeHtml(p.question)}</div>
    <div class="poll-options">${opts}</div>
    <div class="poll-hint">タップで投票／長押し・右クリックで投票者を表示（合計${total}票）</div>
  </div>`;
}

async function loadChat() {
  const [y, mo] = currentYearMonth.split('-');
  document.getElementById('chatTitle').textContent = `💬 ${y}年${parseInt(mo)}月の掲示板`;
  const pollBtn = document.getElementById('pollCreateBtn');
  if (currentUserId) {
    document.getElementById('chatInputRow').style.display = 'flex';
    document.getElementById('chatLoginNote').style.display = 'none';
    if (pollBtn) pollBtn.style.display = 'inline-block';
  } else {
    document.getElementById('chatInputRow').style.display = 'none';
    document.getElementById('chatLoginNote').style.display = 'block';
    if (pollBtn) pollBtn.style.display = 'none';
  }
  try {
    const [msgsRes, pollsRes] = await Promise.all([
      fetch(`${API_BASE}/api/chat?year_month=${currentYearMonth}`),
      fetch(`${API_BASE}/api/polls?year_month=${currentYearMonth}`).catch(() => null)
    ]);
    const msgs = await msgsRes.json();
    const polls = pollsRes && pollsRes.ok ? await pollsRes.json() : [];
    boardMsgs = Array.isArray(msgs) ? msgs : [];
    boardPolls = Array.isArray(polls) ? polls : [];
    renderBoard();
  } catch (e) {
    document.getElementById('chatMessages').innerHTML = '<p class="chat-empty">読み込みエラー</p>';
  }
}

// キャッシュ済みのデータから掲示板を描画（リアクションの即時反映に使う）
function renderBoard() {
  const chatMessagesEl = document.getElementById('chatMessages');
  // 返信を親ごとにまとめる（boardMsgsにはコメントと返信が混在）
  repliesByParent = {};
  boardMsgs.forEach(m => {
    if (m.parent_id) (repliesByParent[String(m.parent_id)] = repliesByParent[String(m.parent_id)] || []).push(m);
  });
  const items = [];
  boardMsgs.filter(m => !m.parent_id).forEach(m => items.push({ t: tsMs(m.created_at), html: renderMsgItem(m, false) }));
  boardPolls.forEach(p => items.push({ t: tsMs(p.created_at), html: renderPollItem(p) }));
  if (items.length === 0) {
    chatMessagesEl.innerHTML = '<p class="chat-empty">まだコメントはありません</p>';
    return;
  }
  items.sort((a, b) => a.t - b.t);
  chatMessagesEl.innerHTML = items.map(it => it.html).join('');
  attachBoardHandlers(chatMessagesEl);
}

// 掲示板内のボタン（削除・リアクション・投票）のイベントを設定
function attachBoardHandlers(root) {
  // 削除（コメント／投票）
  root.querySelectorAll('.chat-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isPoll = btn.classList.contains('poll-del');
      if (!confirm(isPoll ? 'この投票を削除しますか？' : 'この投稿を削除しますか？')) return;
      const url = isPoll ? `${API_BASE}/api/polls/${btn.dataset.id}` : `${API_BASE}/api/chat/${btn.dataset.id}`;
      try {
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUserId, admin_secret: localStorage.getItem('admin_secret') })
        });
        if (res.ok) loadChat();
      } catch (e) {}
    });
  });
  // リアクションの「＋」を押すと選択肢を表示
  root.querySelectorAll('.react-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const picker = btn.parentElement.querySelector('.react-picker');
      if (picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    });
  });
  // リアクション（画面を即時更新し、サーバーへは裏で送信）
  root.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentUserId) { alert('リアクションするにはStravaでログインしてください'); return; }
      const msgId = btn.dataset.msg, emoji = btn.dataset.emoji;
      const m = boardMsgs.find(x => String(x.id) === String(msgId));
      if (m) {
        m.reactions = m.reactions || [];
        const i = m.reactions.findIndex(r => r.emoji === emoji && String(r.user_id) === String(currentUserId));
        if (i >= 0) m.reactions.splice(i, 1);
        else m.reactions.push({ emoji, user_id: String(currentUserId), nickname: currentNickname || '自分' });
        renderBoard(); // 即時反映（サーバーの応答を待たない）
      }
      fetch(`${API_BASE}/api/chat/${msgId}/react`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, emoji })
      }).then(res => { if (!res.ok) loadChat(); }).catch(() => loadChat());
    });
  });
  // 投票（タップで投票・長押し/右クリックで投票者表示）
  root.querySelectorAll('.poll-opt').forEach(opt => {
    let longPressed = false;
    const reveal = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      const el = opt.querySelector('.poll-voters');
      if (!el) return;
      const names = el.dataset.voters || '';
      el.textContent = names ? '投票者: ' + names : '投票者なし';
      el.classList.toggle('show');
    };
    opt.addEventListener('click', async () => {
      if (longPressed) { longPressed = false; return; } // 長押し直後のクリックは投票しない
      if (!currentUserId) { alert('投票するにはStravaでログインしてください'); return; }
      try {
        const res = await fetch(`${API_BASE}/api/polls/${opt.dataset.poll}/vote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUserId, option_index: Number(opt.dataset.idx) })
        });
        if (res.ok) loadChat();
      } catch (e) {}
    });
    opt.addEventListener('contextmenu', reveal);
    let pressTimer = null;
    opt.addEventListener('touchstart', () => { longPressed = false; pressTimer = setTimeout(() => { longPressed = true; reveal(); }, 500); }, { passive: true });
    opt.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
    opt.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });
  });
  // 返信エリアの開閉
  root.querySelectorAll('.reply-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = String(btn.dataset.id);
      const area = root.querySelector(`.reply-area[data-area="${id}"]`);
      if (!area) return;
      const open = area.style.display === 'none';
      area.style.display = open ? 'block' : 'none';
      if (open) expandedReplies.add(id); else expandedReplies.delete(id);
      const caret = btn.querySelector('.reply-caret');
      if (caret) caret.textContent = open ? '▲' : '▼';
    });
  });
  // 返信の送信（Enterでも送信）
  const sendReply = (parentId) => {
    if (!currentUserId) return;
    const input = root.querySelector(`.reply-input[data-parent="${parentId}"]`);
    const text = input ? input.value.trim() : '';
    if (!text) return;
    expandedReplies.add(String(parentId)); // 投稿後も開いたままにする
    fetch(`${API_BASE}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, year_month: currentYearMonth, message: text, parent_id: parentId })
    }).then(res => { if (res.ok) { if (input) input.value = ''; loadChat(); } }).catch(() => {});
  };
  root.querySelectorAll('.reply-send').forEach(btn => {
    btn.addEventListener('click', () => sendReply(String(btn.dataset.parent)));
  });
  root.querySelectorAll('.reply-input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') sendReply(String(inp.dataset.parent)); });
  });
}

document.getElementById('chatSend').addEventListener('click', async () => {
  const input = document.getElementById('chatText');
  const text = input.value.trim();
  if (!text || !currentUserId) return;
  const btn = document.getElementById('chatSend');
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, year_month: currentYearMonth, message: text })
    });
    if (res.ok) {
      input.value = '';
      loadChat();
    }
  } catch (e) {}
  btn.disabled = false;
});

// ===== 投票作成フォーム =====
const pollCreateBtn = document.getElementById('pollCreateBtn');
const pollForm = document.getElementById('pollForm');
const pollOptionsTpl = '<input type="text" class="poll-opt-input" maxlength="60" placeholder="選択肢1"><input type="text" class="poll-opt-input" maxlength="60" placeholder="選択肢2">';
if (pollCreateBtn && pollForm) {
  pollCreateBtn.addEventListener('click', () => {
    pollForm.style.display = pollForm.style.display === 'none' ? 'block' : 'none';
  });
}
const pollAddOpt = document.getElementById('pollAddOpt');
if (pollAddOpt) {
  pollAddOpt.addEventListener('click', () => {
    const opts = document.getElementById('pollOptions');
    const n = opts.querySelectorAll('.poll-opt-input').length;
    if (n >= 6) { alert('選択肢は最大6つまでです'); return; }
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'poll-opt-input'; inp.maxLength = 60; inp.placeholder = `選択肢${n + 1}`;
    opts.appendChild(inp);
  });
}
const pollCancel = document.getElementById('pollCancel');
if (pollCancel) {
  pollCancel.addEventListener('click', () => {
    pollForm.style.display = 'none';
    document.getElementById('pollQuestion').value = '';
    document.getElementById('pollOptions').innerHTML = pollOptionsTpl;
  });
}
const pollSubmit = document.getElementById('pollSubmit');
if (pollSubmit) {
  pollSubmit.addEventListener('click', async () => {
    if (!currentUserId) { alert('投票を作成するにはStravaでログインしてください'); return; }
    const question = document.getElementById('pollQuestion').value.trim();
    const options = [...document.querySelectorAll('.poll-opt-input')].map(i => i.value.trim()).filter(v => v);
    if (!question) { alert('質問を入力してください'); return; }
    if (options.length < 2) { alert('選択肢を2つ以上入力してください'); return; }
    pollSubmit.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/polls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, year_month: currentYearMonth, question, options })
      });
      if (res.ok) {
        document.getElementById('pollQuestion').value = '';
        document.getElementById('pollOptions').innerHTML = pollOptionsTpl;
        pollForm.style.display = 'none';
        loadChat();
      } else {
        alert('投票の作成に失敗しました');
      }
    } catch (e) {}
    pollSubmit.disabled = false;
  });
}

// Strava APIレート制限の使用状況（目安）を右下に表示
async function loadRateLimit() {
  const el = document.getElementById('rateLimitIndicator');
  if (!el) return;
  try {
    const res = await fetch(`${API_BASE}/api/rate-limit`);
    if (!res.ok) return;
    const d = await res.json();
    if (d.overallUsage == null) { el.textContent = ''; return; }
    el.textContent = `Strava API 本日 ${d.overallUsage} / ${d.overallLimit ?? 4000}`;
  } catch (e) {}
}

// 初期化
updateMonthDisplay();
applyLang();
if (currentUserId) {
  loadRanking();
}
loadRateLimit();
setInterval(loadRateLimit, 60000);
