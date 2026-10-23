/**
 * English UI strings. Keys are shared with ko.js; `{name}` marks a value
 * filled in by `t(key, params)`. Text wrapped in **double asterisks** is
 * rendered bold by the UI.
 */
export default {
  // App
  'app.title': 'Inha Campus Navigator',
  'app.loading': 'Loading campus map…',
  'app.sampleData': 'Sample data — not the real campus layout',

  // Accessibility
  'a11y.skipToPanel': 'Skip to route planner',
  'a11y.panel': 'Route planner and building information',
  'a11y.map':
    'Campus map. Use the building list in the panel to choose buildings with the keyboard.',
  'a11y.buildingButton': '{number}. {name}, {category}',

  // Settings
  'settings.language': 'Language',
  'settings.toDark': 'Switch to dark mode',
  'settings.toLight': 'Switch to light mode',

  // Global search
  'search.label': 'Search the campus',
  'search.placeholder': 'Search buildings, courses, rooms…',
  'search.clear': 'Clear search',
  'search.noResults': 'No matches for “{query}”',
  'search.group.building': 'Buildings',
  'search.group.course': 'Courses',
  'search.group.room': 'Rooms',
  'search.group.department': 'Departments',
  'search.group.facility': 'Facilities',
  'search.group.place': 'Places',
  'search.roomIn': 'Room {room}',
  'search.inBuilding': '{building}',

  // Route panel
  'route.title': 'Plan a walk',
  'route.from': 'From',
  'route.fromPlaceholder': 'I’m near…',
  'route.to': 'To',
  'route.toPlaceholder': 'I want to go to…',
  'route.swap': 'Swap start and destination',
  'route.find': 'Find route',
  'route.hintBoth': 'Choose where you are and where you want to go.',
  'route.hintFrom': 'Now choose the building you’re near.',
  'route.hintTo': 'Now choose where you want to go.',
  'route.recent': 'Recent routes',
  'route.recentItem': '{from} → {to}',
  'route.clearField': 'Clear',
  'route.noOptions': 'No buildings match',

  // Welcome / empty state
  'welcome.title': 'Find your way around campus',
  'welcome.text':
    'Pick the building you’re near and where you want to go — or tap any building on the map to see what’s inside.',

  // Result card
  'result.title': 'Your route',
  'result.walk': 'walk',
  'result.minutes': 'about {n} min',
  'result.directions': 'Step-by-step directions',
  'result.clear': 'Clear route',
  'result.share': 'Copy share link',
  'result.stairs': 'Includes stairs',
  'result.covered': 'Partly covered',
  'result.sameTitle': 'You’re already here!',
  'result.sameText': 'Start and destination are the same building.',
  'result.noneTitle': 'No route found',
  'result.noneText': 'These buildings aren’t connected by a walkway in the map data.',
  'result.announce':
    'Route found from {from} to {to}: {distance}, about {minutes} minutes, {steps} steps.',
  'result.stepLabel': 'Step {n}',

  // Units
  'units.m': '{n} m',
  'units.km': '{n} km',

  // Directions
  'dir.exit': 'Exit **{building}** from the {side} entrance.',
  'dir.head': 'Head {direction} for {distance}.',
  'dir.headPast': 'Head {direction} for {distance}, passing {landmark}.',
  'dir.turn': '{turn} and walk {distance}.',
  'dir.turnAt': '{turn} at {place} and walk {distance}.',
  'dir.turnPast': '{turn} and walk {distance}, passing {landmark}.',
  'dir.turnAtPast': '{turn} at {place} and walk {distance}, passing {landmark}.',
  'dir.arrive': 'Arrive at **{building}** ({side} entrance).',
  'dir.stairs': 'Watch for stairs.',
  'turn.straight': 'Continue straight',
  'turn.slight-left': 'Turn slightly left',
  'turn.slight-right': 'Turn slightly right',
  'turn.left': 'Turn left',
  'turn.right': 'Turn right',
  'turn.sharp-left': 'Turn sharp left',
  'turn.sharp-right': 'Turn sharp right',
  'turn.uturn': 'Turn around',
  'compass.north': 'north',
  'compass.northeast': 'northeast',
  'compass.east': 'east',
  'compass.southeast': 'southeast',
  'compass.south': 'south',
  'compass.southwest': 'southwest',
  'compass.west': 'west',
  'compass.northwest': 'northwest',
  'side.north': 'north',
  'side.east': 'east',
  'side.south': 'south',
  'side.west': 'west',

  // Categories
  'category.academic': 'Academic',
  'category.library': 'Library',
  'category.dormitory': 'Dormitory',
  'category.admin': 'Administration',
  'category.sports': 'Sports',
  'category.food': 'Food',
  'category.other': 'Other',

  // Facilities and POI types
  'facility.cafe': 'Café',
  'facility.printer': 'Printer',
  'facility.atm': 'ATM',
  'facility.restroom': 'Restroom',
  'facility.convenience_store': 'Convenience store',
  'facility.restaurant': 'Restaurant',
  'facility.parking': 'Parking',
  'facility.bus_stop': 'Bus stop',
  'facility.gate': 'Gate',
  'facility.elevator': 'Elevator',
  'facility.wifi': 'Wi-Fi',
  'facility.study_room': 'Study room',
  'facility.lounge': 'Lounge',
  'facility.lockers': 'Lockers',
  'facility.laundry': 'Laundry',

  // Building panel
  'building.back': 'Back',
  'building.number': 'Building {number}',
  'building.photo': 'Photo coming soon',
  'building.floors': 'Floors',
  'building.floorsValue': '{n} floors',
  'building.hours': 'Opening hours',
  'building.about': 'About',
  'building.departments': 'Departments & offices',
  'building.facilities': 'Facilities',
  'building.rooms': 'Rooms',
  'building.courses': 'Courses held here',
  'building.noCourses': 'No courses are listed for this building.',
  'building.none': 'None listed',
  'building.startHere': 'Start here',
  'building.goHere': 'Go here',
  'building.zoom': 'Zoom to building',
  'building.courseRoom': 'Room {room}',

  // Building list (keyboard fallback for the map)
  'list.title': 'All buildings',
  'list.hint': 'Open any building’s details without using the map.',

  // Map controls and widgets
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.reset': 'Reset view',
  'map.north': 'North',
  'map.legend': 'Legend',
  'map.legendBuildings': 'Buildings',
  'map.legendPlaces': 'Places',
  'map.legendRoute': 'Route',
  'map.start': 'Start',
  'map.destination': 'Destination',
  'map.scale': 'Scale: {distance}',

  // Toasts
  'toast.linkCopied': 'Link copied to clipboard',
  'toast.copyFailed': 'Couldn’t copy the link',
  'toast.noRoute': 'No route found between these buildings',
  'toast.fromSet': 'Starting from {name}',
  'toast.toSet': 'Going to {name}',
  'toast.invalidLink': 'Some buildings in the link weren’t found',

  // Bottom sheet (phones)
  'sheet.expand': 'Expand panel',
  'sheet.collapse': 'Collapse panel',

  // Error screen
  'error.title': 'Couldn’t load the campus map',
  'error.text':
    'The campus data is missing or invalid. Please check campus.json and reload the page.',
  'error.reload': 'Reload',
};
