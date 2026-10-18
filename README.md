# 식단 관리 (PWA)

나이·키·몸무게로 BMI, 기초대사량, 하루 권장 칼로리와 영양소를 계산하고, 먹은 음식과 운동을 기록해 오늘 섭취량이 부족한지 과한지 알려 주는 웹앱입니다.

- 아이폰: 사파리에서 열고 공유 버튼 → **홈 화면에 추가**
- 안드로이드: 크롬에서 열고 ⋮ 메뉴 → **앱 설치**

## 구성

| 파일 | 내용 |
| --- | --- |
| `index.html` | 화면 뼈대 |
| `app.js` | 계산, 경고·응원 메시지, 화면 그리기 |
| `data.js` | 내장 음식 사전(한식 위주, 1인분 기준)과 운동 MET 값 |
| `style.css` | 디자인 (라이트/다크 모드) |
| `sw.js`, `manifest.webmanifest`, `icons/` | 설치·오프라인 지원 |

- 기록은 기기의 `localStorage`에만 저장됩니다. 내 정보 화면에서 백업/불러오기를 할 수 있습니다.
- 내장 사전에 없는 음식은 [Open Food Facts](https://world.openfoodfacts.org) 에서 100g 기준 영양정보를 찾습니다.
- 칼로리 계산: Mifflin-St Jeor 기초대사량 × 활동계수, 운동은 MET × 체중 × 시간.
- 앱 파일을 고치면 `sw.js`의 `VERSION`을 올려야 설치된 앱이 새 버전을 받습니다.

## 배포

GitHub Pages: Settings → Pages → Branch `main` / `(root)`.
