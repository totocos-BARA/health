'use strict';

/* ───────── 저장소 ───────── */
const KEY = 'diet.v1.';
const store = {
  get(k, d) {
    try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { toast('저장 공간이 부족해요'); }
  },
};

/* ───────── 기준값 ───────── */
const ACTIVITY = [
  { id: 'sedentary', name: '주로 앉아서 생활', desc: '사무직·학생', f: 1.2 },
  { id: 'light', name: '가볍게 움직임', desc: '서서 일하거나 자주 걸음', f: 1.375 },
  { id: 'moderate', name: '활동적인 생활', desc: '몸을 많이 쓰는 일', f: 1.55 },
  { id: 'active', name: '매우 활동적', desc: '육체노동·운동선수', f: 1.725 },
];
const GOALS = [
  { id: 'lose', name: '체중 감량', emoji: '📉', delta: -500 },
  { id: 'keep', name: '체중 유지', emoji: '⚖️', delta: 0 },
  { id: 'gain', name: '체중 증량', emoji: '📈', delta: 300 },
];
const MEALS = [
  { id: 'breakfast', name: '아침', emoji: '🌅' },
  { id: 'lunch', name: '점심', emoji: '☀️' },
  { id: 'dinner', name: '저녁', emoji: '🌙' },
  { id: 'snack', name: '간식', emoji: '🍪' },
];
const NUTR = [
  { k: 'carb', name: '탄수화물', unit: 'g', color: 'var(--carb)', emoji: '🍚', type: 'range' },
  { k: 'protein', name: '단백질', unit: 'g', color: 'var(--protein)', emoji: '🥩', type: 'range' },
  { k: 'fat', name: '지방', unit: 'g', color: 'var(--fat)', emoji: '🧈', type: 'range' },
  { k: 'sugar', name: '당류', unit: 'g', color: 'var(--sugar)', emoji: '🍬', type: 'limit' },
  { k: 'sodium', name: '나트륨', unit: 'mg', color: 'var(--sodium)', emoji: '🧂', type: 'limit' },
];
const NKEYS = ['kcal', 'carb', 'protein', 'fat', 'sugar', 'sodium'];
const KCAL_PER_KG = 7700;
const COPYRIGHT = `<p class="copyright">© ${new Date().getFullYear()} app by BARA with Claude</p>`;

/* ───────── 상태 ───────── */
const state = {
  profile: store.get('profile', null),
  logs: store.get('logs', {}),
  weights: store.get('weights', {}),
  custom: store.get('custom', []),
  recent: store.get('recent', []),
  a1c: store.get('a1c', {}),
  date: dateKey(new Date()),
  tab: 'today',
  foodCat: null,
  exCat: 'cardio',
  query: '',
  web: { q: '', loading: false, items: null, error: null },
};

