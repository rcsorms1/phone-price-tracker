const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://pf.kakao.com/_xoLhxcs';
const DATA_FILE = path.join(__dirname, '..', 'data', 'prices.json');

const MODEL_MAP = {
  'S25': '갤럭시 S25',
  'S25+': '갤럭시 S25+',
  'S25U': '갤럭시 S25 울트라',
  'S25 엣지': '갤럭시 S25 엣지',
  'S25엣지': '갤럭시 S25 엣지',
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
  '퀀텀6': '갤럭시 퀀텀6'
};

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

function parseContent(text, date) {
  const results = [];
  
  const sections = [
    { pattern: /SK\s*이동\/기변.*?(S25[\s\S]*?)(?=KT\s*이동\/기변|LG\s*이동\/기변|$)/i, carrier: 'SKT' },
    { pattern: /KT\s*이동\/기변.*?(S25[\s\S]*?)(?=LG\s*이동\/기변|SK\s*이동\/기변|\*위치|$)/i, carrier: 'KT' },
    { pattern: /LG\s*이동\/기변.*?(S25[\s\S]*?)(?=SK\s*이동\/기변|KT\s*이동\/기변|\*위치|$)/i, carrier: 'LGU+' }
  ];
  
  for (const section of sections) {
    const match = text.match(section.pattern);
    if (!match) {
      console.log(section.carrier + ' 섹션 못 찾음');
      continue;
    }
    
    const sectionText = match[1];
    console.log('\n' + section.carrier + ' 섹션 발견:', sectionText.substring(0, 100));
    
    const pricePattern = /(S25\+|S25U|S25FE|S25\s*엣지|S25|플립7|폴드7|플립6\s*☆|폴드6\s*☆|플립6|폴드6|아17프로맥스|아17프로|아17에어|아17|아16프로맥스|아16프로|아16|아15프로맥스|아15프로|퀀텀6)\s*(-?\d+)\/(-?\d+)/g;
    
    let priceMatch;
    while ((priceMatch = pricePattern.exec(sectionText)) !== null) {
      const rawModel = priceMatch[1].trim();
      const movePrice = parseInt(priceMatch[2]) * 10000;
      const changePrice = parseInt(priceMatch[3]) * 10000;
      
      let model = MODEL_MAP[rawModel];
      if (!model) {
        const cleanModel = rawModel.replace(/\s/g, '');
        model = MODEL_MAP[cleanModel];
      }
      if (!model) {
        for (const key in MODEL_MAP) {
          if (rawModel.indexOf(key) !== -1 || key.indexOf(rawModel) !== -1) {
            model = MODEL_MAP[key];
            break;
          }
        }
      }
      if (!model) {
        console.log('알 수 없는 기종:', rawModel);
        model = rawModel;
      }
      
      results.push({
        date: date,
        model: model,
        carrier: section.carrier,
        type: '이동',
        price: movePrice
      });
      
      results.push({
        date: date,
        model: model,
        carrier: section.carrier,
        type: '기변',
        price: changePrice
      });
      
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
