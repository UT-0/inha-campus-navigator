# Data report

Data built 2026-10-23; OpenStreetMap snapshot 2026-10-23.
Regenerate with `npm run data:build && npm run reports`.

## Counts

| | |
|---|---|
| Buildings and outdoor facilities | 27 (25 with an official number, 4 outdoor) |
| Walking paths (whole map area) | 472 links, 37.7 km |
| Path nodes | 377 |
| Entrances | 36 (16 from OSM, 20 estimated) |
| Step-free entrances mapped | 5 |
| Road crossings / stairs mapped | 9 / 0 |
| Departments with an office on the map | 65 (4 not placed) |
| Floor-directory entries | 94 |
| Places (amenities, stops) | 68 |
| Photos | 4 of 27 buildings |
| Official pages used | 90 |

### Places by map filter

| Group | From OSM | Official |
|---|---|---|
| money | 1 | 12 |
| food | 7 | 1 |
| transport | 33 | 0 |
| services | 4 | 0 |
| printing | 1 | 0 |
| study | 0 | 5 |
| health | 0 | 4 |

## How much is verified

Across 470 building facts (names, category, description, floors, opening hours, eleven amenities, outline, entrances):

| Status | Facts | Share |
|---|---|---|
| verified | 123 | 26% |
| osm | 69 | 15% |
| estimated | 27 | 6% |
| unknown | 251 | 53% |

“verified” = official Inha page (or checked on campus); “osm” = OpenStreetMap only;
“estimated” = derived by the build script; “unknown” = not found yet (see VERIFY.md).

## Sources

- OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright (snapshot in `data-raw/osm/`)
- Wikimedia Commons (photos): University Main Building — Ifflies, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:%EC%9D%B8%ED%95%98%EB%8C%80%ED%95%99%EA%B5%90_%EB%B3%B8%EA%B4%80.jpg; Building 7 (Student Center) — Ifflies, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:%EC%9D%B8%ED%95%98%EB%8C%80%ED%95%99%EA%B5%90_%ED%95%99%EC%83%9D%ED%9A%8C%EA%B4%80.jpg; Jungseok Memorial Library — Ifflies, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:%EC%9D%B8%ED%95%98%EB%8C%80%ED%95%99%EA%B5%90_%EC%A0%95%EC%84%9D%ED%95%99%EC%88%A0%EC%A0%95%EB%B3%B4%EA%B4%80.jpg; Student Club Hall — Projecthanbic, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:%EB%82%98%EB%B9%8C%EB%A0%88%EA%B4%80.jpg
- Official Inha University pages (with the date each was read):

  - [인하소개 > 캠퍼스 안내 > 건물안내](https://www.inha.ac.kr/kr/964/subview.do) — 2026-10-23
  - [인하소개 > 캠퍼스 안내 > 캠퍼스맵 (정문 기준 캠퍼스맵)](https://www.inha.ac.kr/kr/1121/subview.do) — 2026-10-23
  - [Campus Guide > Buildings (English site)](https://www.inha.ac.kr/eng/3784/subview.do) — 2026-10-23
  - [Campus map page footer](https://www.inha.ac.kr/campusMap/kr/view.do?layout=unknown&artclSeq=1) — 2026-10-23
  - [프런티어창의대학 소개 페이지](https://www.inha.ac.kr/kr/989/subview.do) — 2026-10-23
  - [공과대학 소개 페이지](https://www.inha.ac.kr/kr/990/subview.do) — 2026-10-23
  - [자연과학대학 소개 페이지](https://www.inha.ac.kr/kr/991/subview.do) — 2026-10-23
  - [경영대학 소개 페이지](https://www.inha.ac.kr/kr/992/subview.do) — 2026-10-23
  - [사범대학 소개 페이지](https://www.inha.ac.kr/kr/993/subview.do) — 2026-10-23
  - [사회과학대학 소개 페이지](https://www.inha.ac.kr/kr/994/subview.do) — 2026-10-23
  - [문과대학 소개 페이지](https://www.inha.ac.kr/kr/995/subview.do) — 2026-10-23
  - [의과대학 소개 페이지](https://www.inha.ac.kr/kr/996/subview.do) — 2026-10-23
  - [간호대학 소개 페이지](https://www.inha.ac.kr/kr/4142/subview.do) — 2026-10-23
  - [미래융합대학 소개 페이지](https://www.inha.ac.kr/kr/997/subview.do) — 2026-10-23
  - [예술체육대학 소개 페이지](https://www.inha.ac.kr/kr/998/subview.do) — 2026-10-23
  - [국제대학 소개 페이지](https://www.inha.ac.kr/kr/999/subview.do) — 2026-10-23
  - [AI융합대학 소개 페이지](https://www.inha.ac.kr/kr/3907/subview.do) — 2026-10-23
  - [바이오융합대학 소개 페이지](https://www.inha.ac.kr/kr/4097/subview.do) — 2026-10-23
  - [List of College (English site)](https://www.inha.ac.kr/eng/3588/subview.do) — 2026-10-23
  - [기계공학과 homepage](https://mech.inha.ac.kr/mech/index.do) — 2026-10-23
  - [항공우주공학과 homepage](https://aerospace.inha.ac.kr/aerospace/index.do) — 2026-10-23
  - [조선해양공학과 homepage](https://naoe.inha.ac.kr/naoe/index.do) — 2026-10-23
  - [산업경영공학과 homepage](https://ie.inha.ac.kr/ie/index.do) — 2026-10-23
  - [화학공학과 homepage](https://chemeng.inha.ac.kr/chemeng/index.do) — 2026-10-23
  - [고분자공학과 homepage](https://inhapoly.inha.ac.kr/inhapoly/index.do) — 2026-10-23
  - [신소재공학과 homepage](https://dmse.inha.ac.kr/dmse/index.do) — 2026-10-23
  - [사회인프라공학과 homepage](https://civil.inha.ac.kr/civil/index.do) — 2026-10-23
  - [환경공학과 homepage](https://environment.inha.ac.kr/environment/index.do) — 2026-10-23
  - [공간정보공학과 homepage](https://geoinfo.inha.ac.kr/geoinfo/index.do) — 2026-10-23
  - [건축학부(건축공학·건축학) homepage](https://arch.inha.ac.kr/arch/index.do) — 2026-10-23
  - [에너지자원공학과 homepage](https://eneres.inha.ac.kr/eneres/index.do) — 2026-10-23
  - [전기전자공학부 homepage](https://ee.inha.ac.kr/ee/index.do) — 2026-10-23
  - [반도체시스템공학과 homepage](https://sse.inha.ac.kr/sse/index.do) — 2026-10-23
  - [이차전지융합학과 homepage](https://ibattery.inha.ac.kr/ibattery/index.do) — 2026-10-23
  - [수학과 homepage](https://math.inha.ac.kr/math/index.do) — 2026-10-23
  - [통계학과 homepage](https://statistics.inha.ac.kr/statistics/index.do) — 2026-10-23
  - [물리학과 homepage](https://physics.inha.ac.kr/physics/index.do) — 2026-10-23
  - [화학과 homepage](https://chemistry.inha.ac.kr/chemistry/index.do) — 2026-10-23
  - [해양과학과 homepage](https://ocean.inha.ac.kr/ocean/index.do) — 2026-10-23
  - [식품영양학과 homepage](https://foodnutri.inha.ac.kr/foodnutri/index.do) — 2026-10-23
  - [경영학과 homepage](https://biz.inha.ac.kr/biz/index.do) — 2026-10-23
  - [파이낸스경영학과 homepage](https://gfiba.inha.ac.kr/gfiba/index.do) — 2026-10-23
  - [아태물류학부 homepage](https://apsl.inha.ac.kr/apsl/index.do) — 2026-10-23
  - [국제통상학과 homepage](https://star.inha.ac.kr/star/index.do) — 2026-10-23
  - [국어교육과 homepage](https://koreanedu.inha.ac.kr/koreanedu/index.do) — 2026-10-23
  - [영어교육과 homepage](https://dele.inha.ac.kr/dele/index.do) — 2026-10-23
  - [사회교육과 homepage](https://socialedu.inha.ac.kr/socialedu/index.do) — 2026-10-23
  - [교육학과 homepage](https://education.inha.ac.kr/education/index.do) — 2026-10-23
  - [체육교육과 homepage](https://physicaledu.inha.ac.kr/physicaledu/index.do) — 2026-10-23
  - [수학교육과 homepage](https://mathed.inha.ac.kr/mathed/index.do) — 2026-10-23
  - [행정학과 homepage](https://publicad.inha.ac.kr/publicad/index.do) — 2026-10-23
  - [정치외교학과 homepage](https://political.inha.ac.kr/political/index.do) — 2026-10-23
  - [미디어커뮤니케이션학과 homepage](https://comm.inha.ac.kr/comm/index.do) — 2026-10-23
  - [경제학과 homepage](https://econ.inha.ac.kr/econ/index.do) — 2026-10-23
  - [소비자학과 homepage](https://consumer.inha.ac.kr/consumer/index.do) — 2026-10-23
  - [아동심리학과 homepage](https://child.inha.ac.kr/child/index.do) — 2026-10-23
  - [사회복지학과 homepage](https://welfare.inha.ac.kr/welfare/index.do) — 2026-10-23
  - [한국어문학과 homepage](https://korean.inha.ac.kr/korean/index.do) — 2026-10-23
  - [사학과 homepage](https://history.inha.ac.kr/history/index.do) — 2026-10-23
  - [철학과 homepage](https://philosophy.inha.ac.kr/philosophy/index.do) — 2026-10-23
  - [중국학과 homepage](https://chinese.inha.ac.kr/chinese/index.do) — 2026-10-23
  - [일본언어문화학과 homepage](https://japan.inha.ac.kr/japan/index.do) — 2026-10-23
  - [영미유럽인문융합학부 (영어영문학전공) homepage](https://ees.inha.ac.kr/ees/index.do) — 2026-10-23
  - [문화콘텐츠문화경영학과 homepage](https://culturecm.inha.ac.kr/culturecm/index.do) — 2026-10-23
  - [간호학과 homepage](https://nursing.inha.ac.kr/nursing/index.do) — 2026-10-23
  - [조형예술학과 homepage](https://finearts.inha.ac.kr/finearts/index.do) — 2026-10-23
  - [디자인융합학과 homepage](https://design.inha.ac.kr/design/index.do) — 2026-10-23
  - [스포츠과학과 homepage](https://sport.inha.ac.kr/sport/index.do) — 2026-10-23
  - [연극영화학과 homepage](https://theatrefilm.inha.ac.kr/theatrefilm/index.do) — 2026-10-23
  - [의류디자인학과 homepage](https://fashion.inha.ac.kr/fashion/index.do) — 2026-10-23
  - [인공지능공학과 homepage](https://doai.inha.ac.kr/doai/index.do) — 2026-10-23
  - [데이터사이언스학과 homepage](https://datascience.inha.ac.kr/datascience/index.do) — 2026-10-23
  - [스마트모빌리티공학과 homepage](https://sme.inha.ac.kr/sme/index.do) — 2026-10-23
  - [디자인테크놀로지학과 homepage](https://designtech.inha.ac.kr/designtech/index.do) — 2026-10-23
  - [컴퓨터공학과 homepage](https://cse.inha.ac.kr/cse/index.do) — 2026-10-23
  - [생명공학과 homepage](https://bio.inha.ac.kr/bio/index.do) — 2026-10-23
  - [바이오제약공학과 homepage](https://biopharm.inha.ac.kr/biopharm/index.do) — 2026-10-23
  - [생명과학과 homepage](https://biology.inha.ac.kr/biology/index.do) — 2026-10-23
  - [첨단바이오의약학과 homepage](https://biomedical.inha.ac.kr/biomedical/index.do) — 2026-10-23
  - [바이오식품공학과 homepage](https://foodscience.inha.ac.kr/foodscience/index.do) — 2026-10-23
  - [자유전공융합학부 homepage](https://las.inha.ac.kr/las/index.do) — 2026-10-23
  - [보건센터](https://www.inha.ac.kr/eng/3758/subview.do) — 2026-10-23
  - [학생상담센터](https://www.inha.ac.kr/kr/1079/subview.do) — 2026-10-23
  - [IT인프라팀 (무선인터넷 문의)](https://internet.inha.ac.kr/internet/index.do) — 2026-10-23
  - [여학생 휴게실](https://www.inha.ac.kr/kr/1076/subview.do) — 2026-10-23
  - [ATM (English site)](https://www.inha.ac.kr/eng/3735/subview.do) — 2026-10-23
  - [식당안내 > 학생식당(학생회관)](https://www.inha.ac.kr/kr/1072/subview.do) — 2026-10-23
  - [무선인터넷 서비스](https://www.inha.ac.kr/kr/1067/subview.do) — 2026-10-23
  - [학교 오시는 길](https://www.inha.ac.kr/kr/970/subview.do) — 2026-10-23
  - [셔틀버스(무료)](https://www.inha.ac.kr/kr/971/subview.do) — 2026-10-23