/* ───────── 유틸 ───────── */
function $(s, el = document) { return el.querySelector(s); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(n, d = 0) { return Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: d }); }
function r1(n) { return Math.round(n * 10) / 10; }
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
function todayKey() { return dateKey(new Date()); }
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dateText(k) { const d = parseKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
function shortDate(k) { const d = parseKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; }
function timeText(t) { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

function save() {
  store.set('profile', state.profile);
  store.set('logs', state.logs);
  store.set('weights', state.weights);
  store.set('custom', state.custom);
  store.set('recent', state.recent);
  store.set('a1c', state.a1c);
}

function dayLog(k, create) {
  if (!state.logs[k] && create) state.logs[k] = { foods: [], ex: [] };
  return state.logs[k] || { foods: [], ex: [] };
}

/* ───────── 계산 ───────── */
function bmiInfo(bmi) {
  if (bmi < 18.5) return { name: '저체중', lvl: 'info', color: '#3b82f6' };
  if (bmi < 23) return { name: '정상', lvl: 'good', color: '#22c55e' };
  if (bmi < 25) return { name: '과체중', lvl: 'warn', color: '#eab308' };
  if (bmi < 30) return { name: '1단계 비만', lvl: 'danger', color: '#f97316' };
  if (bmi < 35) return { name: '2단계 비만', lvl: 'danger', color: '#ef4444' };
  return { name: '3단계 비만', lvl: 'danger', color: '#b91c1c' };
}

function calc(p) {
  if (!p || !(p.age > 0 && p.height > 0 && p.weight > 0)) return null;
  const h = p.height / 100;
  const bmi = p.weight / (h * h);
  // Mifflin-St Jeor 공식
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const act = ACTIVITY.find(a => a.id === p.activity) || ACTIVITY[0];
  const goal = GOALS.find(g => g.id === p.goal) || GOALS[1];
  const tdee = bmr * act.f;
  const kcal = Math.max(tdee + goal.delta, p.sex === 'm' ? 1500 : 1200);
  return {
    bmi, bmr, tdee, bmiInfo: bmiInfo(bmi),
    // 한국인 영양소 섭취기준을 참고한 비율: 탄수화물 55%, 단백질 20%, 지방 25%, 당류는 10% 이내
    target: {
      kcal,
      carb: kcal * 0.55 / 4,
      protein: Math.max(kcal * 0.2 / 4, p.weight * 0.9),
      fat: kcal * 0.25 / 9,
      sugar: kcal * 0.1 / 4,
      sodium: 2000,
    },
    healthyWeight: [18.5 * h * h, 22.9 * h * h],
  };
}

function totals(k) {
  const log = dayLog(k);
  const t = { kcal: 0, carb: 0, protein: 0, fat: 0, sugar: 0, sodium: 0, burn: 0, exMin: 0 };
  for (const f of log.foods) for (const n of NKEYS) t[n] += f[n] || 0;
  for (const e of log.ex) { t.burn += e.kcal; t.exMin += e.min; }
  t.steps = log.steps || 0;
  t.stepKcal = stepKcal(t.steps);
  t.burn += t.stepKcal;
  t.net = t.kcal - t.burn;
  return t;
}

function currentWeight() {
  return state.profile?.weight || 65;
}

// 기본 활동량(주로 앉아서 생활)에 이미 들어 있는 2,000보를 넘는 걸음만 더한다.
// 한 걸음에 체중 1kg당 약 0.0005kcal (70kg 기준 1만 보 ≈ 280kcal)
const BASE_STEPS = 2000;
function stepKcal(steps) {
  return Math.round(Math.max(0, steps - BASE_STEPS) * 0.0005 * currentWeight());
}

function exKcal(ex, intensity, min) {
  return ex.met[intensity] * currentWeight() * (min / 60);
}

function nutrStatus(pct, type, judgeLow) {
  if (type === 'limit') {
    if (pct > 100) return { t: '과다', c: 'b-danger' };
    if (pct > 80) return { t: '주의', c: 'b-warn' };
    return { t: '양호', c: 'b-good' };
  }
  if (pct > 120) return { t: '과다', c: 'b-danger' };
  if (pct > 105) return { t: '조금 많음', c: 'b-warn' };
  if (pct >= 80) return { t: '적정', c: 'b-good' };
  return judgeLow ? { t: '부족', c: 'b-warn' } : { t: '진행 중', c: 'b-muted' };
}

// 30분 이상 간격을 두고 먹은 횟수
function eatingEpisodes(foods) {
  const ts = foods.filter(f => f.kcal >= 30).map(f => f.t).sort((a, b) => a - b);
  let n = 0, last = -Infinity;
  for (const t of ts) { if (t - last > 30 * 60 * 1000) n++; last = t; }
  return n;
}

/* ───────── 당화혈색소(혈당) 관리 ───────── */
// 흰쌀·밀가루 위주라 혈당을 빨리 올리기 쉬운 카테고리
const FAST_CARB_CATS = ['rice', 'noodle', 'bread', 'bunsik', 'fastfood', 'chinese'];
const VEG_WORDS = ['나물', '샐러드', '채소', '야채', '브로콜리', '양배추', '버섯', '오이', '시금치'];

function latestA1c() {
  const e = Object.entries(state.a1c).sort((a, b) => a[0].localeCompare(b[0]));
  return e.length ? { date: e[e.length - 1][0], v: e[e.length - 1][1] } : null;
}

function a1cInfo(v) {
  if (v < 5.7) return { name: '정상', lvl: 'good' };
  if (v < 6.5) return { name: '당뇨 전단계', lvl: 'warn' };
  return { name: '당뇨 범위', lvl: 'danger' };
}

// 하루 식단이 혈당(당화혈색소)에 주는 부담을 0~100점으로 매긴다. 높을수록 좋다.
function glucoseCheck(k) {
  const c = calc(state.profile);
  const log = dayLog(k);
  if (!c || !log.foods.length) return null;
  const t = totals(k), T = c.target;
  let risk = 0;
  const bad = [], good = [];
  const sugarPct = t.sugar / T.sugar * 100;
  if (sugarPct > 150) { risk += 30; bad.push('당류를 너무 많이 먹었어요'); }
  else if (sugarPct > 100) { risk += 20; bad.push('당류가 권장량을 넘었어요'); }
  else if (sugarPct > 80) risk += 8;

  const carbShare = t.kcal ? t.carb * 4 / t.kcal : 0;
  if (t.kcal >= 500 && carbShare > 0.65) { risk += 15; bad.push('탄수화물 비중이 너무 높아요'); }
  else if (t.kcal >= 500 && carbShare > 0.6) risk += 8;
  const carbPct = t.carb / T.carb * 100;
  if (carbPct > 130) { risk += 12; bad.push('탄수화물을 많이 먹었어요'); }
  else if (carbPct > 110) risk += 6;

  // 시럽 없는 라떼의 당은 우유의 유당이라 단 음료로 치지 않는다
  const sweetDrinks = log.foods.filter(f => f.cat === 'drink' && f.sugar >= 10 && !f.name.includes('카페라떼')).length;
  if (sweetDrinks) { risk += Math.min(20, sweetDrinks * 10); bad.push('단 음료를 마셨어요'); }
  const sweets = log.foods.filter(f => f.cat !== 'drink' && f.sugar >= 15).length;
  if (sweets) { risk += Math.min(18, sweets * 6); bad.push('단 음식을 먹었어요'); }
  const fastCarbs = log.foods.filter(f => FAST_CARB_CATS.includes(f.cat) && f.carb >= 40).length;
  if (fastCarbs >= 3) { risk += 10; bad.push('밥·면·빵을 여러 번 먹었어요'); }

  const ep = eatingEpisodes(log.foods);
  const snacks = log.foods.filter(f => f.meal === 'snack' && f.kcal >= 30).length;
  if (ep >= 6 || snacks >= 4) { risk += 15; bad.push('너무 자주 먹었어요'); }
  else if (ep === 5) risk += 6;
  if (log.foods.some(f => { const h = new Date(f.t).getHours(); return (h >= 22 || h < 4) && f.carb >= 20; })) { risk += 8; bad.push('늦은 밤에 탄수화물을 먹었어요'); }

  if (log.foods.some(f => f.cat === 'healthy' || f.cat === 'side' || VEG_WORDS.some(w => f.name.includes(w)))) { risk -= 8; good.push('채소를 챙겼어요'); }
  if (t.protein / T.protein >= 0.8) { risk -= 5; good.push('단백질이 충분해요'); }
  if (t.exMin >= 30 || t.steps >= 7000) { risk -= 10; good.push('충분히 움직였어요'); }
  else if (t.exMin >= 15 || t.steps >= 5000) { risk -= 5; good.push('몸을 움직였어요'); }
  if (sugarPct <= 50 && !sweetDrinks) good.push('당류를 잘 줄였어요');

  const score = Math.round(clamp(100 - risk, 0, 100));
  const lvl = score >= 80 ? 'good' : score >= 65 ? 'info' : score >= 45 ? 'warn' : 'danger';
  const name = score >= 80 ? '좋아요' : score >= 65 ? '보통' : score >= 45 ? '주의' : '위험';
  return { score, lvl, name, bad, good };
}

// 최근 days일 동안의 혈당 관리 점수 평균 (끝나지 않은 오늘은 다른 기록이 있으면 뺀다)
function glucoseTrend(endKey, days = 14) {
  let list = Array.from({ length: days }, (_, i) => addDays(endKey, i - days + 1)).map(k => ({ k, g: glucoseCheck(k) })).filter(d => d.g);
  if (list.length > 1 && endKey === todayKey() && new Date().getHours() < 20) list = list.filter(d => d.k !== endKey);
  if (!list.length) return null;
  const avg = list.reduce((s, d) => s + d.g.score, 0) / list.length;
  const tally = {};
  for (const d of list) for (const b of d.g.bad) tally[b] = (tally[b] || 0) + 1;
  const causes = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
  return { days: list.length, avg, causes };
}

/* ───────── 경고 · 응원 메시지 ───────── */
function evaluate(k) {
  const c = calc(state.profile);
  const log = dayLog(k);
  const t = totals(k);
  const out = [];
  const isToday = k === todayKey();
  const dayDone = !isToday || new Date().getHours() >= 20;
  const add = (lvl, e, title, d) => out.push({ lvl, e, title, d });

  if (!c) {
    add('info', '👤', '내 정보를 먼저 입력해 주세요', '나이·키·몸무게를 넣으면 권장 칼로리와 영양소를 계산해 드려요.');
    return out;
  }
  const T = c.target;
  const pct = n => (t[n] / T[n]) * 100;
  const kcalPct = (t.net / T.kcal) * 100;

  if (!log.foods.length) {
    add('info', '🍽️', isToday ? '오늘 먹은 음식을 기록해 보세요' : '이 날은 음식 기록이 없어요', '카테고리에서 고르거나 음식 이름을 검색하면 돼요.');
  }

  // 칼로리
  if (kcalPct > 120) add('danger', '🚨', '칼로리를 너무 많이 먹었어요', `권장량의 ${fmt(kcalPct)}%예요. 이렇게 먹으면 살찔 수 있어요. 가벼운 운동을 추천해요.`);
  else if (kcalPct > 105) add('warn', '⚠️', '권장 칼로리를 넘었어요', `${fmt(t.net - T.kcal)}kcal 초과했어요. 남은 식사는 가볍게 드세요.`);
  else if (dayDone && log.foods.length && kcalPct < 60) add('warn', '🥺', '너무 적게 먹었어요', '굶으면 근육이 빠지고 요요가 오기 쉬워요. 골고루 챙겨 드세요.');

  // 식사 빈도 · 당류
  const ep = eatingEpisodes(log.foods);
  const snacks = log.foods.filter(f => f.meal === 'snack' && f.kcal >= 30).length;
  if (ep >= 6 || snacks >= 4) add('danger', '🩸', '너무 자주 먹어요. 당뇨의 위험이 있어요.', `오늘 ${ep}번 나눠 먹었어요. 잦은 섭취는 혈당을 계속 높여요.`);
  if (pct('sugar') > 100) add('danger', '🍬', '당류가 너무 많아요', `당류 ${fmt(t.sugar)}g (하루 권장 ${fmt(T.sugar)}g 이하). 당뇨의 위험이 있어요. 단 음료부터 줄여 보세요.`);
  else if (pct('sugar') > 80) add('warn', '🍭', '당류가 한도에 가까워요', '오늘은 단 음식과 음료를 피하는 게 좋아요.');

  // 혈관 건강: 나트륨 · 지방
  const vesselBad = pct('sodium') > 100 || pct('fat') > 120;
  if (vesselBad) {
    const why = [];
    if (pct('sodium') > 100) why.push(`나트륨 ${fmt(t.sodium)}mg`);
    if (pct('fat') > 120) why.push(`지방 ${fmt(t.fat)}g`);
    add(pct('sodium') > 150 || pct('fat') > 150 ? 'danger' : 'warn', '🫀', '이렇게 먹으면 혈관에 좋지 않아요', `${why.join(', ')}로 권장량을 넘었어요. 국물은 남기고 튀김은 줄여 보세요.`);
  }

  // 당화혈색소
  const g = glucoseCheck(k);
  const a1c = latestA1c();
  if (g) {
    const extra = a1c && a1c.v >= 5.7 ? ` 당화혈색소가 ${a1c.v}%라 더 신경 써 주세요.` : '';
    if (g.lvl === 'danger') add('danger', '🩸', '이렇게 먹으면 당화혈색소가 올라갈 수 있어요', `${g.bad.slice(0, 3).join(', ')}.${extra} 식후 10분만 걸어도 혈당이 덜 올라가요.`);
    else if (g.lvl === 'warn') add('warn', '📈', '당화혈색소 관리에 신경 써 주세요', `${g.bad.slice(0, 2).join(', ')}.${extra} 단 음료는 물로, 흰밥은 잡곡으로 바꿔 보세요.`);
    else if (g.lvl === 'good' && (dayDone || log.foods.length >= 2)) add('good', '💚', '혈당 관리 잘 하고 있어요!', `오늘 식단은 당화혈색소 관리에 좋아요.${g.good.length ? ' ' + g.good.slice(0, 2).join(', ') + '.' : ''}`);
  }

  // 늦은 밤
  const late = log.foods.filter(f => { const h = new Date(f.t).getHours(); return (h >= 22 || h < 4) && f.kcal >= 100; });
  if (late.length) add('warn', '🌙', '늦은 밤에 먹었어요', '밤늦게 먹은 음식은 지방으로 쌓이기 쉬워요.');

  // 단백질 부족
  if (dayDone && log.foods.length && pct('protein') < 70) add('warn', '🥚', '단백질이 부족해요', '계란·두부·닭가슴살·생선으로 채워 보세요.');

  // 체형(BMI)
  const bi = c.bmiInfo;
  if (c.bmi >= 25) add('danger', '⚖️', '식단 관리가 필요해요', `BMI ${r1(c.bmi)}로 ${bi.name} 범위예요. 비만 위험이 있어요.`);
  else if (c.bmi >= 23) add('warn', '⚖️', '식단 관리가 필요해요', `BMI ${r1(c.bmi)}로 과체중 범위예요. 조금만 더 신경 쓰면 정상 범위예요.`);
  else if (c.bmi < 18.5) add('info', '🌱', '조금 더 잘 챙겨 드세요', `BMI ${r1(c.bmi)}로 저체중이에요. 골고루 충분히 드세요.`);

  // 응원
  if (t.burn > 0) {
    const parts = [];
    if (t.exMin) parts.push(`${fmt(t.exMin)}분 운동`);
    if (t.steps) parts.push(`${fmt(t.steps)}보 걷기`);
    add('good', t.burn >= 300 ? '🏆' : '💪', t.burn >= 300 ? '활동 최고예요!' : '잘 움직였어요!', `${parts.join('와 ')}로 ${fmt(t.burn)}kcal를 더 썼어요.`);
  }
  if (t.steps >= 10000) add('good', '👣', '만 보 달성!', '꾸준히 걷는 것만으로도 혈관과 혈당에 좋아요.');
  const healthy = log.foods.some(f => f.cat === 'fruit' || f.cat === 'healthy' || f.name.includes('나물') || f.name.includes('샐러드'));
  if (healthy) add('good', '🥦', '건강한 음식을 챙겼어요', '채소·과일·건강식은 혈관과 장에 좋아요.');
  if (log.foods.length && !out.some(m => m.lvl === 'danger' || m.lvl === 'warn')) {
    add('good', '🎉', '잘 하고 있어요!', kcalPct >= 80 ? '칼로리와 영양소 균형이 아주 좋아요.' : `아직 ${fmt(T.kcal - t.net)}kcal 더 먹을 수 있어요.`);
  }

  const order = { danger: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
}

/* ───────── 그래픽 ───────── */
function mascot(mood) {
  const c = {
    good: ['#86efac', '#16a34a'], warn: ['#fde68a', '#d97706'],
    danger: ['#fecaca', '#dc2626'], info: ['#bbf7d0', '#22c55e'],
  }[mood] || ['#bbf7d0', '#22c55e'];
  const mouth = mood === 'danger'
    ? '<path d="M39 68 q11 -9 22 0" />'
    : mood === 'warn' ? '<path d="M40 65 q10 3 20 -1" />' : '<path d="M37 60 q13 14 26 0" />';
  const extra = mood === 'danger'
    ? '<path d="M80 30 q5 8 0 12 q-5 -4 0 -12z" fill="#60a5fa"/>'
    : mood === 'good' ? '<g fill="#facc15"><path d="M14 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M86 16 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z"/></g>' : '';
  const brows = mood === 'danger' ? '<path d="M31 38 l10 4 M69 38 l-10 4" />' : '';
  return `<svg class="mascot" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="mgrad" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".3" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="95" rx="26" ry="3.5" fill="#000" opacity=".1"/>
    <g class="bob">
      <path d="M50 24 C50 16 53 9 60 5 C61 13 57 20 50 24z" fill="#16a34a"/>
      <path d="M50 26 C44 21 35 19 27 21 C13 25 9 41 11 55 C14 76 29 91 50 91 C71 91 86 76 89 55 C91 41 87 25 73 21 C65 19 56 21 50 26z" fill="url(#mgrad)"/>
      <g class="blink"><ellipse cx="38" cy="49" rx="4.6" ry="6.2" fill="#1f2937"/><ellipse cx="62" cy="49" rx="4.6" ry="6.2" fill="#1f2937"/></g>
      <circle cx="39.6" cy="46.5" r="1.6" fill="#fff"/><circle cx="63.6" cy="46.5" r="1.6" fill="#fff"/>
      <ellipse cx="28" cy="60" rx="5.5" ry="3.2" fill="#fb7185" opacity=".45"/><ellipse cx="72" cy="60" rx="5.5" ry="3.2" fill="#fb7185" opacity=".45"/>
      <g fill="none" stroke="#1f2937" stroke-width="3.4" stroke-linecap="round">${mouth}${brows}</g>
      ${extra}
    </g></svg>`;
}

function ring(pct, color) {
  const r = 64, C = 2 * Math.PI * r;
  const main = clamp(pct, 0, 100);
  const over = clamp(pct - 100, 0, 100);
  return `<div class="ring"><svg viewBox="0 0 150 150">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color[0]}"/><stop offset="1" stop-color="${color[1]}"/></linearGradient></defs>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="14"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - main / 100)}"/>
    ${over > 0 ? `<circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--danger)" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - over / 100)}"/>` : ''}
  </svg>`;
}

function bmiGauge(bmi) {
  const min = 15, max = 35, W = 300;
  const x = v => ((clamp(v, min, max) - min) / (max - min)) * W;
  const segs = [[15, 18.5, '#60a5fa', '저체중'], [18.5, 23, '#4ade80', '정상'], [23, 25, '#facc15', '과체중'], [25, 30, '#fb923c', '비만'], [30, 35, '#ef4444', '고도비만']];
  const px = x(bmi);
  return `<div class="gauge"><svg viewBox="-6 0 312 62">
    ${segs.map(([a, b, col, name], i) => `<rect x="${x(a) + (i ? 1 : 0)}" y="22" width="${x(b) - x(a) - (i ? 1 : 0)}" height="12" rx="3" fill="${col}"/>
      <text x="${(x(a) + x(b)) / 2}" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">${name}</text>`).join('')}
    ${[18.5, 23, 25, 30].map(v => `<text x="${x(v)}" y="60" text-anchor="middle" font-size="8.5" fill="var(--muted)">${v}</text>`).join('')}
    <g transform="translate(${px},0)"><path d="M-6 8 h12 l-6 9z" fill="var(--text)"/><text y="6" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">${r1(bmi)}</text></g>
  </svg></div>`;
}

function weekChart(endKey, c) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(endKey, i - 6));
  const data = days.map(k => ({ k, t: totals(k), has: !!(state.logs[k]?.foods?.length || state.logs[k]?.ex?.length) }));
  const target = c ? c.target.kcal : 2000;
  const maxV = Math.max(target * 1.3, ...data.map(d => d.t.kcal)) || 1;
  const W = 340, H = 190, top = 14, bottom = 28, left = 6, h = H - top - bottom;
  const colW = (W - left) / 7;
  const y = v => top + h - (v / maxV) * h;
  const bars = data.map((d, i) => {
    const cx = left + colW * i + colW / 2;
    const over = d.t.kcal > target * 1.05;
    const ih = (d.t.kcal / maxV) * h, bh = (d.t.burn / maxV) * h;
    const isSel = d.k === endKey;
    return `
      ${d.has ? '' : `<rect x="${cx - 13}" y="${top + h - 3}" width="26" height="3" rx="1.5" fill="var(--line)"/>`}
      <rect x="${cx - 15}" y="${top + h - ih}" width="18" height="${ih}" rx="5" fill="${over ? 'url(#cOver)' : 'url(#cOk)'}"/>
      ${bh ? `<rect x="${cx + 5}" y="${top + h - bh}" width="10" height="${bh}" rx="4" fill="var(--burn)" opacity=".85"/>` : ''}
      ${d.t.kcal ? `<text x="${cx - 6}" y="${top + h - ih - 4}" text-anchor="middle" font-size="9">${fmt(d.t.kcal)}</text>` : ''}
      <text x="${cx}" y="${H - 10}" text-anchor="middle" class="${isSel ? 'today-lbl' : ''}">${WD[parseKey(d.k).getDay()]}</text>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="cOk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient>
      <linearGradient id="cOver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/></linearGradient>
    </defs>
    <line x1="${left}" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="var(--primary)" stroke-dasharray="5 4" stroke-width="1.5"/>
    <text x="${left + 2}" y="${y(target) - 4}" font-size="9.5" style="fill:var(--primary)">목표 ${fmt(target)}</text>
    ${bars}
  </svg></div>`;
}

function riskMeter(monthKg) {
  // -2kg ~ +2kg/월 범위를 반원 게이지로 표시
  const v = clamp(monthKg ?? 0, -2, 2);
  const ang = Math.PI * (1 - (v + 2) / 4);
  const cx = 55, cy = 55, r = 42;
  const nx = cx + Math.cos(ang) * (r - 8), ny = cy - Math.sin(ang) * (r - 8);
  const arc = (a0, a1, col) => {
    const p0 = [cx + Math.cos(a0) * r, cy - Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy - Math.sin(a1) * r];
    return `<path d="M${p0[0]} ${p0[1]} A${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}" stroke="${col}" stroke-width="12" fill="none"/>`;
  };
  return `<div class="meter"><svg viewBox="0 0 110 66">
    ${arc(Math.PI, Math.PI * 0.62, '#60a5fa')}${arc(Math.PI * 0.6, Math.PI * 0.4, '#4ade80')}${arc(Math.PI * 0.38, Math.PI * 0.2, '#facc15')}${arc(Math.PI * 0.18, 0, '#ef4444')}
    ${monthKg == null ? '' : `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--text)" stroke-width="3.5" stroke-linecap="round"/>`}
    <circle cx="${cx}" cy="${cy}" r="5" fill="var(--text)"/>
  </svg></div>`;
}

function a1cGauge(v) {
  const min = 4, max = 10, W = 300;
  const x = n => ((clamp(n, min, max) - min) / (max - min)) * W;
  const segs = [[4, 5.7, '#4ade80', '정상'], [5.7, 6.5, '#facc15', '전단계'], [6.5, 8, '#fb923c', '당뇨'], [8, 10, '#ef4444', '관리 필요']];
  return `<div class="gauge"><svg viewBox="-6 0 312 62">
    ${segs.map(([a, b, col, name], i) => `<rect x="${x(a) + (i ? 1 : 0)}" y="22" width="${x(b) - x(a) - (i ? 1 : 0)}" height="12" rx="3" fill="${col}"/>
      <text x="${(x(a) + x(b)) / 2}" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">${name}</text>`).join('')}
    ${[5.7, 6.5, 8].map(n => `<text x="${x(n)}" y="60" text-anchor="middle" font-size="8.5" fill="var(--muted)">${n}%</text>`).join('')}
    ${v == null ? '' : `<g transform="translate(${x(v)},0)"><path d="M-6 8 h12 l-6 9z" fill="var(--text)"/><text y="6" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">${v}%</text></g>`}
  </svg></div>`;
}

// 최근 14일 혈당 관리 점수 막대
function glucoseChart(endKey) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(endKey, i - 13));
  const W = 340, H = 120, top = 12, bottom = 20, h = H - top - bottom, colW = W / 14;
  const col = { good: '#22c55e', info: '#60a5fa', warn: '#f59e0b', danger: '#ef4444' };
  const y = v => top + h - (v / 100) * h;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">
    <line x1="0" x2="${W}" y1="${y(80)}" y2="${y(80)}" stroke="var(--good)" stroke-dasharray="4 4"/>
    <text x="2" y="${y(80) - 3}" font-size="9" style="fill:var(--good)">좋아요 80</text>
    ${days.map((k, i) => {
      const g = glucoseCheck(k), cx = colW * i + colW / 2;
      const lbl = i % 2 === 1 || i === 13 ? `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="9" class="${k === endKey ? 'today-lbl' : ''}">${parseKey(k).getDate()}</text>` : '';
      if (!g) return `<rect x="${cx - 6}" y="${top + h - 3}" width="12" height="3" rx="1.5" fill="var(--line)"/>${lbl}`;
      return `<rect x="${cx - 7}" y="${y(g.score)}" width="14" height="${Math.max(3, (g.score / 100) * h)}" rx="4" fill="${col[g.lvl]}"/>${lbl}`;
    }).join('')}
  </svg></div>`;
}

function sparkline(points) {
  if (points.length < 2) return '';
  const W = 320, H = 70, p = 8;
  const vals = points.map(p => p[1]);
  const mn = Math.min(...vals) - 0.5, mx = Math.max(...vals) + 0.5;
  const x = i => p + (i / (points.length - 1)) * (W - p * 2);
  const y = v => p + (1 - (v - mn) / (mx - mn)) * (H - p * 2);
  const d = points.map((pt, i) => `${i ? 'L' : 'M'}${x(i)} ${y(pt[1])}`).join(' ');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H + 14}">
    <defs><linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".3"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${x(points.length - 1)} ${H} L${x(0)} ${H}z" fill="url(#wl)"/>
    <path d="${d}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((pt, i) => `<circle cx="${x(i)}" cy="${y(pt[1])}" r="3" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"/>`).join('')}
    <text x="${x(0)}" y="${H + 12}" font-size="10">${shortDate(points[0][0])}</text>
    <text x="${x(points.length - 1)}" y="${H + 12}" text-anchor="end" font-size="10">${shortDate(points[points.length - 1][0])}</text>
  </svg></div>`;
}

/* ───────── 화면: 오늘 ───────── */
function renderToday() {
  const el = $('#view-today');
  const c = calc(state.profile);
  if (!c) {
    el.innerHTML = `
      <div class="card welcome">
        <div class="logo"><img src="icons/icon.svg" alt="" width="84" height="84"></div>
        <h1>식단 관리를 시작해요</h1>
        <p>나이·키·몸무게만 입력하면<br>하루 권장 칼로리와 영양소를 계산해 드려요.</p>
        <div class="hero" style="justify-content:center;margin:10px 0">${mascot('good')}</div>
        <button class="btn primary block" data-go="profile">내 정보 입력하기</button>
      </div>
      ${COPYRIGHT}`;
    return;
  }
  const k = state.date;
  const t = totals(k);
  const T = c.target;
  const log = dayLog(k);
  const msgs = evaluate(k);
  const top = msgs.find(m => m.lvl === 'danger') || msgs.find(m => m.lvl === 'warn') || msgs.find(m => m.lvl === 'good') || msgs[0];
  const mood = top ? top.lvl : 'info';
  const pct = (t.net / T.kcal) * 100;
  const remain = T.kcal - t.net;
  const ringColor = pct > 105 ? ['#fb923c', '#dc2626'] : pct >= 80 ? ['#4ade80', '#15803d'] : ['#a3e635', '#22c55e'];
  const judgeLow = k !== todayKey() || new Date().getHours() >= 20;

  el.innerHTML = `
    <div class="card hero mood-${mood}">
      ${mascot(mood)}
      <div class="bubble">${esc(top ? top.title : '오늘도 건강하게!')}</div>
    </div>

    <div class="card">
      <h2>🔥 칼로리 <span class="sub">목표 ${fmt(T.kcal)}kcal</span></h2>
      <div class="ring-wrap">
        ${ring(pct, ringColor)}
          <div class="center"><span>${remain >= 0 ? '남은 칼로리' : '초과'}</span><b style="color:${remain >= 0 ? 'var(--text)' : 'var(--danger)'}">${fmt(Math.abs(remain))}</b><span>${fmt(Math.max(0, pct))}% 섭취</span></div>
        </div>
        <div class="kcal-stats">
          <div class="kstat"><div class="ico" style="background:var(--primary-soft)">🍽️</div><div><div class="lbl">먹은 칼로리</div><div class="val">${fmt(t.kcal)} kcal</div></div></div>
          <div class="kstat"><div class="ico" style="background:color-mix(in srgb,var(--burn) 18%,var(--surface))">🔥</div><div><div class="lbl">운동·활동 소모</div><div class="val">−${fmt(t.burn)} kcal</div></div></div>
          <div class="kstat"><div class="ico" style="background:var(--surface-2)">⚖️</div><div><div class="lbl">순 섭취</div><div class="val">${fmt(t.net)} kcal</div></div></div>
        </div>
      </div>
    </div>

    <div class="quick">
      <button class="q-food" data-go="food"><span>🍱</span>음식 기록</button>
      <button class="q-ex" data-go="exercise"><span>🏃</span>운동 기록</button>
      <button class="q-steps" data-paste-steps><span>👣</span>${t.steps ? `걸음 수 ${fmt(t.steps)}보 · 다시 붙여넣기` : '건강 앱 걸음 수 붙여넣기'}</button>
    </div>

    <div class="card">
      <h2>🥗 영양소 <span class="sub">권장량 대비</span></h2>
      ${NUTR.map(n => {
        const p = (t[n.k] / T[n.k]) * 100;
        const st = nutrStatus(p, n.type, judgeLow);
        const w = clamp(p, 0, 100) / 100 * (n.type === 'limit' ? 100 : 100 / 1.3);
        const overW = n.type === 'limit' ? 0 : clamp(p - 100, 0, 30) / 1.3;
        return `<div class="nutr">
          <div class="nutr-head"><span>${n.emoji}</span><span class="name">${n.name}</span>
            <span class="amt">${fmt(t[n.k])} / ${fmt(T[n.k])}${n.unit}${n.type === 'limit' ? ' 이하' : ''} · ${fmt(p)}%</span>
            <span class="badge ${st.c}">${st.t}</span></div>
          <div class="bar">
            <i style="width:${n.type === 'limit' && p > 100 ? 100 : w}%;background:${n.type === 'limit' && p > 100 ? 'var(--danger)' : n.color}"></i>
            ${overW ? `<i class="over" style="left:${100 / 1.3}%;width:${overW}%"></i>` : ''}
            ${n.type === 'range' ? `<span class="bar-mark" style="left:${100 / 1.3}%"></span>` : ''}
          </div></div>`;
      }).join('')}
    </div>

    ${(() => {
      const g = glucoseCheck(k);
      if (!g) return '';
      return `<button class="card glu-card" data-go="history">
        <div class="glu-head"><span>🩸 혈당 관리 점수</span><span class="badge b-${g.lvl}">${g.name}</span><b>${g.score}<small>점</small></b></div>
        <div class="bar"><i style="width:${g.score}%;background:var(--${g.lvl === 'info' ? 'info' : g.lvl === 'good' ? 'good' : g.lvl})"></i></div>
        <p class="small muted">당화혈색소 관리를 위한 식단 점수예요. 자세히 보기 ›</p></button>`;
    })()}

    <div class="section-title">💬 오늘의 건강 체크</div>
    <div class="msgs">${msgs.map(m => `<div class="msg ${m.lvl}"><span class="e">${m.e}</span><div><b>${esc(m.title)}</b>${esc(m.d)}</div></div>`).join('')}</div>

    <div class="section-title">🍱 먹은 음식 <span class="sub">${log.foods.length}개 · ${fmt(t.kcal)}kcal</span></div>
    <div class="card">${foodLogHTML(log.foods)}</div>

    <div class="section-title">🏃 운동·활동 <span class="sub">${fmt(t.exMin)}분${t.steps ? ` · ${fmt(t.steps)}보` : ''} · ${fmt(t.burn)}kcal</span></div>
    <div class="card">${exLogHTML(log)}</div>
    ${COPYRIGHT}
  `;
}

function foodLogHTML(foods) {
  if (!foods.length) return `<div class="empty"><span class="big">🍽️</span>아직 기록한 음식이 없어요<br><button class="btn primary" style="margin-top:10px" data-go="food">음식 추가</button></div>`;
  return MEALS.map(m => {
    const list = foods.filter(f => f.meal === m.id).sort((a, b) => a.t - b.t);
    if (!list.length) return '';
    return `<div class="meal-head"><span>${m.emoji} ${m.name}</span><span>${fmt(list.reduce((s, f) => s + f.kcal, 0))}kcal</span></div>
      <div class="log-list">${list.map(f => `
        <div class="log-item"><div class="em">${esc(f.emoji)}</div>
          <div class="info"><b>${esc(f.name)}</b><span>${esc(f.amount)} · ${timeText(f.t)} · 탄${fmt(f.carb)} 단${fmt(f.protein)} 지${fmt(f.fat)}</span></div>
          <div class="kc">${fmt(f.kcal)}</div>
          <button class="del" data-del-food="${f.id}" aria-label="삭제">✕</button></div>`).join('')}</div>`;
  }).join('');
}

function exLogHTML(log) {
  const ex = log.ex;
  const steps = log.steps ? `
    <div class="log-item"><div class="em">👣</div>
      <div class="info"><b>걸음 수 ${fmt(log.steps)}보</b><span>일상 활동 · 기본 ${fmt(BASE_STEPS)}보 초과분만 계산</span></div>
      <div class="kc" style="color:var(--burn)">−${fmt(stepKcal(log.steps))}</div>
      <button class="del" data-del-steps aria-label="삭제">✕</button></div>` : '';
  if (!ex.length && !steps) return `<div class="empty"><span class="big">👟</span>오늘 운동 기록이 없어요<br><button class="btn" style="margin-top:10px" data-go="exercise">운동 추가</button></div>`;
  return `<div class="log-list">${steps}${ex.map(e => `
    <div class="log-item"><div class="em">${esc(e.emoji)}</div>
      <div class="info"><b>${esc(e.name)}</b><span>${INTENSITIES[e.intensity].name} · ${e.min}분 · ${timeText(e.t)}</span></div>
      <div class="kc" style="color:var(--burn)">−${fmt(e.kcal)}</div>
      <button class="del" data-del-ex="${e.id}" aria-label="삭제">✕</button></div>`).join('')}</div>`;
}

/* ───────── 화면: 음식 ───────── */
function allFoods() { return [...state.custom, ...FOODS]; }
function matches(f, nq) { return norm(f.name).includes(nq) || (f.alias && norm(f.alias).includes(nq)); }

function renderFood() {
  const el = $('#view-food');
  const q = state.query.trim();
  const log = dayLog(state.date);
  let body = '';
  if (q) {
    const nq = norm(q);
    const local = allFoods().filter(f => matches(f, nq)).slice(0, 40);
    const w = state.web;
    body = `
      <div class="result-list">
        ${local.length ? `<div class="web-head">📒 내장 음식 사전 · 1인분 기준</div>${local.map(resultHTML).join('')}` : `<div class="empty">내장 사전에 "${esc(q)}"이(가) 없어요</div>`}
      </div>
      <div class="result-list">
        <div class="web-head">🌐 인터넷 검색 (Open Food Facts) ${w.loading ? '<span class="spinner"></span>' : ''}</div>
        ${w.q !== q ? `<div style="padding:4px 0 12px"><button class="btn block" data-web-search>🔎 "${esc(q)}" 인터넷에서 영양정보 찾기</button></div>` :
          w.loading ? '<div class="empty">찾는 중…</div>' :
          w.error ? `<div class="empty">${esc(w.error)}<br><button class="btn" style="margin-top:8px" data-web-search>다시 시도</button></div>` :
          w.items && w.items.length ? w.items.map(webResultHTML).join('') :
          '<div class="empty">인터넷에서도 찾지 못했어요</div>'}
      </div>
      <button class="btn block" data-manual>✏️ "${esc(q)}" 직접 입력하기</button>`;
  } else if (state.foodCat) {
    const cat = FOOD_CATEGORIES.find(c => c.id === state.foodCat);
    const items = allFoods().filter(f => f.cat === state.foodCat);
    body = `
      <div class="back-bar">
        <button class="back-btn" data-cat-back><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>뒤로</button>
        <h2>${cat.emoji} ${cat.name}</h2>
      </div>
      <div class="item-grid">${items.map(f => `
        <button class="item-tile" data-food="${f.id}"><span class="em">${esc(f.emoji)}</span><b>${esc(f.name)}</b><span>${fmt(f.kcal)}kcal · ${esc(f.serving)}</span></button>`).join('')}
      </div>`;
  } else {
    const recent = state.recent.slice(0, 8);
    body = `
      ${recent.length ? `<div class="section-title">🕘 최근 먹은 음식</div>
        <div class="chips">${recent.map((f, i) => `<button class="chip" data-recent="${i}">${esc(f.emoji)} ${esc(f.name)}</button>`).join('')}</div>` : ''}
      <div class="section-title">📂 카테고리에서 고르기</div>
      <div class="cat-grid">${FOOD_CATEGORIES.map(c => `
        <button class="cat-tile" data-cat="${c.id}"><span class="em" style="background:${c.color}33">${c.emoji}</span>${c.name}</button>`).join('')}
        <button class="cat-tile" data-manual><span class="em" style="background:var(--surface-2)">✏️</span>직접 입력</button>
      </div>`;
  }
  // 한글 입력(조합) 중 입력창이 다시 그려지지 않도록 검색창은 한 번만 만든다
  if (!$('#foodSearch', el)) {
    el.innerHTML = `
      <div class="search">
        <label class="field"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input id="foodSearch" type="search" enterkeyhint="search" placeholder="음식 이름 검색 (예: 김치찌개)" autocomplete="off"></label>
      </div>
      <div id="foodBody"></div>`;
  }
  const inp = $('#foodSearch', el);
  if (inp.value !== state.query) inp.value = state.query;
  $('#foodBody', el).innerHTML = `
    ${body}
    <div class="section-title">📋 ${state.date === todayKey() ? '오늘' : dateText(state.date)} 먹은 음식 <span class="sub">${fmt(totals(state.date).kcal)}kcal</span></div>
    <div class="card">${foodLogHTML(log.foods)}</div>`;
}

function resultHTML(f) {
  return `<button class="result" data-food="${f.id}"><span class="em">${esc(f.emoji)}</span>
    <span class="info"><b>${esc(f.name)}</b><span>${esc(f.serving)} · 탄${fmt(f.carb)} 단${fmt(f.protein)} 지${fmt(f.fat)}</span></span>
    <span class="kc">${fmt(f.kcal)}kcal</span></button>`;
}
function webResultHTML(f, i) {
  return `<button class="result" data-web="${i}"><span class="em">${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy">` : '🛒'}</span>
    <span class="info"><b>${esc(f.name)}</b><span>${f.brand ? esc(f.brand) + ' · ' : ''}100g당 탄${fmt(f.per100.carb)} 단${fmt(f.per100.protein)} 지${fmt(f.per100.fat)}</span></span>
    <span class="kc">${fmt(f.per100.kcal)}kcal<br><small class="muted">/100g</small></span></button>`;
}

async function webSearch(q) {
  state.web = { q, loading: true, items: null, error: null };
  renderFood();
  const fields = 'product_name,product_name_ko,product_name_en,brands,nutriments,serving_quantity,image_front_small_url,categories_tags';
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${fields}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    if (!navigator.onLine) throw new Error('offline');
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const json = await res.json();
    const items = (json.products || []).map(parseOFF).filter(Boolean);
    if (state.web.q === q) state.web = { q, loading: false, items, error: null };
  } catch (e) {
    if (state.web.q === q) state.web = { q, loading: false, items: null, error: navigator.onLine ? '검색 서버가 응답하지 않아요.' : '인터넷에 연결되어 있지 않아요.' };
  } finally {
    clearTimeout(timer);
  }
  if (state.tab === 'food' && state.query.trim() === q) renderFood();
}

function parseOFF(p) {
  const n = p.nutriments || {};
  // 술은 기록하지 않으므로 인터넷 검색 결과에서도 뺀다.
  if ((p.categories_tags || []).some(t => t.includes('alcoholic-beverages') && !t.includes('non-alcoholic')) || Number(n.alcohol_100g) > 0.5) return null;
  const name = (p.product_name_ko || p.product_name || p.product_name_en || '').trim();
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
  if (!name || kcal == null || isNaN(kcal)) return null;
  const num = v => (v == null || isNaN(v) ? 0 : Number(v));
  const sodium = n.sodium_100g != null ? num(n.sodium_100g) * 1000 : num(n.salt_100g) * 400;
  return {
    name, brand: (p.brands || '').split(',')[0].trim(), img: p.image_front_small_url || '',
    serving: Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100,
    per100: { kcal: num(kcal), carb: num(n.carbohydrates_100g), protein: num(n.proteins_100g), fat: num(n.fat_100g), sugar: num(n.sugars_100g), sodium },
  };
}

/* ───────── 화면: 운동 ───────── */
function renderExercise() {
  const el = $('#view-exercise');
  const log = dayLog(state.date);
  const t = totals(state.date);
  const list = EXERCISES.filter(e => e.cat === state.exCat);
  el.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:14px">
      <div style="font-size:40px">🔥</div>
      <div style="flex:1"><div class="muted small">${state.date === todayKey() ? '오늘' : dateText(state.date)} 운동·활동으로 쓴 칼로리</div>
        <div style="font-size:26px;font-weight:800;color:var(--burn)">${fmt(t.burn)} kcal</div>
        <div class="muted small">${fmt(t.exMin)}분 운동${t.steps ? ` · ${fmt(t.steps)}보` : ''} · 체중 ${fmt(currentWeight(), 1)}kg 기준</div></div>
    </div>
    <div class="card">
      <h2>👣 일상 활동 (걸음 수) <span class="sub">${t.steps ? `−${fmt(t.stepKcal)}kcal` : ''}</span></h2>
      <p class="small muted" style="margin:-4px 0 10px">휴대폰 건강 앱(아이폰 건강, 삼성 헬스 등)에 나온 오늘 걸음 수를 넣으면 출퇴근·장보기처럼 운동이 아닌 움직임도 반영돼요.</p>
      <div class="search" style="margin:0">
        <label class="field"><span>👣</span><input id="stepsInput" type="number" inputmode="numeric" min="0" step="100" placeholder="예: 8000" value="${t.steps || ''}"></label>
        <button class="btn primary" data-save-steps>저장</button>
      </div>
      <button class="btn block" style="margin-top:8px" data-paste-steps>📋 복사한 걸음 수 붙여넣기 (단축어)</button>
      <p class="small muted" style="margin:8px 0 0">걸음 수로 넣은 걷기는 운동에 '걷기'로 또 넣지 마세요.</p>
    </div>
    <div class="chips">${EXERCISE_CATEGORIES.map(c => `<button class="chip ${c.id === state.exCat ? 'active' : ''}" data-excat="${c.id}">${c.emoji} ${c.name}</button>`).join('')}</div>
    <div class="item-grid">${list.map(e => `
      <button class="item-tile" data-ex="${e.id}"><span class="em">${e.emoji}</span><b>${e.name}</b>
        <span>30분 ${fmt(exKcal(e, 0, 30))}~${fmt(exKcal(e, 2, 30))}kcal</span></button>`).join('')}
    </div>
    <div class="section-title">📋 운동·활동 기록</div>
    <div class="card">${exLogHTML(log)}</div>`;
}

/* ───────── 화면: 기록 ───────── */
function trend(endKey, c) {
  let days = Array.from({ length: 7 }, (_, i) => addDays(endKey, i - 6)).filter(k => state.logs[k]?.foods?.length);
  // 아직 끝나지 않은 오늘은 다른 날 기록이 있으면 추세에서 뺀다
  if (days.length > 1 && endKey === todayKey() && new Date().getHours() < 20) days = days.filter(k => k !== endKey);
  if (!days.length || !c) return null;
  const avg = days.reduce((s, k) => { const t = totals(k); return s + (t.kcal - t.burn - c.tdee); }, 0) / days.length;
  return { days: days.length, avg, monthKg: (avg * 30) / KCAL_PER_KG };
}

function renderHistory() {
  const el = $('#view-history');
  const c = calc(state.profile);
  const end = todayKey();
  const tr = trend(end, c);
  let risk;
  if (!tr) risk = { lvl: 'info', title: '아직 판단할 기록이 부족해요', d: '며칠 동안 식단을 기록하면 살찔 가능성을 알려드려요.' };
  else if (tr.monthKg >= 0.8) risk = { lvl: 'danger', title: '살찔 가능성 높음', d: `최근 ${tr.days}일 평균 하루 ${fmt(tr.avg)}kcal를 더 먹었어요. 이대로면 한 달에 약 ${r1(tr.monthKg)}kg 늘 수 있어요.` };
  else if (tr.monthKg >= 0.2) risk = { lvl: 'warn', title: '살찔 가능성 보통', d: `하루 평균 ${fmt(tr.avg)}kcal 남아요. 한 달에 약 ${r1(tr.monthKg)}kg 늘 수 있어요.` };
  else if (tr.monthKg > -0.2) risk = { lvl: 'good', title: '체중 유지 중', d: '먹는 양과 쓰는 양이 잘 맞아요.' };
  else risk = { lvl: 'good', title: '체중 감소 중', d: `하루 평균 ${fmt(-tr.avg)}kcal 덜 먹었어요. 한 달에 약 ${r1(-tr.monthKg)}kg 줄 수 있어요.` };

  let obesity = '';
  if (c) {
    const bi = c.bmiInfo;
    const rising = tr && tr.monthKg >= 0.2;
    let lvl = bi.lvl, txt;
    if (c.bmi >= 25) txt = rising ? '비만 범위인데 칼로리가 남는 추세예요. 비만 위험이 높아요. 식단 관리가 필요해요.' : '비만 범위예요. 꾸준한 식단 관리와 운동이 필요해요.';
    else if (c.bmi >= 23) txt = rising ? '과체중 범위인데 칼로리가 남는 추세예요. 비만으로 넘어갈 위험이 있어요.' : '과체중 범위예요. 조금만 관리하면 정상 범위로 갈 수 있어요.';
    else if (c.bmi < 18.5) txt = '저체중 범위예요. 충분히 챙겨 드세요.';
    else { txt = rising ? '지금은 정상이지만 칼로리가 남는 추세라 과체중이 될 수 있어요.' : '정상 체중이에요. 지금처럼 유지해요!'; if (rising) lvl = 'warn'; }
    obesity = `<div class="card"><h2>🩺 비만 위험 체크 <span class="sub">BMI ${r1(c.bmi)}</span></h2>
      ${bmiGauge(c.bmi)}
      <div class="msg ${lvl}" style="margin-top:8px"><span class="e">${lvl === 'good' ? '😊' : lvl === 'danger' ? '🚨' : lvl === 'warn' ? '⚠️' : '🌱'}</span><div><b>${bi.name}</b>${txt}<br><span class="small muted">건강 체중 범위: ${fmt(c.healthyWeight[0], 1)}~${fmt(c.healthyWeight[1], 1)}kg</span></div></div>
    </div>`;
  }

  const wpts = Object.entries(state.weights).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  const days = Array.from({ length: 14 }, (_, i) => addDays(end, -i));
  el.innerHTML = `
    <div class="card"><h2>📊 최근 7일 칼로리 <span class="sub"><span style="color:var(--primary)">■</span> 섭취 <span style="color:var(--burn)">■</span> 운동</span></h2>
      ${weekChart(end, c)}</div>

    <div class="card"><h2>🔮 살찔 가능성</h2>
      <div class="risk">${riskMeter(tr ? tr.monthKg : null)}
        <div><h3 style="color:var(--${risk.lvl === 'info' ? 'info' : risk.lvl})">${risk.title}</h3><p>${risk.d}</p></div></div>
    </div>

    ${obesity}

    ${a1cCardHTML(end, c)}

    <div class="card"><h2>⚖️ 체중 기록 <span class="sub">${wpts.length ? `최근 ${fmt(wpts[wpts.length - 1][1], 1)}kg` : ''}</span></h2>
      ${sparkline(wpts) || '<p class="muted small" style="margin:0 0 10px">체중을 두 번 이상 기록하면 그래프가 그려져요.</p>'}
      <div class="search" style="margin:10px 0 0">
        <label class="field"><span>⚖️</span><input id="weightInput" type="number" inputmode="decimal" step="0.1" placeholder="오늘 체중 (kg)"></label>
        <button class="btn primary" data-save-weight>기록</button>
      </div>
    </div>

    <div class="card"><h2>🗓️ 날짜별 기록</h2>
      ${days.map(k => {
        const t = totals(k);
        const has = state.logs[k]?.foods?.length;
        let e = '·';
        if (has && c) { const p = t.net / c.target.kcal; e = p > 1.2 ? '🔴' : p > 1.05 ? '🟠' : p >= 0.8 ? '🟢' : '🟡'; }
        return `<button class="day-row" style="width:100%;text-align:left" data-goto="${k}"><span class="d">${shortDate(k)} (${WD[parseKey(k).getDay()]})</span>
          <span class="v">${has ? `${fmt(t.kcal)}kcal 섭취${t.burn ? ` · 운동 ${fmt(t.burn)}` : ''}` : '기록 없음'}</span><span class="e">${e}</span></button>`;
      }).join('')}
      <p class="small muted" style="margin:10px 0 0">🟢 적정 🟡 부족 🟠 조금 많음 🔴 과다</p>
    </div>`;
}

function a1cCardHTML(end, c) {
  const last = latestA1c();
  const gt = c ? glucoseTrend(end) : null;
  let msg;
  if (!gt) msg = { lvl: 'info', e: '🍽️', t: '식단을 기록하면 알려드려요', d: '며칠 동안 먹은 음식을 기록하면 당화혈색소가 오를지 내릴지 식단으로 살펴봐요.' };
  else if (gt.avg >= 80) msg = { lvl: 'good', e: '🎉', t: '잘 하고 있어요!', d: `최근 ${gt.days}일 혈당 관리 점수가 평균 ${fmt(gt.avg)}점이에요. 이대로면 당화혈색소 관리에 도움이 돼요.` };
  else if (gt.avg >= 65) msg = { lvl: 'info', e: '🙂', t: '대체로 괜찮아요', d: `최근 ${gt.days}일 평균 ${fmt(gt.avg)}점이에요.${gt.causes.length ? ` ${gt.causes.join(', ')}는 조금 줄여 보세요.` : ''}` };
  else if (gt.avg >= 45) msg = { lvl: 'warn', e: '📈', t: '이대로면 당화혈색소가 올라갈 수 있어요', d: `최근 ${gt.days}일 평균 ${fmt(gt.avg)}점이에요.${gt.causes.length ? ` 자주 나온 원인: ${gt.causes.join(', ')}.` : ''}` };
  else msg = { lvl: 'danger', e: '🩸', t: '이렇게 먹으면 당화혈색소가 올라갈 수 있어요', d: `최근 ${gt.days}일 평균 ${fmt(gt.avg)}점이에요.${gt.causes.length ? ` 자주 나온 원인: ${gt.causes.join(', ')}.` : ''} 당뇨 위험이 커질 수 있어요.` };

  let lab = '';
  if (last) {
    const info = a1cInfo(last.v);
    const eag = Math.round(28.7 * last.v - 46.7);
    const pts = Object.entries(state.a1c).sort((a, b) => a[0].localeCompare(b[0]));
    let d = info.lvl === 'good' ? '정상 범위예요. 지금 식습관을 유지해요!' : info.lvl === 'warn' ? '당뇨 전단계예요. 식단과 운동으로 충분히 되돌릴 수 있어요.' : '당뇨 범위예요. 꼭 병원에서 상담받고 식단을 관리해 주세요.';
    if (pts.length >= 2) {
      const diff = r1(last.v - pts[pts.length - 2][1]);
      if (diff < 0) d = `지난 검사보다 ${-diff}% 내려갔어요. 잘 하고 있어요! ` + d;
      else if (diff > 0) d = `지난 검사보다 ${diff}% 올라갔어요. ` + d;
    }
    lab = `${a1cGauge(last.v)}
      <div class="msg ${info.lvl}" style="margin:8px 0"><span class="e">${info.lvl === 'good' ? '😊' : info.lvl === 'warn' ? '⚠️' : '🚨'}</span><div><b>${info.name} · ${shortDate(last.date)} 검사</b>${d}<br><span class="small muted">평균 혈당 약 ${eag}mg/dL에 해당해요.</span></div></div>
      ${pts.length >= 2 ? sparkline(pts.slice(-8)) : ''}`;
  } else {
    lab = `${a1cGauge(null)}<p class="small muted" style="margin:4px 0 8px">건강검진이나 병원에서 받은 당화혈색소 수치를 넣으면 함께 관리해 드려요.</p>`;
  }

  return `<div class="card"><h2>🩸 당화혈색소 관리 <span class="sub">${last ? `최근 ${last.v}%` : '식단 기반'}</span></h2>
    ${lab}
    <div class="search" style="margin:0 0 12px">
      <label class="field"><span>🩸</span><input id="a1cInput" type="number" inputmode="decimal" step="0.1" placeholder="검사 수치 (%)"></label>
      <button class="btn primary" data-save-a1c>기록</button>
    </div>
    <div class="glu-head" style="margin-bottom:2px"><span>최근 14일 혈당 관리 점수</span></div>
    ${glucoseChart(end)}
    <div class="msg ${msg.lvl}" style="margin-top:8px"><span class="e">${msg.e}</span><div><b>${msg.t}</b>${msg.d}</div></div>
    ${gt && gt.avg < 80 ? `<ul class="tips">
      <li>🚶 식후 10~15분 걷기</li><li>💧 단 음료 대신 물·무가당 차</li><li>🥗 채소 → 단백질 → 밥 순서로 먹기</li><li>🍚 흰밥·밀가루 대신 잡곡·통곡물</li></ul>` : ''}
    <p class="small muted" style="margin:10px 0 0">당화혈색소는 최근 2~3개월 평균 혈당을 보여줘요. 정상 5.7% 미만, 당뇨 전단계 5.7~6.4%, 당뇨 6.5% 이상이에요. 점수는 식단 기록으로 추정한 참고용이에요.</p>
  </div>`;
}

/* ───────── 화면: 내 정보 ───────── */
function renderProfile() {
  const el = $('#view-profile');
  const p = state.profile || { sex: 'f', age: '', height: '', weight: '', activity: 'sedentary', goal: 'keep' };
  el.innerHTML = `
    <div class="card"><h2>👤 내 정보</h2>
      <form id="profileForm" class="form-grid" autocomplete="off">
        <div class="full"><div class="seg" id="sexSeg">
          <button type="button" data-sex="f" class="${p.sex === 'f' ? 'active' : ''}">👩 여성</button>
          <button type="button" data-sex="m" class="${p.sex === 'm' ? 'active' : ''}">👨 남성</button></div></div>
        <label class="inp full"><span>나이</span><div class="suffix"><input name="age" type="number" inputmode="numeric" min="10" max="100" value="${esc(p.age)}" placeholder="30"><em>세</em></div></label>
        <label class="inp"><span>키</span><div class="suffix"><input name="height" type="number" inputmode="decimal" step="0.1" min="100" max="230" value="${esc(p.height)}" placeholder="165"><em>cm</em></div></label>
        <label class="inp"><span>몸무게</span><div class="suffix"><input name="weight" type="number" inputmode="decimal" step="0.1" min="25" max="250" value="${esc(p.weight)}" placeholder="60"><em>kg</em></div></label>
        <label class="inp full"><span>평소 활동량 (운동·걸음 수는 따로 기록해요. 걸음 수를 기록한다면 '주로 앉아서 생활'을 고르세요)</span><select name="activity">
          ${ACTIVITY.map(a => `<option value="${a.id}" ${a.id === p.activity ? 'selected' : ''}>${a.name} · ${a.desc}</option>`).join('')}</select></label>
        <label class="inp full"><span>목표</span><select name="goal">
          ${GOALS.map(g => `<option value="${g.id}" ${g.id === p.goal ? 'selected' : ''}>${g.emoji} ${g.name}${g.delta ? ` (하루 ${g.delta > 0 ? '+' : ''}${g.delta}kcal)` : ''}</option>`).join('')}</select></label>
        <button class="btn primary block full" type="submit">저장하기</button>
      </form>
    </div>
    <div id="profileResult"></div>

    <div class="card"><h2>📲 홈 화면에 설치하기</h2>
      <p class="small" style="margin:0 0 6px"><b>아이폰</b> · 사파리 아래쪽 공유 버튼 <svg class="share" viewBox="0 0 24 24" style="display:inline;width:15px;height:15px;vertical-align:-2px" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg> → <b>홈 화면에 추가</b></p>
      <p class="small" style="margin:0 0 6px"><b>안드로이드 (크롬)</b> · 오른쪽 위 ⋮ 메뉴 → <b>앱 설치</b> (또는 <b>홈 화면에 추가</b>) → 설치</p>
      <p class="small" style="margin:0"><b>안드로이드 (삼성 인터넷)</b> · 아래쪽 ≡ 메뉴 → <b>현재 페이지 추가</b> → <b>홈 화면</b></p>
    </div>

    <div class="card"><h2>💾 데이터</h2>
      <p class="small muted" style="margin:0 0 10px">모든 기록은 이 휴대폰 안에만 저장돼요. 기기를 바꿀 때는 백업 파일로 옮기세요.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn" data-export>⬇️ 백업 받기</button>
        <label class="btn" style="cursor:pointer">⬆️ 불러오기<input type="file" accept="application/json,.json" id="importFile" hidden></label>
        <button class="btn danger" data-reset style="grid-column:1/-1">모든 기록 지우기</button>
      </div>
    </div>
    <p class="small muted" style="text-align:center;margin:4px 8px 6px">칼로리·영양 정보는 보편적인 추정치이며 의학적 진단을 대신하지 않아요.</p>
    ${COPYRIGHT}`;
  renderProfileResult(readProfileForm() || p);
}

function readProfileForm() {
  const f = $('#profileForm');
  if (!f) return null;
  const sex = $('#sexSeg .active')?.dataset.sex || 'f';
  return {
    sex,
    age: Number(f.age.value), height: Number(f.height.value), weight: Number(f.weight.value),
    activity: f.activity.value, goal: f.goal.value,
  };
}

function renderProfileResult(p) {
  const box = $('#profileResult');
  if (!box) return;
  const c = calc(p);
  if (!c) { box.innerHTML = ''; return; }
  const T = c.target;
  const kc = { carb: T.carb * 4, protein: T.protein * 4, fat: T.fat * 9 };
  const sum = kc.carb + kc.protein + kc.fat;
  box.innerHTML = `
    <div class="card"><h2>📐 나의 몸 상태</h2>
      <div class="stat-grid">
        <div class="stat wide"><span>BMI (체질량지수)</span><b>${r1(c.bmi)}</b> <span class="badge b-${c.bmiInfo.lvl === 'info' ? 'info' : c.bmiInfo.lvl}" style="display:inline-flex">${c.bmiInfo.name}</span>${bmiGauge(c.bmi)}</div>
        <div class="stat"><span>기초대사량</span><b>${fmt(c.bmr)}<small>kcal</small></b></div>
        <div class="stat"><span>하루 활동 대사량</span><b>${fmt(c.tdee)}<small>kcal</small></b></div>
        <div class="stat wide" style="background:var(--primary-soft)"><span>하루 권장 섭취 칼로리</span><b style="color:var(--primary);font-size:28px">${fmt(T.kcal)}<small>kcal</small></b></div>
      </div>
    </div>
    <div class="card"><h2>🥗 하루 권장 영양소</h2>
      <div class="macro-split">
        <div style="width:${kc.carb / sum * 100}%;background:var(--carb)"></div>
        <div style="width:${kc.protein / sum * 100}%;background:var(--protein)"></div>
        <div style="width:${kc.fat / sum * 100}%;background:var(--fat)"></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--carb)"></i> 탄수화물</span><b>${fmt(T.carb)}<small>g</small></b></div>
        <div class="stat"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--protein)"></i> 단백질</span><b>${fmt(T.protein)}<small>g</small></b></div>
        <div class="stat"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--fat)"></i> 지방</span><b>${fmt(T.fat)}<small>g</small></b></div>
        <div class="stat"><span>🍬 당류</span><b>${fmt(T.sugar)}<small>g 이하</small></b></div>
        <div class="stat wide"><span>🧂 나트륨</span><b>${fmt(T.sodium)}<small>mg 이하</small></b></div>
      </div>
    </div>`;
}

/* ───────── 바텀 시트 ───────── */
function openSheet(html, onMount) {
  const s = $('#sheet');
  s.innerHTML = `<div class="grab"></div>${html}`;
  s.hidden = false;
  $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  onMount && onMount(s);
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}

function defaultMeal() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

function entryTime() {
  const now = new Date();
  if (state.date === todayKey()) return now.getTime();
  const d = parseKey(state.date);
  d.setHours(now.getHours(), now.getMinutes());
  return d.getTime();
}

function mealSeg(sel) {
  return `<div class="seg" data-meal-seg>${MEALS.map(m => `<button type="button" data-meal="${m.id}" class="${m.id === sel ? 'active' : ''}">${m.emoji}<small>${m.name}</small></button>`).join('')}</div>`;
}
function bindSeg(root, sel, cb) {
  root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    cb && cb(b);
  }));
}

