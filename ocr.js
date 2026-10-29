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
  else cands = /(00|09)$/.test(digits) ? [cut(2), cut(1), n] : /[09]$/.test(digits) ? [cut(1), n] : [n];
  cands = cands.filter(v => v !== null);
  if (pct != null && DAILY[field]) {
    const best = cands.map(v => [v, Math.abs(v / DAILY[field] * 100 - pct)]).sort((a, b) => a[1] - b[1])[0];
    if (best[1] <= Math.max(3, pct * 0.25)) return best[0];
  }
  // 앞에 둔 후보(단위를 떼어 낸 값)를 우선하되, 칼로리와 안 맞는 값은 뺀다
  return cands.find(ok) ?? cands[0];
}

// OCR 글자에서 영양정보를 찾는다. 못 찾은 항목은 null
function parseNutrition(raw) {
  // '1 3 0 m g'처럼 한 글자씩 띄어 읽힌 부분을 붙인다
  const joined = String(raw || '').split('\n').map(line => {
    const out = [];
    let run = '';
    for (const w of line.split(/[ \t\u3000]+/)) {
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
  // 긴 이름을 먼저 둬서 '트랜스지방', '포화지방'이 '지방'으로 잡히지 않게 한다. 앞 글자가 잘려도 찾는다
  const re = /(트랜스지방|랜스지방|포화지방|화지방|콜레스테롤|레스테롤|나트[륨름룸]|트륨|탄수[화회][물들]|수화물|당류|지방|단[백벡][질칠]|백질|열량)[^\d\n]{0,4}?(\d+(?:\.\d+)?)(kcal|mg|g)?(?:[^\d\n%]{0,12}?(\d{1,3}(?:\.\d)?)\s?%)?/g;
  const key = { 나트: 'sodium', 트륨: 'sodium', 탄수: 'carb', 수화: 'carb', 당류: 'sugar', 지방: 'fat', 단백: 'protein', 단벡: 'protein', 백질: 'protein', 열량: 'kcal' };
  const hits = [...t.matchAll(re)];
  const kcalHit = hits.find(m => m[1] === '열량');
  let kcal = kcalHit ? Number(kcalHit[2]) : null;
  if (kcal === null) {
    // '2,000kcal 기준' 안내문은 빼고 처음 나오는 값
    const k = [...t.matchAll(/(\d+(?:\.\d+)?)kcal/g)].map(m => Number(m[1])).find(v => v !== 2000);
    if (k !== undefined) kcal = k;
  }
  out.kcal = kcal;
  for (const m of hits) {
    const k = key[m[1].slice(0, 2)];
    if (!k || k === 'kcal' || out[k] !== null) continue;
    out[k] = pickValue(k, m[2], m[3], m[4] != null ? Number(m[4]) : null, kcal);
  }
  // 칼로리를 못 읽었거나 탄단지와 크게 어긋나면 탄단지로 계산한다
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
