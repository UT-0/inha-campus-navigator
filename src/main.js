/**
 * App entry point.
 *
 * Phase 1: loads the global styles and shows the empty layout
 * (sidebar / bottom sheet + map area). Later phases wire up data, the map
 * and the UI modules here.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/map.css';

document.getElementById('route-panel').textContent = 'Route planner coming soon.';
document.getElementById('map-loading').classList.add('is-hidden');