// food: { name, emoji, cat, serving(label), kcal...(1인분) } 또는 { per100, grams }
function openFoodSheet(food) {
  const gramMode = !!food.per100;
  let qty = gramMode ? food.serving || 100 : 1;
  let meal = defaultMeal();
  const base = gramMode ? food.per100 : food;
  const factor = () => (gramMode ? qty / 100 : qty);
  const chips = gramMode ? [50, 100, 150, 200, 300] : [0.5, 1, 1.5, 2, 3];

  openSheet(`
    <div class="sheet-head"><div class="em">${food.img ? `<img src="${esc(food.img)}" alt="">` : esc(food.emoji || '🍽️')}</div>
      <div><h3>${esc(food.name)}</h3><p>${gramMode ? `${food.brand ? esc(food.brand) + ' · ' : ''}100g당 ${fmt(base.kcal)}kcal` : `1인분 ${esc(food.serving)} · ${fmt(base.kcal)}kcal`}</p></div></div>
    <label class="lbl">${gramMode ? '먹은 양 (g)' : '먹은 양 (인분)'}</label>
    <div class="stepper"><button type="button" data-step="-1">−</button>
      <input id="qty" type="number" inputmode="decimal" step="${gramMode ? 10 : 0.1}" min="0" value="${qty}"><span class="unit">${gramMode ? 'g' : '인분'}</span>
      <button type="button" data-step="1">+</button></div>
    <div class="qchips">${chips.map(c => `<button type="button" data-q="${c}" class="${c === qty ? 'active' : ''}">${c}${gramMode ? 'g' : '인분'}</button>`).join('')}</div>
    <label class="lbl">언제 먹었나요?</label>
    ${mealSeg(meal)}
    <div class="preview" id="pv"></div>
    <button class="btn primary block" id="addFood">기록하기</button>
  `, s => {
    const inp = $('#qty', s);
    const upd = () => {
      const f = factor();
      $('#pv', s).innerHTML = `
        <div class="main"><b>${fmt(base.kcal * f)}</b><span>kcal</span></div>
        <div><b>${fmt(base.carb * f, 1)}g</b><span>탄수화물</span></div>
        <div><b>${fmt(base.protein * f, 1)}g</b><span>단백질</span></div>
        <div><b>${fmt(base.fat * f, 1)}g</b><span>지방</span></div>
        <div><b>${fmt(base.sugar * f, 1)}g</b><span>당류</span></div>
        <div><b>${fmt(base.sodium * f)}mg</b><span>나트륨</span></div>
        <div><b>${fmt(state.profile ? base.kcal * f / calc(state.profile).target.kcal * 100 : 0)}%</b><span>하루 권장량</span></div>`;
      s.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('active', Number(b.dataset.q) === qty));
    };
    // 인분은 0.1 단위로 맞춘다.
    const norm = v => Math.max(0, gramMode ? v : r1(v));
    inp.addEventListener('input', () => { qty = norm(Number(inp.value) || 0); upd(); });
    inp.addEventListener('change', () => { inp.value = qty; });
    s.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const st = gramMode ? 10 : 0.1;
      qty = Math.max(st, r1(qty + st * Number(b.dataset.step)));
      inp.value = qty; upd();
    }));
    s.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { qty = Number(b.dataset.q); inp.value = qty; upd(); }));
    bindSeg(s, '[data-meal]', b => { meal = b.dataset.meal; });
    $('#addFood', s).addEventListener('click', () => {
      if (!(qty > 0)) return toast('먹은 양을 입력해 주세요');
      const f = factor();
      const entry = {
        id: uid(), name: food.name, emoji: food.emoji || '🛒', cat: food.cat || 'etc', meal, t: entryTime(),
        amount: gramMode ? `${fmt(qty)}g` : `${fmt(qty, 1)}인분`,
      };
      for (const n of NKEYS) entry[n] = r1((base[n] || 0) * f);
      dayLog(state.date, true).foods.push(entry);
      remember(food);
      save();
      closeSheet();
      toast(`${food.name} ${fmt(entry.kcal)}kcal 기록했어요`);
      render();
    });
    upd();
  });
}

