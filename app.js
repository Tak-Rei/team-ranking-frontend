const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://team-ranking-backend.onrender.com';

let currentUserId = localStorage.getItem('userId');
let currentYearMonth = new Date().toISOString().slice(0, 7);
let allData = [];
let sortCol = 'run_distance_km';
let sortAsc = false;
let currentTeamFilter = 'all';

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
    const re = u.privacy_re !== false ? (row.relative_effort ?? 0) : '<span class="private">非公開</span>';
    const elev = u.privacy_distance !== false ? (row.elevation_gain_m ?? 0) : '<span class="private">非公開</span>';
    const fullMara = u.privacy_full_marathon !== false ? (u.full_marathon_best || '') : '<span class="private">非公開</span>';
    const halfMara = u.privacy_half_marathon !== false ? (u.half_marathon_best || '') : '<span class="private">非公開</span>';

    return `<tr>
      <td class="rank ${rankClass}">${rank}</td>
      <td class="nickname tc" onclick="openDetail('${row.user_id}')">${u.nickname || '未設定'}<span class="mobile-team">${teamBadge}</span></td>
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
}

// 詳細モーダル
function renderDetailSummary(user, stats) {
  const cur = stats.find(s => s.year_month === currentYearMonth) || {};
  const teamKey = (user.team || '').replace('.', '').replace('元リバティー', 'liberty');
  const teamBadge = user.team ? `<span class="team-badge team-${teamKey}">${user.team}</span>` : '';
  const g = (label, val) => `<div><span>${label}</span><b>${val}</b></div>`;
  document.getElementById('detailSummary').innerHTML = `
    <div class="detail-meta">${teamBadge}</div>
    <div class="detail-grid">
      ${g('今月ラン', (cur.run_distance_km || 0).toFixed(1) + 'km')}
      ${g('自転車', (cur.ride_distance_km || 0).toFixed(1) + 'km')}
      ${g('水泳', (cur.swim_distance_m || 0) + 'm')}
      ${g('獲得標高', (cur.elevation_gain_m || 0) + 'm')}
      ${g('心拍負荷', cur.relative_effort || 0)}
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
    if (s && type === 'run' && val > 0) {
      const z = [s.hr_z1_percent, s.hr_z2_percent, s.hr_z3_percent, s.hr_z4_percent, s.hr_z5_percent];
      const total = z.reduce((a, b) => a + b, 0);
      if (total > 0) {
        // 心拍ゾーンデータがある場合は色分け
        barHtml = z.map((v, i) => `<div class="bar-z${i+1}" style="width:${(v/total)*pct}%"></div>`).join('');
        // ホバー/タップ用のゾーン割合ツールチップ
        tips[idx] = `<strong>${label}</strong>　` + z.map((v, i) => `<span class="tz" style="color:${ZONE_COLORS[i]}">Z${i+1} ${v.toFixed(1)}%</span>`).join('');
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

async function loadChat() {
  const [y, mo] = currentYearMonth.split('-');
  document.getElementById('chatTitle').textContent = `💬 ${y}年${parseInt(mo)}月のひとこと掲示板`;
  if (currentUserId) {
    document.getElementById('chatInputRow').style.display = 'flex';
    document.getElementById('chatLoginNote').style.display = 'none';
  } else {
    document.getElementById('chatInputRow').style.display = 'none';
    document.getElementById('chatLoginNote').style.display = 'block';
  }
  const chatMessagesEl = document.getElementById('chatMessages');
  try {
    const res = await fetch(`${API_BASE}/api/chat?year_month=${currentYearMonth}`);
    const msgs = await res.json();
    if (!Array.isArray(msgs) || msgs.length === 0) {
      chatMessagesEl.innerHTML = '<p class="chat-empty">まだコメントはありません</p>';
      return;
    }
    chatMessagesEl.innerHTML = msgs.map(m => {
      const name = m.users?.nickname || '名無し';
      // created_atはUTC（タイムゾーン指示子なし）なのでZを付けてローカル時刻に変換
      const iso = (m.created_at.endsWith('Z') || m.created_at.includes('+')) ? m.created_at : m.created_at + 'Z';
      const dt = new Date(iso);
      const dateStr = `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      const delBtn = (currentUserId && String(m.user_id) === String(currentUserId)) ? `<button class="chat-del" data-id="${m.id}">削除</button>` : '';
      return `<div class="chat-msg">
        <div class="chat-msg-head"><span class="chat-name">${escapeHtml(name)}</span><span class="chat-time">${dateStr}${delBtn}</span></div>
        <div class="chat-msg-body">${escapeHtml(m.message)}</div>
      </div>`;
    }).join('');
    // 削除ボタン（本人の投稿のみ）
    chatMessagesEl.querySelectorAll('.chat-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('この投稿を削除しますか？')) return;
        try {
          const res = await fetch(`${API_BASE}/api/chat/${btn.dataset.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId })
          });
          if (res.ok) loadChat();
        } catch (e) {}
      });
    });
  } catch (e) {
    chatMessagesEl.innerHTML = '<p class="chat-empty">読み込みエラー</p>';
  }
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

// 初期化
updateMonthDisplay();
loadRanking();
