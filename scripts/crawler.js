const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://pf.kakao.com/_xoLhxcs';
const DATA_FILE = path.join(__dirname, '..', 'data', 'prices.json');

// 기종명 매핑
const MODEL_MAP = {
  'S25': '갤럭시 S25',
  'S25+': '갤럭시 S25+',
  'S25U': '갤럭시 S25 울트라',
  'S25 엣지': '갤럭시 S25 엣지',
  'S25FE': '갤럭시 S25 FE',
  'S24': '갤럭시 S24',
  'S24+': '갤럭시 S24+',
  'S24U': '갤럭시 S24 울트라',
  '플립7': '갤럭시 Z플립7',
  '폴드7': '갤럭시 Z폴드7',
  '플립6': '갤럭시 Z플립6',
  '폴드6': '갤럭시 Z폴드6',
  '플립6 ☆': '갤럭시 Z플립6 특가',
  '폴드6 ☆': '갤럭시 Z폴드6 특가',
  '아17': '아이폰17',
  '아17에어': '아이폰17 에어',
  '아17프로': '아이폰17 프로',
  '아17프로맥스': '아이폰17 프로맥스',
  '아16': '아이폰16',
  '아16프로': '아이폰16 프로',
  '아16프로맥스': '아이폰16 프로맥스',
  '아15프로맥스': '아이폰15 프로맥스',
  '아15프로': '아이폰15 프로',
  '퀀텀6': '갤럭시 퀀텀6',
};

// 통신사 매핑
const CARRIER_MAP = {
  'SK': 'SKT',
  'KT': 'KT',
  'LG': 'LGU+'
};

// 기존 데이터 로드
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

// 데이터 저장
function saveData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('저장 완료:', DATA_FILE);
}

// 텍스트 파싱
function parseContent(text, date) {
  const results = [];
  const lines = text.split('\n');
  
  let currentCarrier = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 통신사 섹션 감지
    // 🎇🎇SK 이동/기변🎇🎇 또는 🎇🎇KT 이동/기변🎇🎇 또는 🎇🎇LG 이동/기변🎇🎇
    const carrierMatch = trimmed.match(/🎇🎇(SK|KT|LG)\s*이동\/기변🎇🎇/);
    if (carrierMatch) {
      currentCarrier = CARRIER_MAP[carrierMatch[1]];
      console.log('통신사 발견:', currentCarrier);
      continue;
    }
    
    if (!currentCarrier) continue;
    
    // 가격 라인 파싱: "기종명 이동가격/기변가격"
    // 예: S25 3/20, S25U 57/77, 아17프로 88/113, S25 -19/-27
    const priceMatch = trimmed.match(/^(.+?)\s+(-?\d+)\/(-?\d+)$/);
    if (priceMatch) {
      const rawModel = priceMatch[1].trim();
      const 이동 = parseInt(priceMatch[2]) * 10000;
      const 기변 = parseInt(priceMatch[3]) * 10000;
      
      // 모델명 매핑
      let model = MODEL_MAP[rawModel];
      if (!model) {
        // 부분 매칭 시도
        for (const [key, value] of Object.entries(MODEL_MAP)) {
          if (rawModel.includes(key) || key.includes(rawModel)) {
            model = value;
            break;
          }
        }
      }
      
      if (!model) {
        console.log('알 수 없는 기종:', rawModel);
        model = rawModel; // 그대로 사용
      }
      
      results.push({
        date,
        model,
        carrier: currentCarrier,
        type: '이동',
        price: 이동
      });
      
      results.push({
        date,
        model,
        carrier: currentCarrier,
        type: '기변',
        price: 기변
      });
      
      console.log(`${model} - ${currentCarrier}: 이동 ${이동}, 기변 ${기변}`);
    }
    
    // 구분선이나 다른 섹션 시작 시 통신사 리셋
    if (trimmed.startsWith('---') || trimmed.startsWith('===')) {
      currentCarrier = null;
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