function remember(food) {
  const key = food.name + (food.brand || '');
  const item = { ...food };
  state.recent = [item, ...state.recent.filter(f => f.name + (f.brand || '') !== key)].slice(0, 12);
}

function openManualSheet(name = '') {
  let meal = defaultMeal();
  const fields = [['kcal', '칼로리', 'kcal'], ['carb', '탄수화물', 'g'], ['protein', '단백질', 'g'], ['fat', '지방', 'g'], ['sugar', '당류', 'g'], ['sodium', '나트륨', 'mg']];
  openSheet(`
    <div class="sheet-head"><div class="em">✏️</div><div><h3>직접 입력</h3><p>포장지의 영양성분표를 보고 입력하세요</p></div></div>
    <form id="manualForm" class="form-grid">
      <label class="inp full"><span>음식 이름</span><input name="name" value="${esc(name)}" placeholder="예: 엄마표 잡채" required></label>
      <label class="inp"><span>아이콘</span><select name="cat">${FOOD_CATEGORIES.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('')}</select></label>
      <label class="inp"><span>1회 양</span><input name="serving" placeholder="1인분"></label>
      ${fields.map(([k, l, u]) => `<label class="inp"><span>${l}</span><div class="suffix"><input name="${k}" type="number" inputmode="decimal" step="0.1" min="0" ${k === 'kcal' ? 'required' : ''} placeholder="0"><em>${u}</em></div></label>`).join('')}
      <div class="full"><label class="lbl" style="margin-top:4px">언제 먹었나요?</label>${mealSeg(meal)}</div>
      <label class="full small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="keep" checked> 내 음식으로 저장해서 다음에 검색하기</label>
      <button class="btn primary block full" type="submit">기록하기</button>
    </form>`, s => {
    bindSeg(s, '[data-meal]', b => { meal = b.dataset.meal; });
    $('#manualForm', s).addEventListener('submit', ev => {
      ev.preventDefault();
      const f = ev.target;
      const cat = FOOD_CATEGORIES.find(c => c.id === f.cat.value);
      const food = { id: 'c' + uid(), name: f.name.value.trim(), emoji: cat.emoji, cat: cat.id, serving: f.serving.value.trim() || '1인분' };
      for (const [k] of fields) food[k] = Number(f[k].value) || 0;
      if (!food.name) return toast('음식 이름을 입력해 주세요');
      if (f.keep.checked) state.custom = [food, ...state.custom.filter(c => c.name !== food.name)];
      const entry = { ...food, id: uid(), meal, t: entryTime(), amount: food.serving };
      dayLog(state.date, true).foods.push(entry);
      remember(food);
      save();
      closeSheet();
      toast(`${food.name} 기록했어요`);
      render();
    });
  });
}

