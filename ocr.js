// 영양성분표 사진 읽기: 휴대폰 브라우저 안에서 글자를 인식(Tesseract.js)하고 숫자를 뽑아낸다.
// 인식 엔진과 한글 데이터는 처음 쓸 때만 인터넷(jsdelivr)에서 받고, 이후엔 브라우저에 저장된 것을 쓴다.
const OCR_LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

// 1일 영양성분 기준치 (% 표시와 맞춰 보며 잘못 읽은 숫자를 고른다)
const DAILY = { carb: 324, sugar: 100, fat: 54, protein: 55, sodium: 2000 };
const UNIT = { kcal: 'kcal', sodium: 'mg', carb: 'g', sugar: 'g', fat: 'g', protein: 'g' };

// 한글 OCR은 단위 g를 9로, mg를 00·09로 읽는 일이 많다. 단위가 빠진 숫자는 이를 되돌린 후보 중에서 고른다
function pickValue(field, digits, unit, pct, kcal) {
  const n = Number(digits);
  if (unit) return unit === 'mg' && UNIT[field] === 'g' ? n / 1000 : unit === 'g' && field === 'sodium' ? n * 1000 : n;
  const per = { carb: 4, sugar: 4, protein: 4, fat: 9 }[field];
  const ok = v => !(kcal && per && v * per > kcal * 1.1);
  const cut = k => { const r = digits.slice(0, -k).replace(/\.$/, ''); return r && /\d/.test(r) ? Number(r) : null; };
  let cands;
  if (UNIT[field] === 'g') cands = /9$/.test(digits) ? [cut(1), n] : /0$/.test(digits) && !ok(n) ? [cut(1), n] : [n];
  else cands = /(00|09)$/.test(digits) ? [cut(2), cut(1), n] : /9$/.test(digits) ? [cut(1), n] : [n];
  cands = cands.filter(v => v !== null);
  if (pct != null && DAILY[field]) {
    const best = cands.map(v => [v, Math.abs(v / DAILY[field] * 100 - pct)]).sort((a, b) => a[1] - b[1])[0];
    if (best[1] <= Math.max(3, pct * 0.25)) return best[0];
  }
  // 앞에 둔 후보(단위를 떼어 낸 값)를 우선하되, 칼로리와 안 맞는 값은 뺀다
  return cands.find(ok) ?? cands[0];
}

