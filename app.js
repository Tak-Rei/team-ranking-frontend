const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://team-ranking-backend.onrender.com';

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
          localStorage.setItem('access_granted', '1');
          document.getElementById('passwordGate').style.display = 'none';
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

// ログインバナー
if (!currentUserId) {
  document.getElementById('loginBanner').style.display = 'flex';
}

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

// ソート
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = false;
    }
    document.querySelectorAll('th.sortable').forEach(t => {
      t.classList.remove('active');
      t.textContent = t.textContent.replace(/ [▲▼]$/, '');
    });
    th.classList.add('active');
    th.textContent = th.textContent + (sortAsc ? ' ▲' : ' ▼');
    renderRanking();
  });
});

// データ取得
async function loadRanking() {
  document.getElementById('rankingBody').innerHTML = '<tr><td colspan="13" class="loading">読み込み中...</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/ranking?year_month=${currentYearMonth}`);
    allData = await res.json();
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
    const stravaName = u.display_strava_name ? (u.strava_name || '') : '';
    const runKm = u.privacy_distance !== false ? (row.run_distance_km ?? 0).toFixed(1) : '<span class="private">非公開</span>';
    const rideKm = u.privacy_distance !== false ? (row.ride_distance_km ?? 0).toFixed(1) : '<span class="private">非公開</span>';
    const swimM = u.privacy_distance !== false ? (row.swim_distance_m ?? 0) : '<span class="private">非公開</span>';
    const re = u.privacy_heartrate !== false ? (row.relative_effort ?? 0) : '<span class="private">非公開</span>';
    const elev = u.privacy_distance !== false ? (row.elevation_gain_m ?? 0) : '<span class="private">非公開</span>';
    const fullMara = u.privacy_full_marathon !== false ? (u.full_marathon_best || '') : '<span class="private">非公開</span>';
    const halfMara = u.privacy_half_marathon !== false ? (u.half_marathon_best || '') : '<span class="private">非公開</span>';

    return `<tr>
      <td class="rank ${rankClass}">${rank}</td>
      <td class="nickname tc" onclick="openDetail('${row.user_id}')">${u.nickname || '未設定'}<span class="mobile-team">${teamBadge}</span>${isAdmin ? `<button class="admin-del" data-uid="${row.user_id}" data-name="${escapeHtml(u.nickname || '未設定')}">×</button>` : ''}</td>
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
function renderDetailSummary(user, stats) {
  const cur = stats.find(s => s.year_month === currentYearMonth) || {};
  const teamKey = (user.team || '').replace('.', '').replace('元リバティー', 'liberty');
  const teamBadge = user.team ? `<span class="team-badge team-${teamKey}">${user.team}</span>` : '';
  const g = (label, val) => `<div><span>${label}</span><b>${val}</b></div>`;
  const stravaName = (user.display_strava_name && user.strava_name) ? `<span style="color:#888; font-size:0.85rem; margin-left:8px;">${escapeHtml(user.strava_name)}</span>` : '';
  document.getElementById('detailSummary').innerHTML = `
    <div class="detail-meta">${teamBadge}${stravaName}</div>
    <div class="detail-grid">
      ${g('今月ラン', (cur.run_distance_km || 0).toFixed(1) + 'km')}
      ${g('自転車', (cur.ride_distance_km || 0).toFixed(1) + 'km')}
      ${g('水泳', (cur.swim_distance_m || 0) + 'm')}
      ${g('獲得標高', (cur.elevation_gain_m || 0) + 'm')}
      ${user.privacy_heartrate !== false ? g('心拍負荷', cur.relative_effort || 0) : g('心拍負荷', '非公開')}
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
    document.getElementById('modalTitle').textContent = user.nickname;
    renderDetailSummary(user, stats);
    showDetailChart(stats, 'run');
    document.getElementById('detailModal').classList.add('open');

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

// コメント1件のHTML（リアクション付き）
function renderMsgItem(m) {
  const name = m.users?.nickname || '名無し';
  const teamHtml = teamTag(m.users?.team || '');
  const dateStr = fmtDateTime(m.created_at);
  const delBtn = ((currentUserId && String(m.user_id) === String(currentUserId)) || isAdmin) ? `<button class="chat-del" data-id="${m.id}">削除</button>` : '';
  return `<div class="chat-msg">
    <div class="chat-msg-head"><span class="chat-left"><span class="chat-name">${escapeHtml(name)}</span>${teamHtml}</span><span class="chat-time">${dateStr}${delBtn}</span></div>
    <div class="chat-msg-body">${escapeHtml(m.message)}</div>
    ${renderReactions(m)}
  </div>`;
}

// リアクションバー（4種の絵文字ボタン。押した人がいれば数と名前を表示）
function renderReactions(m) {
  const rx = Array.isArray(m.reactions) ? m.reactions : [];
  const pills = REACTION_EMOJIS.map(emoji => {
    const who = rx.filter(r => r.emoji === emoji);
    const count = who.length;
    const mine = currentUserId && who.some(r => String(r.user_id) === String(currentUserId));
    const names = who.map(r => r.nickname || '名無し').join('、');
    const cls = 'react-btn' + (mine ? ' mine' : '') + (count ? '' : ' empty');
    const title = count ? escapeHtml(names) : 'リアクション';
    return `<button class="${cls}" data-msg="${m.id}" data-emoji="${emoji}" title="${title}">${emoji}${count ? `<span class="react-count">${count}</span>` : ''}</button>`;
  }).join('');
  return `<div class="reaction-bar">${pills}</div>`;
}

// 投票1件のHTML
function renderPollItem(p) {
  const name = p.nickname || '名無し';
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
    const voterNames = voters.map(v => v.nickname || '名無し').join('、');
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
  const chatMessagesEl = document.getElementById('chatMessages');
  try {
    const [msgsRes, pollsRes] = await Promise.all([
      fetch(`${API_BASE}/api/chat?year_month=${currentYearMonth}`),
      fetch(`${API_BASE}/api/polls?year_month=${currentYearMonth}`).catch(() => null)
    ]);
    const msgs = await msgsRes.json();
    const polls = pollsRes && pollsRes.ok ? await pollsRes.json() : [];
    const items = [];
    (Array.isArray(msgs) ? msgs : []).forEach(m => items.push({ t: tsMs(m.created_at), html: renderMsgItem(m) }));
    (Array.isArray(polls) ? polls : []).forEach(p => items.push({ t: tsMs(p.created_at), html: renderPollItem(p) }));
    if (items.length === 0) {
      chatMessagesEl.innerHTML = '<p class="chat-empty">まだコメントはありません</p>';
      return;
    }
    items.sort((a, b) => a.t - b.t);
    chatMessagesEl.innerHTML = items.map(it => it.html).join('');
    attachBoardHandlers(chatMessagesEl);
  } catch (e) {
    chatMessagesEl.innerHTML = '<p class="chat-empty">読み込みエラー</p>';
  }
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
  // リアクション
  root.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentUserId) { alert('リアクションするにはStravaでログインしてください'); return; }
      try {
        const res = await fetch(`${API_BASE}/api/chat/${btn.dataset.msg}/react`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUserId, emoji: btn.dataset.emoji })
        });
        if (res.ok) loadChat();
      } catch (e) {}
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
loadRanking();
loadRateLimit();
setInterval(loadRateLimit, 60000);