function openExerciseSheet(ex) {
  let intensity = 1, min = 30;
  openSheet(`
    <div class="sheet-head"><div class="em">${ex.emoji}</div><div><h3>${ex.name}</h3><p>${EXERCISE_CATEGORIES.find(c => c.id === ex.cat).name} · 체중 ${fmt(currentWeight(), 1)}kg 기준</p></div></div>
    <label class="lbl">강도</label>
    <div class="seg">${INTENSITIES.map(i => `<button type="button" data-int="${i.id}" class="${i.id === intensity ? 'active' : ''}">${i.emoji} ${i.name}<small>${i.desc}</small></button>`).join('')}</div>
    <label class="lbl">운동 시간 (분)</label>
    <div class="stepper"><button type="button" data-step="-1">−</button>
      <input id="min" type="number" inputmode="numeric" step="5" value="${min}"><span class="unit">분</span>
      <button type="button" data-step="1">+</button></div>
    <div class="qchips">${[10, 20, 30, 45, 60, 90].map(m => `<button type="button" data-m="${m}" class="${m === min ? 'active' : ''}">${m}분</button>`).join('')}</div>
    <div class="preview" id="pv"></div>
    <button class="btn primary block" id="addEx" style="background:var(--burn)">기록하기</button>
  `, s => {
    const inp = $('#min', s);
    const upd = () => {
      const kc = exKcal(ex, intensity, min);
      const foodEq = [['🍚', '밥', 310], ['🍜', '라면', 500], ['🍌', '바나나', 105]].find(x => kc >= x[2] * 0.5) || ['🍌', '바나나', 105];
      $('#pv', s).innerHTML = `
        <div class="main burn"><b>−${fmt(kc)}</b><span>kcal 소모</span></div>
        <div><b>${ex.met[intensity]}</b><span>MET</span></div>
        <div><b>${min}분</b><span>시간</span></div>
        <div><b>${foodEq[0]} ${r1(kc / foodEq[2])}</b><span>${foodEq[1]} 개수</span></div>`;
      s.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('active', Number(b.dataset.m) === min));
    };
    bindSeg(s, '[data-int]', b => { intensity = Number(b.dataset.int); upd(); });
    inp.addEventListener('input', () => { min = Math.max(0, Math.round(Number(inp.value) || 0)); upd(); });
    s.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { min = Math.max(5, min + 5 * Number(b.dataset.step)); inp.value = min; upd(); }));
    s.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { min = Number(b.dataset.m); inp.value = min; upd(); }));
    $('#addEx', s).addEventListener('click', () => {
      if (!(min > 0)) return toast('운동 시간을 입력해 주세요');
      const entry = { id: uid(), exId: ex.id, name: ex.name, emoji: ex.emoji, intensity, min, kcal: Math.round(exKcal(ex, intensity, min)), t: entryTime() };
      dayLog(state.date, true).ex.push(entry);
      save();
      closeSheet();
      toast(`${ex.name} ${fmt(entry.kcal)}kcal 소모! 💪`);
      render();
    });
    upd();
  });
}

