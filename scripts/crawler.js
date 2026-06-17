const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://pf.kakao.com/_xoLhxcs';
const DATA_FILE = path.join(__dirname, '..', 'data', 'prices.json');

// ============================================================================
// 모델명 처리
// ----------------------------------------------------------------------------
// 기종 약칭은 "계열(S/아이폰/플립/폴드/퀀텀)은 고정 + 버전 숫자만 변동" 구조다.
// 따라서 숫자를 하드코딩하지 않고 계열 패턴으로 일반화한다.
// → S26, S27, 아18, 플립8 같은 신모델이 코드 수정 없이 자동 반영된다.
//
// 새 "계열"(예: 미래의 새 제품군)이 추가될 때만 아래 MODEL_TOKEN과
// toFullName()에 한 줄씩 추가하면 된다.
//
// OVERRIDE: 계열 규칙으로 풀리지 않는 불규칙 약칭만 수동 지정 (보통 비어있음).
const OVERRIDE = {
  // 예) '특정약칭': '정식 모델명'
};

// 가격 라인에서 "모델 약칭"으로 인식할 토큰 패턴 (계열별)
//  - S\d{2}            : 갤럭시 S (S25, S26 ...) + 선택 접미사(+, U, FE, 엣지)
//  - 아\d{2}           : 아이폰 (아17, 아18 ...) + 선택 접미사(프로맥스/프로/에어/E)
//  - 플립\d+ / 폴립\d+ : 갤럭시 Z플립 (폴립은 소스 오타 보정) + 선택(FE, ☆)
//  - 폴드\d+           : 갤럭시 Z폴드 + 선택(FE, ☆)
//  - 퀀텀\d+           : 갤럭시 퀀텀
const MODEL_TOKEN =
  'S\\d{2}(?:\\+|U|FE|\\s*엣지)?' +
  '|아\\d{2}(?:프로맥스|프로|에어|E)?' +
  '|플립\\d+(?:FE|\\s*☆)?' +
  '|폴립\\d+(?:FE|\\s*☆)?' +
  '|폴드\\d+(?:FE|\\s*☆)?' +
  '|퀀텀\\d+';

// 약칭 토큰 → 정식 모델명. 인식 불가 시 null 반환.
function toFullName(raw) {
  if (OVERRIDE[raw]) return OVERRIDE[raw];
  const t = raw.replace(/\s+/g, '');           // "S25 엣지" → "S25엣지"
  if (OVERRIDE[t]) return OVERRIDE[t];
  let m;
  if ((m = t.match(/^S(\d{2})(\+|U|FE|엣지)?$/))) {
    const suf = { '+': '+', 'U': ' 울트라', 'FE': ' FE', '엣지': ' 엣지' }[m[2]] || '';
    return `갤럭시 S${m[1]}${suf}`;
  }
  if ((m = t.match(/^아(\d{2})(프로맥스|프로|에어|E)?$/))) {
    const suf = { '프로맥스': ' 프로맥스', '프로': ' 프로', '에어': ' 에어', 'E': 'e' }[m[2]] || '';
    return `아이폰${m[1]}${suf}`;
  }
  if ((m = t.match(/^(?:플립|폴립)(\d+)(FE|☆)?$/))) {        // 폴립 = 소스 오타 보정
    const suf = m[2] === 'FE' ? ' FE' : m[2] === '☆' ? ' 특가' : '';
    return `갤럭시 Z플립${m[1]}${suf}`;
  }
  if ((m = t.match(/^폴드(\d+)(FE|☆)?$/))) {
    const suf = m[2] === 'FE' ? ' FE' : m[2] === '☆' ? ' 특가' : '';
    return `갤럭시 Z폴드${m[1]}${suf}`;
  }
  if ((m = t.match(/^퀀텀(\d+)$/))) return `갤럭시 퀀텀${m[1]}`;
  return null;
}

function loadExistingData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('기존 데이터 없음');
  }
  return { history: [], lastUpdated: null };
}

function saveData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('저장 완료:', DATA_FILE);
}

