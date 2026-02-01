const { chromium } = require('playwright');
const fs = require(‘fs’);
const path = require(‘path’);

const CHANNEL_URL = ‘https://pf.kakao.com/_xoLhxcs’;
const DATA_FILE = path.join(__dirname, ‘..’, ‘data’, ‘prices.json’);

// 기종명 매핑
const MODEL_MAP = {
‘S25’: ‘갤럭시 S25’,
‘S25+’: ‘갤럭시 S25+’,
‘S25U’: ‘갤럭시 S25 울트라’,
‘S25 엣지’: ‘갤럭시 S25 엣지’,
‘S25엣지’: ‘갤럭시 S25 엣지’,
‘S25FE’: ‘갤럭시 S25 FE’,
‘S24’: ‘갤럭시 S24’,
‘S24+’: ‘갤럭시 S24+’,
‘S24U’: ‘갤럭시 S24 울트라’,
‘플립7’: ‘갤럭시 Z플립7’,
‘폴드7’: ‘갤럭시 Z폴드7’,
‘플립6’: ‘갤럭시 Z플립6’,
‘폴드6’: ‘갤럭시 Z폴드6’,
‘플립6 ☆’: ‘갤럭시 Z플립6 특가’,
‘폴드6 ☆’: ‘갤럭시 Z폴드6 특가’,
‘아17’: ‘아이폰17’,
‘아17에어’: ‘아이폰17 에어’,
‘아17프로’: ‘아이폰17 프로’,
‘아17프로맥스’: ‘아이폰17 프로맥스’,
‘아16’: ‘아이폰16’,
‘아16프로’: ‘아이폰16 프로’,
‘아16프로맥스’: ‘아이폰16 프로맥스’,
‘아15프로맥스’: ‘아이폰15 프로맥스’,
‘아15프로’: ‘아이폰15 프로’,
‘퀀텀6’: ‘갤럭시 퀀텀6’,
};

// 통신사 매핑
const CARRIER_MAP = {
‘SK’: ‘SKT’,
‘KT’: ‘KT’,
‘LG’: ‘LGU+’
};

// 기존 데이터 로드
function loadExistingData() {
try {
if (fs.existsSync(DATA_FILE)) {
return JSON.parse(fs.readFileSync(DATA_FILE, ‘utf8’));
}
} catch (e) {
console.log(‘기존 데이터 없음’);
}
return { history: [], lastUpdated: null };
}

// 데이터 저장
function saveData(data) {
const dir = path.dirname(DATA_FILE);
if (!fs.existsSync(dir)) {
fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), ‘utf8’);
console.log(‘저장 완료:’, DATA_FILE);
}

// 텍스트 파싱 (한 줄로 붙어있는 경우도 처리)
function parseContent(text, date) {
const results = [];

// 통신사별로 섹션 분리
const sections = [
{ pattern: /🎇🎇SK\s*이동/기변🎇🎇([\s\S]*?)(?=🎇🎇KT|🎇🎇LG|$)/i, carrier: ‘SKT’ },
{ pattern: /🎇🎇KT\s*이동/기변🎇🎇([\s\S]*?)(?=🎇🎇LG|🎇🎇SK|[-]{10,}|$)/i, carrier: ‘KT’ },
{ pattern: /🎇🎇LG\s*이동/기변🎇🎇([\s\S]*?)(?=🎇🎇SK|🎇🎇KT|[-]{10,}|*위치|$)/i, carrier: ‘LGU+’ }
];

for (const section of sections) {
const match = text.match(section.pattern);
if (!match) {
console.log(`${section.carrier} 섹션 못 찾음`);
continue;
}

```
const sectionText = match[1];
console.log(`\n${section.carrier} 섹션 발견:`, sectionText.substring(0, 100));

// 가격 패턴: "기종명 숫자/숫자" (공백이나 다른 문자로 구분)
// 예: S25 0/15, S25+ 22/37, 아17프로 79/107, S25 -13/-21
const pricePattern = /(S25\+|S25U|S25FE|S25\s*엣지|S25|플립7|폴드7|플립6\s*☆|폴드6\s*☆|플립6|폴드6|아17프로맥스|아17프로|아17에어|아17|아16프로맥스|아16프로|아16|아15프로맥스|아15프로|퀀텀6)\s*(-?\d+)\/(-?\d+)/g;

let priceMatch;
while ((priceMatch = pricePattern.exec(sectionText)) !== null) {
  const rawModel = priceMatch[1].trim();
  const 이동 = parseInt(priceMatch[2]) * 10000;
  const 기변 = parseInt(priceMatch[3]) * 10000;
  
  // 모델명 매핑
  let model = MODEL_MAP[rawModel];
  if (!model) {
    // 공백 제거 후 재시도
    const cleanModel = rawModel.replace(/\s/g, '');
    model = MODEL_MAP[cleanModel];
  }
  if (!model) {
    // 부분 매칭
    for (const [key, value] of Object.entries(MODEL_MAP)) {
      if (rawModel.includes(key) || key.includes(rawModel)) {
        model = value;
        break;
      }
    }
  }
  if (!model) {
    console.log('알 수 없는 기종:', rawModel);
    model = rawModel;
  }
  
  results.push({
    date,
    model,
    carrier: section.carrier,
    type: '이동',
    price: 이동
  });
  
  results.push({
    date,
    model,
    carrier: section.carrier,
    type: '기변',
    price: 기변
  });
  
  console.log(`${model} - ${section.carrier}: 이동 ${이동/10000}만, 기변 ${기변/10000}만`);
}
```

}

return results;
}

async function crawl() {
console.log(‘크롤링 시작…’);
const today = new Date().toISOString().split(‘T’)[0];

const browser = await chromium.launch({
headless: true,
args: [’–no-sandbox’, ‘–disable-setuid-sandbox’]
});

const context = await browser.newContext({
userAgent: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36’
});

const page = await context.newPage();

try {
console.log(‘채널 페이지 접속…’);
await page.goto(CHANNEL_URL, { waitUntil: ‘networkidle’, timeout: 60000 });
await page.waitForTimeout(5000);

```
// 페이지 텍스트 추출
const pageText = await page.evaluate(() => document.body.innerText);
console.log('페이지 텍스트 길이:', pageText.length);

// 파싱
const todayPrices = parseContent(pageText, today);
console.log(`${todayPrices.length}개 가격 정보 추출`);

if (todayPrices.length > 0) {
  // 기존 데이터 로드
  const data = loadExistingData();
  
  // 오늘 데이터 제거 (업데이트)
  data.history = data.history.filter(item => item.date !== today);
  
  // 새 데이터 추가
  data.history = data.history.concat(todayPrices);
  data.lastUpdated = new Date().toISOString();
  data.source = '폰브라운';
  
  // 저장
  saveData(data);
} else {
  console.log('추출된 가격 정보가 없습니다.');
}

// 디버깅용 스크린샷
await page.screenshot({ 
  path: path.join(__dirname, '..', 'data', 'screenshot.png'),
  fullPage: true 
});

// 디버깅용 텍스트 저장
fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'page-text.txt'),
  pageText,
  'utf8'
);
```

} catch (error) {
console.error(‘크롤링 에러:’, error);

```
try {
  await page.screenshot({ 
    path: path.join(__dirname, '..', 'data', 'error-screenshot.png'),
    fullPage: true 
  });
} catch (e) {}
```

} finally {
await browser.close();
}

console.log(‘크롤링 완료!’);
}

crawl().catch(console.error);