/* ───────── 렌더 · 내비게이션 ───────── */
function renderTopbar() {
  const showDate = ['today', 'food', 'exercise'].includes(state.tab);
  const isToday = state.date === todayKey();
  $('#prevDay').hidden = !showDate;
  $('#nextDay').hidden = !showDate;
  $('#dateNav').classList.toggle('plain', !showDate);
  $('#nextDay').disabled = isToday;
  const titles = { history: '기록과 추세', profile: '내 정보' };
  $('#dateLabel').innerHTML = showDate ? `${isToday ? '<small>오늘</small>' : '<small style="color:var(--muted)">오늘로 돌아가기</small>'}${dateText(state.date)}` : titles[state.tab];
}

function render() {
  renderTopbar();
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + state.tab; });
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  ({ today: renderToday, food: renderFood, exercise: renderExercise, history: renderHistory, profile: renderProfile })[state.tab]();
}

function go(tab) {
  if (state.tab !== tab) window.scrollTo(0, 0);
  state.tab = tab;
  render();
}

/* ───────── 이벤트 ───────── */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-goto]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return go(d.tab);
  if (d.go) return go(d.go);
  if (d.goto) { state.date = d.goto; return go('today'); }
  if (t.hasAttribute('data-cat-back')) return closeFoodCat();
  if (d.cat !== undefined) {
    state.foodCat = d.cat || null;
    // 휴대폰의 뒤로가기(제스처·버튼)로도 카테고리 목록으로 돌아오게 한다
    if (state.foodCat) history.pushState({ foodCat: state.foodCat }, '');
    window.scrollTo(0, 0);
    return renderFood();
  }
  if (d.excat) { state.exCat = d.excat; return renderExercise(); }
  if (d.food) { const f = allFoods().find(x => x.id === d.food); return f && openFoodSheet(f); }
  if (d.recent !== undefined) return openFoodSheet(state.recent[Number(d.recent)]);
  if (d.web !== undefined) { const f = state.web.items[Number(d.web)]; return f && openFoodSheet({ ...f, emoji: '🛒', cat: 'etc' }); }
  if (t.hasAttribute('data-web-search')) return webSearch(state.query.trim());
  if (t.hasAttribute('data-manual')) return openManualSheet(state.query.trim());
  if (d.ex) return openExerciseSheet(EXERCISES.find(x => x.id === d.ex));
  if (d.delFood) {
    const log = dayLog(state.date, true);
    log.foods = log.foods.filter(f => f.id !== d.delFood);
    save(); toast('삭제했어요'); return render();
  }
  if (d.delEx) {
    const log = dayLog(state.date, true);
    log.ex = log.ex.filter(x => x.id !== d.delEx);
    save(); toast('삭제했어요'); return render();
  }
  if (d.sex) {
    t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === t));
    return renderProfileResult(readProfileForm());
  }
  if (t.hasAttribute('data-save-steps')) return saveSteps($('#stepsInput').value, state.date);
  if (t.hasAttribute('data-paste-steps')) return pasteSteps();
  if (t.hasAttribute('data-del-steps')) {
    dayLog(state.date, true).steps = 0;
    save(); toast('삭제했어요'); return render();
  }
  if (t.hasAttribute('data-save-weight')) {
    const v = Number($('#weightInput').value);
    if (!(v >= 25 && v <= 250)) return toast('체중을 올바르게 입력해 주세요');
    state.weights[todayKey()] = r1(v);
    if (state.profile) state.profile.weight = r1(v);
    save(); toast(`체중 ${r1(v)}kg 기록했어요`); return renderHistory();
  }
  if (t.hasAttribute('data-save-a1c')) {
    const v = r1(Number($('#a1cInput').value));
    if (!(v >= 3 && v <= 20)) return toast('당화혈색소 수치를 올바르게 입력해 주세요 (예: 5.8)');
    state.a1c[todayKey()] = v;
    save(); toast(`당화혈색소 ${v}% 기록했어요`); return renderHistory();
  }
  if (t.hasAttribute('data-export')) return exportData();
  if (t.hasAttribute('data-reset')) {
    if (confirm('모든 기록과 내 정보를 지울까요? 되돌릴 수 없어요.')) {
      for (const k of ['profile', 'logs', 'weights', 'custom', 'recent', 'a1c']) localStorage.removeItem(KEY + k);
      Object.assign(state, { profile: null, logs: {}, weights: {}, custom: [], recent: [], a1c: {} });
      toast('모두 지웠어요'); go('today');
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'foodSearch') {
    state.query = e.target.value;
    clearTimeout(webSearch.t);
    const q = state.query.trim();
    renderFood();
    // 내장 사전에 없으면 잠시 뒤 인터넷에서 자동으로 찾기
    if (q.length >= 2 && !allFoods().some(f => matches(f, norm(q)))) {
      webSearch.t = setTimeout(() => { if (state.query.trim() === q && state.web.q !== q) webSearch(q); }, 900);
    }
  }
  if (e.target.closest('#profileForm')) renderProfileResult(readProfileForm());
});

