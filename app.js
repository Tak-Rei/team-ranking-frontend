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
  document.getElementById('rankingBody').innerHTML = '<tr><td colspan="12" class="loading">読み込み中...</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/api/ranking?year_month=${currentYearMonth}`);
    allData = await res.json();
    renderRanking();
  } catch (e) {
    document.getElementById('rankingBody').innerHTML = '<tr><td colspan="12" class="loading">読み込みエラー</td></tr>';
  }
}

function renderRanking() {
  let data = [...allData];

  if (currentTeamFilter !== 'all') {
    data = data.filter(d => d.users?.team === currentTeamFilter);
  }

  data.sort((a, b) => {
    let va = a[sortCol] ?? a.users?.[sortCol] ?? '';
    let vb = b[sortCol] ?? b.users?.[sortCol] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortAsc ? va - vb : vb - va;
    }
    return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const tbody = document.getElementById('rankingBody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="loading">データなし</td></tr>';
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
    const fullMara = u.privacy_full_marathon !== false ? (u.full_marathon_best || '') : '<span class="private">非公開</span>';
    const halfMara = u.privacy_half_marathon !== false ? (u.half_marathon_best || '') : '<span class="private">非公開</span>';

    return `<tr>
      <td class="rank ${rankClass}">${rank}</td>
      <td class="nickname tc" ondblclick="openDetail('${row.user_id}')">${u.nickname || '未設定'}</td>
      <td class="tc">${stravaName}</td>
      <td>${teamBadge}</td>
      <td class="num">${runKm}</td>
      <td class="num">${rideKm}</td>
      <td class="num">${swimM}</td>
      <td class="num">${re}</td>
      <td class="tc">${fullMara}</td>
      <td class="tc">${halfMara}</td>
      <td>${u.race || ''}</td>
      <td>${u.comment || ''}</td>
    </tr>`;
  }).join('');
}

// 詳細モーダル
async function openDetail(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/user/${userId}`);
    if (!res.ok) return;
    const { user, stats } = await res.json();

    document.getElementById('modalTitle').textContent = user.nickname;
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

function showDetailChart(stats, type) {
  const container = document.getElementById('detailChart');
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  // グラフの上限（固定）。ランニング800km / 自転車2000km / 水泳100000m
  const limits = { run: 800, ride: 2000, swim: 100000 };
  const maxVal = limits[type] || 800;

  container.innerHTML = months.map(m => {
    const s = stats.find(r => r.year_month === m);
    const val = s ? (type === 'run' ? s.run_distance_km : type === 'ride' ? s.ride_distance_km : s.swim_distance_m) : 0;
    const pct = (val / maxVal) * 100;
    const label = m.slice(5) + '月';
    const unit = type === 'swim' ? 'm' : 'km';

    let barHtml = '';
    if (s && type === 'run' && val > 0) {
      const z = [s.hr_z1_percent, s.hr_z2_percent, s.hr_z3_percent, s.hr_z4_percent, s.hr_z5_percent];
      const total = z.reduce((a, b) => a + b, 0);
      if (total > 0) {
        // 心拍ゾーンデータがある場合は色分け
        barHtml = z.map((v, i) => `<div class="bar-z${i+1}" style="width:${(v/total)*pct}%"></div>`).join('');
      } else {
        // 心拍ゾーンデータがない場合は単色
        barHtml = `<div class="bar-z2" style="width:${pct}%"></div>`;
      }
    } else {
      barHtml = `<div class="bar-z2" style="width:${pct}%"></div>`;
    }

    return `<div class="chart-row">
      <span class="chart-label">${label}</span>
      <div class="chart-bar-wrap">${barHtml}</div>
      <span class="chart-value">${val > 0 ? val.toFixed(1) + unit : '-'}</span>
    </div>`;
  }).join('');
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('detailModal').classList.remove('open');
});

// 初期化
updateMonthDisplay();
loadRanking();