// 메인 가격표 헤더는 🎇로 감싸져 있다 (예: 🎇🎇SK 이동/기변🎇🎇).
// 같은 'SK 이동/기변' 문구를 쓰는 프로모션 미니표는 🎇가 없고, 조건별로 값이
// 여러 개라 모호하므로 메인표만 파싱한다. (히스토리 136일 전체에서 🎇 헤더 100% 존재)
// 만약 🎇 헤더를 못 찾으면(향후 양식 변경 대비) 🎇 없는 일반 헤더로 폴백한다.
function buildSections(useFire) {
  const head = c => useFire
    ? '(?:🎇+\\s*)?' + c + '\\s*이동\\/기변\\s*🎇+'
    : c + '\\s*이동\\/기변';
  const next = useFire
    ? '(?:🎇+\\s*)?(?:SK|KT|LG)\\s*이동\\/기변\\s*🎇+|\\*위치|$'
    : '(?:SK|KT|LG)\\s*이동\\/기변|\\*위치|$';
  const mk = c => new RegExp(head(c) + '([\\s\\S]*?)(?=' + next + ')', 'i');
  return [
    { pattern: mk('SK'), carrier: 'SKT' },
    { pattern: mk('KT'), carrier: 'KT' },
    { pattern: mk('LG'), carrier: 'LGU+' }
  ];
}

function parseContent(text, date) {
  const results = [];
  const pricePattern = new RegExp('(' + MODEL_TOKEN + ')\\s*(-?\\d+)\\/(-?\\d+)', 'g');

  // 1차: 🎇 메인표 / 2차(폴백): 일반 헤더
  let sections = buildSections(true);
  let foundAny = sections.some(s => text.match(s.pattern));
  if (!foundAny) {
    console.log('🎇 메인표 헤더 없음 → 일반 헤더로 폴백');
    sections = buildSections(false);
  }

  for (const section of sections) {
    const match = text.match(section.pattern);
    if (!match) {
      console.log(section.carrier + ' 섹션 못 찾음');
      continue;
    }

    const sectionText = match[1];
    console.log('\n' + section.carrier + ' 섹션 발견:', sectionText.substring(0, 100));

    pricePattern.lastIndex = 0;
    let priceMatch;
    while ((priceMatch = pricePattern.exec(sectionText)) !== null) {
      const rawModel = priceMatch[1].trim();
      const movePrice = parseInt(priceMatch[2]) * 10000;
      const changePrice = parseInt(priceMatch[3]) * 10000;

      let model = toFullName(rawModel);
      if (!model) {
        console.log('알 수 없는 기종(원본 약칭 그대로 저장):', rawModel);
        model = rawModel;
      }

      results.push({ date, model, carrier: section.carrier, type: '이동', price: movePrice });
      results.push({ date, model, carrier: section.carrier, type: '기변', price: changePrice });

      console.log(model + ' - ' + section.carrier + ': 이동 ' + (movePrice/10000) + '만, 기변 ' + (changePrice/10000) + '만');
    }
  }

  return results;
}

async function crawl() {
  console.log('크롤링 시작...');
  const today = new Date().toISOString().split('T')[0];
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('채널 페이지 접속...');
    await page.goto(CHANNEL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    const pageText = await page.evaluate(function() { return document.body.innerText; });
    console.log('페이지 텍스트 길이:', pageText.length);
    
    const todayPrices = parseContent(pageText, today);
    console.log(todayPrices.length + '개 가격 정보 추출');
    
    if (todayPrices.length > 0) {
      const data = loadExistingData();
      data.history = data.history.filter(function(item) { return item.date !== today; });
      data.history = data.history.concat(todayPrices);
      data.lastUpdated = new Date().toISOString();
      data.source = '폰브라운';
      saveData(data);
    } else {
      console.log('추출된 가격 정보가 없습니다.');
    }
    
    await page.screenshot({ 
      path: path.join(__dirname, '..', 'data', 'screenshot.png'),
      fullPage: true 
    });
    
    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'page-text.txt'),
      pageText,
      'utf8'
    );
    
  } catch (error) {
    console.error('크롤링 에러:', error);
    
    try {
      await page.screenshot({ 
        path: path.join(__dirname, '..', 'data', 'error-screenshot.png'),
        fullPage: true 
      });
    } catch (e) {}
    
  } finally {
    await browser.close();
  }
  
  console.log('크롤링 완료!');
}

crawl().catch(console.error);