document.addEventListener('keydown', e => {
  if (e.target.id === 'foodSearch' && e.key === 'Enter') {
    e.preventDefault();
    const q = state.query.trim();
    if (q) { e.target.blur(); webSearch(q); }
  }
  if (e.key === 'Escape') closeSheet();
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'profileForm') return;
  e.preventDefault();
  const p = readProfileForm();
  if (!(p.age >= 10 && p.age <= 100)) return toast('나이를 확인해 주세요');
  if (!(p.height >= 100 && p.height <= 230)) return toast('키를 확인해 주세요');
  if (!(p.weight >= 25 && p.weight <= 250)) return toast('몸무게를 확인해 주세요');
  const first = !state.profile;
  state.profile = p;
  state.weights[todayKey()] = r1(p.weight);
  save();
  toast('저장했어요');
  if (first) go('today'); else renderProfile();
});

document.addEventListener('change', e => {
  if (e.target.id !== 'importFile') return;
  const file = e.target.files[0];
  if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!data || typeof data.logs !== 'object') throw new Error('bad');
    Object.assign(state, {
      profile: data.profile || null, logs: data.logs || {}, weights: data.weights || {},
      custom: data.custom || [], recent: data.recent || [], a1c: data.a1c || {},
    });
    save(); toast('백업을 불러왔어요'); render();
  }).catch(() => toast('올바른 백업 파일이 아니에요'));
});