// 한글을 자모로 풀어서 비교한다. OCR이 '나트름', '탄수회물'처럼 한두 획을 틀려도 알아보기 위해서
function jamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    out += String.fromCharCode(0x1100 + (c / 588 | 0), 0x1161 + ((c % 588) / 28 | 0)) + (c % 28 ? String.fromCharCode(0x11a7 + c % 28) : '');
  }
  return out;
}
function editDist(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
// 긴 이름부터 본다 ('포화지방'이 '지방'으로 잡히지 않게). 앞 글자가 잘린 이름도 받는다
const NAMES = [['transfat', '트랜스지방'], ['satfat', '포화지방'], ['chol', '콜레스테롤'], ['fiber', '식이섬유'], ['carb', '탄수화물'],
  ['sodium', '나트륨'], ['protein', '단백질'], ['kcal', '칼로리'], ['kcal', '에너지'], ['sugar', '당류'], ['fat', '지방'], ['kcal', '열량'],
  ['transfat', '랜스지방'], ['satfat', '화지방'], ['chol', '레스테롤'], ['carb', '수화물'], ['sodium', '트륨'], ['protein', '백질']].map(([f, n]) => [f, n, jamo(n)]);
function nameOf(word) {
  for (const [f, n] of NAMES) if (word.includes(n)) return f;
  if (word.length > 7) return null;
  let best = null, bestD = 99;
  for (const [f, n, j] of NAMES) {
    if (n.length < 3 && word.length !== n.length) continue; // 두 글자 이름은 단어 전체가 비슷할 때만
    const lim = n.length <= 2 ? 1 : 2;
    for (let L = Math.max(2, n.length - 1); L <= n.length + 1; L++) for (let i = 0; i + L <= word.length; i++) {
      const dd = editDist(jamo(word.slice(i, i + L)), j);
      if (dd <= lim && dd < bestD) { best = f; bestD = dd; }
    }
  }
  return best;
}

// OCR 글자에서 영양정보를 찾는다. 못 찾은 항목은 null
function parseNutrition(raw) {
  // '1 3 0 m g'처럼 한 글자씩 띄어 읽힌 부분을 붙인다
  const joined = String(raw || '').split('\n').map(line => {
    const out = [];
    let run = '';
    for (const w of line.split(/[ \t　]+/)) {
      if (w.length === 1) { run += w; continue; }
      if (run) { out.push(run); run = ''; }
      out.push(w);
    }
    if (run) out.push(run);
    return out.join(' ');
  }).join('\n');
  const t = joined
    .replace(/(?<=[가-힣])[ \t　]+(?=[가-힣])/g, '') // 한글 사이에 끼어든 빈칸
    .replace(/(?<=\d)[,，](?=\d{3})/g, '')              // 1,790 → 1790
    .replace(/(?<=\d)\.(?=\d{3}\s?mg)/g, '')            // 1.790mg → 1790mg
    .replace(/(?<=\d)[Oo](?=[\d.]|\s|$)/gm, '0')
    .replace(/(?<=\d)[·,](?=\d)/g, '.')                 // 0·3g, 0,3g → 0.3g
    .replace(/[kK]\s?[cсeC][aа@][lI1i|]/g, 'kcal')
    .replace(/(?<=\d\s?)(m[gq]|rng)(?![a-z])/g, 'mg')
    .replace(/(?<=\d\s?)m[lI1|](?![a-z])/g, 'ml')
    .replace(/(?<=\d)\s+(?=kcal|mg|ml|g(?![a-z]))/g, '')
    .replace(/(?<=\d)G/g, 'g');

  const out = { kcal: null, carb: null, protein: null, fat: null, sugar: null, sodium: null, basis: null, total: null, servings: null, kcalEstimated: false };
  // 칼로리: '2,000kcal 기준' 안내문은 빼고 처음 나오는 kcal 값
  const kc = [...t.matchAll(/(\d+(?:\.\d+)?)kcal/g)].map(m => Number(m[1])).find(v => v !== 2000);
  const NUM = /(\d+(?:\.\d+)?)(kcal|mg|g)?(?:[^\d\n%]{0,12}?(\d{1,3}(?:\.\d)?)\s?%)?/;
  const found = {};   // 항목 → [숫자, 단위, %]
  const pending = []; // 숫자 없이 이름만 있던 줄 (이름과 숫자가 다른 칸에 따로 읽힌 표)
  for (const line of t.split('\n')) {
    if (/기준치에|기준이므로|비율|필요열량|따라다를/.test(line.replace(/\s/g, ''))) continue; // 아래쪽 안내문
    const words = [...line.matchAll(/[가-힣]+/g)].map(m => ({ f: nameOf(m[0]), at: m.index, end: m.index + m[0].length })).filter(w => w.f);
    if (words.length) {
      words.forEach((w, i) => {
        const seg = line.slice(w.end, i + 1 < words.length ? words[i + 1].at : undefined);
        const m = seg.match(NUM);
        // '나트륨 (mg) 350'처럼 단위가 이름 옆에 따로 적힌 표
        const u = m && !m[2] && (seg.slice(0, m.index).match(/\((kcal|mg|g)\)/) || [])[1];
        if (m && !/^\s*[가-힣]/.test(seg.slice(0, m.index).replace(/[^가-힣\s]/g, ''))) { if (!(w.f in found)) found[w.f] = [m[1], m[2] || u, m[3]]; }
        else if (words.length === 1) pending.push(w.f);
      });
      continue;
    }
    if (/당|내용량|제공량/.test(line)) continue;
    for (const m of line.matchAll(new RegExp(NUM.source, 'g'))) {
      // 따로 떨어진 숫자는 단위가 붙어 있을 때만(9로 읽힌 g 포함) 이름과 짝짓는다
      if (m[2] === 'kcal' || !(m[2] || /9$/.test(m[1]))) continue;
      const f = pending.shift();
      if (!f) break;
      if (!(f in found)) found[f] = [m[1], m[2], m[3]];
    }
  }
  let kcal = found.kcal ? Number(found.kcal[0]) : kc ?? null;
  out.kcal = kcal;
  for (const k of ['sodium', 'carb', 'sugar', 'fat', 'protein']) {
    if (found[k]) out[k] = pickValue(k, found[k][0], found[k][1], found[k][2] != null ? Number(found[k][2]) : null, kcal);
  }
  // 칼로리를 못 읽었거나 탄단지로 계산한 값보다 크게 작으면 탄단지로 계산한다
  if (out.carb !== null && out.protein !== null && out.fat !== null) {
    const calc = Math.round(out.carb * 4 + out.protein * 4 + out.fat * 9);
    if (calc > 0 && (out.kcal === null || out.kcal < calc * 0.4)) { out.kcal = calc; out.kcalEstimated = true; }
  }
// 양(g): 단위가 빠졌으면 끝의 9(g)나 09(g)를 떼어 본다. 기준량은 총 내용량보다 클 수 없다
  const amt = (m, max) => {
    if (!m) return null;
    if (m[2]) return { amount: Number(m[1]), unit: m[2].toLowerCase() };
    const c = [m[1].replace(/9$/, ''), m[1].replace(/09$/, '')].filter(Boolean).map(Number);
    const v = c.find(x => x === 100) ?? c.find(x => !max || x <= max) ?? c[0];
    return { amount: v, unit: 'g' };
  };
  out.total = amt(t.match(/총내용량[^\d\n]{0,3}(\d+(?:\.\d+)?)(g|ml)?/));
  const max = out.total && out.total.amount;
  out.basis = amt(t.match(/(\d+(?:\.\d+)?)(g|ml)?\s?당(?!류)/), max) || amt(t.match(/1\s?회제공량[^\d\n]{0,3}(\d+(?:\.\d+)?)(g|ml)?/), max);
  if (/총내용량당/.test(t) && out.total) out.basis = out.total;
  const sv = t.match(/총\s?(\d+)\s?회제공량/);
  if (sv) out.servings = Number(sv[1]);
  const tm = t.match(/총\s?\d+\s?회제공량[^\d\n]{0,2}(\d+(?:\.\d+)?)(g|ml)?/);
  if (!out.total && tm) out.total = amt(tm);
  if (!out.total && out.basis && out.servings) out.total = { amount: out.basis.amount * out.servings, unit: out.basis.unit };
  for (const k of ['carb', 'protein', 'fat', 'sugar']) if (out[k] !== null) out[k] = Math.round(out[k] * 10) / 10;
  out.found = ['kcal', 'carb', 'protein', 'fat', 'sugar', 'sodium'].filter(k => out[k] !== null).length;
  return out;
}

// 휴대폰 사진은 너무 커서 느리므로 줄여서 읽는다 (명암 보정이나 확대는 오히려 인식률이 떨어졌다)
async function labelCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

let ocrLib, ocrWorker, ocrProgress = () => {};
function loadOcrLib() {
  return ocrLib || (ocrLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = OCR_LIB;
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { ocrLib = null; rej(new Error('인식 엔진을 받지 못했어요. 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(s);
  }));
}

// onProgress(문구, 0~1)
let ocrStep = '글자 읽는 중';
async function readNutritionLabel(file, onProgress) {
  ocrProgress = onProgress || (() => {});
  const T = await loadOcrLib();
  if (!ocrWorker) {
    ocrProgress('한글 인식 데이터 받는 중 (처음 한 번만)', 0);
    ocrWorker = T.createWorker('eng+kor', 1, {
      logger: m => {
        if (m.status === 'recognizing text') ocrProgress(ocrStep, m.progress);
        else if (/loading|initializ/.test(m.status)) ocrProgress('한글 인식 데이터 받는 중 (처음 한 번만)', m.progress);
      },
    }).catch(e => { ocrWorker = null; throw e; });
  }
  const w = await ocrWorker;
  const canvas = await labelCanvas(file);
  // 표를 줄 단위로(4) 먼저 읽고, 못 읽은 항목이 있으면 다른 읽기 방식(3: 자동, 11: 흩어진 글자)으로 더 읽어 채운다.
  // 글을 이어 붙여 해석하므로 앞서 읽은 값이 우선한다
  let text = '', r = parseNutrition('');
  for (const [i, psm] of ['4', '3', '11'].entries()) {
    ocrStep = i ? '못 읽은 항목을 한 번 더 찾는 중' : '글자 읽는 중';
    ocrProgress(ocrStep, 0);
    await w.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await w.recognize(canvas);
    text += '\n' + data.text;
    r = parseNutrition(text);
    if (r.found === 6) break;
  }
  return { text, ...r };
}

if (typeof module !== 'undefined') module.exports = { parseNutrition };
