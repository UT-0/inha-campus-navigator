/**
 * Korean UI strings (한국어). Keys mirror en.js. Templates avoid particles
 * that depend on the previous syllable (을/를, 이/가) so they read naturally
 * with any building or place name.
 */
export default {
  // App
  'app.title': '인하 캠퍼스 내비게이터',
  'app.loading': '캠퍼스 지도를 불러오는 중…',
  'app.sampleData': '샘플 데이터 — 실제 캠퍼스 배치가 아닙니다',

  // Accessibility
  'a11y.skipToPanel': '경로 찾기로 건너뛰기',
  'a11y.panel': '경로 찾기 및 건물 정보',
  'a11y.map': '캠퍼스 지도. 키보드로 건물을 선택하려면 패널의 건물 목록을 사용하세요.',
  'a11y.buildingButton': '{number}. {name}, {category}',

  // Settings
  'settings.language': '언어',
  'settings.toDark': '다크 모드로 전환',
  'settings.toLight': '라이트 모드로 전환',

  // Global search
  'search.label': '캠퍼스 검색',
  'search.placeholder': '건물, 강의, 강의실 검색…',
  'search.clear': '검색어 지우기',
  'search.noResults': '“{query}”에 대한 결과가 없습니다',
  'search.group.building': '건물',
  'search.group.course': '강의',
  'search.group.room': '강의실',
  'search.group.department': '학과·부서',
  'search.group.facility': '편의시설',
  'search.group.place': '장소',
  'search.roomIn': '{room}호',
  'search.inBuilding': '{building}',

  // Route panel
  'route.title': '길 찾기',
  'route.from': '출발',
  'route.fromPlaceholder': '지금 가까운 건물…',
  'route.to': '도착',
  'route.toPlaceholder': '가고 싶은 건물…',
  'route.swap': '출발지와 도착지 바꾸기',
  'route.find': '경로 찾기',
  'route.hintBoth': '현재 위치와 목적지를 선택하세요.',
  'route.hintFrom': '이제 가까운 건물을 선택하세요.',
  'route.hintTo': '이제 목적지를 선택하세요.',
  'route.recent': '최근 경로',
  'route.recentItem': '{from} → {to}',
  'route.clearField': '지우기',
  'route.noOptions': '일치하는 건물이 없습니다',

  // Welcome / empty state
  'welcome.title': '캠퍼스 길 찾기',
  'welcome.text': '가까운 건물과 목적지를 선택하거나, 지도에서 건물을 눌러 내부 정보를 확인하세요.',

  // Result card
  'result.title': '추천 경로',
  'result.walk': '도보',
  'result.minutes': '약 {n}분',
  'result.directions': '단계별 안내',
  'result.clear': '경로 지우기',
  'result.share': '공유 링크 복사',
  'result.stairs': '계단 포함',
  'result.covered': '일부 지붕 있음',
  'result.sameTitle': '이미 도착했어요!',
  'result.sameText': '출발지와 도착지가 같은 건물입니다.',
  'result.noneTitle': '경로를 찾을 수 없습니다',
  'result.noneText': '지도 데이터에서 두 건물을 잇는 길이 없습니다.',
  'result.announce': '{from}에서 {to}까지 경로: {distance}, 약 {minutes}분, {steps}단계.',
  'result.stepLabel': '{n}단계',

  // Units
  'units.m': '{n}m',
  'units.km': '{n}km',

  // Directions
  'dir.exit': '**{building}**의 {side}쪽 출입구로 나오세요.',
  'dir.head': '{direction}쪽으로 {distance} 걸으세요.',
  'dir.headPast': '{landmark} 앞을 지나 {direction}쪽으로 {distance} 걸으세요.',
  'dir.turn': '{turn} {distance} 걸으세요.',
  'dir.turnAt': '{place}에서 {turn} {distance} 걸으세요.',
  'dir.turnPast': '{turn} {landmark} 앞을 지나 {distance} 걸으세요.',
  'dir.turnAtPast': '{place}에서 {turn} {landmark} 앞을 지나 {distance} 걸으세요.',
  'dir.arrive': '{side}쪽 출입구를 통해 **{building}**에 도착합니다.',
  'dir.stairs': '계단에 주의하세요.',
  'turn.straight': '직진하여',
  'turn.slight-left': '약간 왼쪽으로 꺾어',
  'turn.slight-right': '약간 오른쪽으로 꺾어',
  'turn.left': '왼쪽으로 돌아',
  'turn.right': '오른쪽으로 돌아',
  'turn.sharp-left': '왼쪽으로 크게 꺾어',
  'turn.sharp-right': '오른쪽으로 크게 꺾어',
  'turn.uturn': '뒤로 돌아',
  'compass.north': '북',
  'compass.northeast': '북동',
  'compass.east': '동',
  'compass.southeast': '남동',
  'compass.south': '남',
  'compass.southwest': '남서',
  'compass.west': '서',
  'compass.northwest': '북서',
  'side.north': '북',
  'side.east': '동',
  'side.south': '남',
  'side.west': '서',

  // Categories
  'category.academic': '강의동',
  'category.library': '도서관',
  'category.dormitory': '기숙사',
  'category.admin': '행정',
  'category.sports': '체육',
  'category.food': '식당',
  'category.other': '기타',

  // Facilities and POI types
  'facility.cafe': '카페',
  'facility.printer': '프린터',
  'facility.atm': 'ATM',
  'facility.restroom': '화장실',
  'facility.convenience_store': '편의점',
  'facility.restaurant': '식당',
  'facility.parking': '주차장',
  'facility.bus_stop': '버스 정류장',
  'facility.gate': '출입문',
  'facility.elevator': '엘리베이터',
  'facility.wifi': '와이파이',
  'facility.study_room': '스터디룸',
  'facility.lounge': '라운지',
  'facility.lockers': '사물함',
  'facility.laundry': '세탁실',

  // Building panel
  'building.back': '뒤로',
  'building.number': '{number}번 건물',
  'building.photo': '사진 준비 중',
  'building.floors': '층수',
  'building.floorsValue': '{n}층',
  'building.hours': '운영 시간',
  'building.about': '소개',
  'building.departments': '학과 및 부서',
  'building.facilities': '편의시설',
  'building.rooms': '강의실',
  'building.courses': '이 건물의 강의',
  'building.noCourses': '이 건물에 등록된 강의가 없습니다.',
  'building.none': '정보 없음',
  'building.startHere': '여기서 출발',
  'building.goHere': '여기로 가기',
  'building.zoom': '건물 확대',
  'building.courseRoom': '{room}호',

  // Building list
  'list.title': '전체 건물',
  'list.hint': '지도를 사용하지 않고 건물 정보를 열 수 있습니다.',

  // Map controls and widgets
  'map.zoomIn': '확대',
  'map.zoomOut': '축소',
  'map.reset': '전체 보기',
  'map.north': '북쪽',
  'map.legend': '범례',
  'map.legendBuildings': '건물',
  'map.legendPlaces': '장소',
  'map.legendRoute': '경로',
  'map.start': '출발',
  'map.destination': '도착',
  'map.scale': '축척: {distance}',

  // Toasts
  'toast.linkCopied': '링크를 복사했습니다',
  'toast.copyFailed': '링크를 복사하지 못했습니다',
  'toast.noRoute': '두 건물 사이의 경로를 찾을 수 없습니다',
  'toast.fromSet': '출발: {name}',
  'toast.toSet': '도착: {name}',
  'toast.invalidLink': '링크의 일부 건물을 찾을 수 없습니다',

  // Bottom sheet (phones)
  'sheet.expand': '패널 펼치기',
  'sheet.collapse': '패널 접기',

  // Error screen
  'error.title': '캠퍼스 지도를 불러올 수 없습니다',
  'error.text': '캠퍼스 데이터가 없거나 올바르지 않습니다. campus.json을 확인한 뒤 새로고침하세요.',
  'error.reload': '새로고침',
};