function exportData() {
  const data = { app: 'diet-pwa', version: 1, exportedAt: new Date().toISOString(), profile: state.profile, logs: state.logs, weights: state.weights, custom: state.custom, recent: state.recent, a1c: state.a1c };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `식단관리-백업-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function saveSteps(raw, k) {
  const v = Math.round(Number(String(raw).replace(/[^\d.]/g, '')) || 0);
  if (v < 0 || v > 100000) return toast('걸음 수를 확인해 주세요');
  dayLog(k, true).steps = v;
  save();
  toast(v ? `${fmt(v)}보, ${fmt(stepKcal(v))}kcal 반영했어요` : '걸음 수를 지웠어요');
  render();
}

// 아이폰 단축어가 건강 앱의 걸음 수를 클립보드에 복사해 두면 버튼 한 번으로 넣는다
async function pasteSteps() {
  try {
    const text = await navigator.clipboard.readText();
    const m = String(text).replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (!m) return toast('복사된 걸음 수가 없어요. 단축어를 먼저 실행해 주세요');
    saveSteps(m[0], state.date);
  } catch {
    toast('붙여넣기를 허용해 주세요');
  }
}

function closeFoodCat() {
  if (history.state?.foodCat) return history.back();
  state.foodCat = null;
  window.scrollTo(0, 0);
  renderFood();
}
window.addEventListener('popstate', () => {
  if (!$('#sheet').hidden) closeSheet();
  if (state.foodCat) { state.foodCat = null; if (state.tab === 'food') renderFood(); }
});

$('#sheetBackdrop').addEventListener('click', closeSheet);
$('#prevDay').addEventListener('click', () => { state.date = addDays(state.date, -1); render(); });
$('#nextDay').addEventListener('click', () => { if (state.date < todayKey()) { state.date = addDays(state.date, 1); render(); } });
$('#dateLabel').addEventListener('click', () => { if (['today', 'food', 'exercise'].includes(state.tab)) { state.date = todayKey(); render(); } });

// 자정이 지나거나 앱으로 돌아왔을 때 날짜 갱신
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayKey();
  if (now !== lastToday) { if (state.date === lastToday) state.date = now; lastToday = now; }
  render();
});

/* ───────── 설치 안내 ───────── */
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredPrompt = null;

function showInstallBanner(html) {
  if (isStandalone || store.get('installDismissed', false)) return;
  const b = $('#installBanner');
  b.innerHTML = `<div class="inner"><span style="font-size:24px">📲</span><div>${html}</div><button class="x" id="installX" aria-label="닫기">✕</button></div>`;
  b.hidden = false;
  $('#installX').onclick = () => { b.hidden = true; store.set('installDismissed', true); };
}

const isAndroid = /android/i.test(navigator.userAgent);
const isSamsung = /SamsungBrowser/i.test(navigator.userAgent);
if (isAndroid && !isStandalone) {
  showInstallBanner(isSamsung
    ? `<b>홈 화면에 추가해 앱처럼 쓰세요</b>아래쪽 ≡ 메뉴 → '현재 페이지 추가' → '홈 화면'`
    : `<b>앱으로 설치해 쓰세요</b>오른쪽 위 ⋮ 메뉴 → '앱 설치' (또는 '홈 화면에 추가')`);
}
if (isIOS && !isStandalone) {
  showInstallBanner(`<b>홈 화면에 추가해 앱처럼 쓰세요</b>아래 공유 버튼 <svg class="share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg> → '홈 화면에 추가'`);
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner(`<b>앱으로 설치할 수 있어요</b><button class="btn primary" id="installBtn" style="padding:6px 12px;margin-top:4px">설치하기</button>`);
  const btn = $('#installBtn');
  if (btn) btn.onclick = async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#installBanner').hidden = true;
  };
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

if (!state.profile) state.tab = 'today';

// 주소로 걸음 수 받기: ?steps=8000 (&date=2026-10-18). 단축어·자동화 앱에서 사용
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('steps')) return;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : todayKey();
  history.replaceState(null, '', location.pathname);
  state.date = d;
  saveSteps(q.get('steps'), d);
})();
render();
