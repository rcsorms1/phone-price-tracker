# 📱 폰브라운 가격 추적기

폰브라운 카카오톡 채널의 휴대폰 정책 가격을 자동으로 수집하고, 가격 추이를 시각화해주는 웹 앱입니다.

![스크린샷](screenshot.png)

## ✨ 기능

- 📊 **가격 추이 그래프** - 1주/1달/3달/전체 기간별 가격 변동 확인
- 📱 **기종별 필터** - 아이폰, 갤럭시 등 기종별 가격 비교
- 📡 **통신사별 필터** - SKT, KT, LG U+ 별 가격 비교  
- 🤖 **매일 자동 수집** - GitHub Actions로 매일 자동 크롤링
- 💡 **인사이트 제공** - 지금이 사기 좋은 시점인지 분석
- ✏️ **수동 입력** - 크롤링 실패 시 직접 가격 입력 가능

## 🚀 설치 방법

### 1. 저장소 Fork

이 저장소를 Fork 하세요.

### 2. GitHub Pages 활성화

1. Fork한 저장소의 **Settings** 탭으로 이동
2. 좌측 메뉴에서 **Pages** 클릭
3. **Source**를 `GitHub Actions`로 선택
4. 저장

### 3. Actions 권한 설정

1. **Settings** → **Actions** → **General**
2. **Workflow permissions**에서 **Read and write permissions** 선택
3. 저장

### 4. 첫 크롤링 실행

1. **Actions** 탭으로 이동
2. **폰브라운 가격 크롤링** 워크플로우 선택
3. **Run workflow** 버튼 클릭

### 5. 완료!

`https://[사용자명].github.io/phone-price-tracker` 에서 확인하세요.

## 📁 프로젝트 구조

```
phone-price-tracker/
├── .github/
│   └── workflows/
│       └── crawl.yml        # GitHub Actions 워크플로우
├── data/
│   └── prices.json          # 수집된 가격 데이터
├── scripts/
│   └── crawler.js           # Playwright 크롤러
├── index.html               # 메인 웹페이지
├── package.json             # 의존성 관리
└── README.md
```

## ⚙️ 설정 변경

### 크롤링 시간 변경

`.github/workflows/crawl.yml`에서 cron 표현식 수정:

```yaml
schedule:
  - cron: '0 1 * * *'  # UTC 01:00 = 한국시간 10:00
```

### 다른 채널 크롤링

`scripts/crawler.js`에서 URL 수정:

```javascript
const CHANNEL_URL = 'https://pf.kakao.com/다른채널ID';
```

## 🔧 로컬에서 실행

```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install chromium

# 크롤링 실행
npm run crawl

# 로컬 서버 실행
npm run serve
```

## 📝 수동 가격 입력

크롤링이 실패하거나 직접 가격을 기록하고 싶을 때:

1. 웹페이지 하단의 **가격 직접 입력** 섹션 사용
2. 또는 `data/prices.json` 직접 수정 후 커밋

### prices.json 형식

```json
{
  "history": [
    {
      "date": "2026-01-31",
      "model": "아이폰17 프로",
      "carrier": "KT",
      "storage": 256,
      "plan": 100000,
      "price": 290000
    }
  ],
  "lastUpdated": "2026-01-31T10:00:00.000Z"
}
```

## ⚠️ 주의사항

- 카카오톡 채널 페이지 구조가 변경되면 크롤러 수정이 필요할 수 있습니다.
- 크롤링 실패 시 `data/screenshot.png`에서 페이지 상태를 확인하세요.
- 과도한 크롤링은 IP 차단 등의 문제가 발생할 수 있으니 주의하세요.

## 🤝 기여

이슈나 PR 환영합니다!

## 📄 라이선스

MIT License

---

**데이터 출처**: [폰브라운 카카오톡 채널](https://pf.kakao.com/_xoLhxcs)

이 프로젝트는 개인 용도로 제작되었습니다.
