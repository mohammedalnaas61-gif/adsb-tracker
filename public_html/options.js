// ── KML settings (unchanged) ──────────────────────────────────────────────────
var listKMLType = ['Approch', 'Departure', 'Transit', 'Custom1', 'Custom2'];
var listKMLs    = localStorage['listKMLs'] || [];

// ── optionsInitalize ──────────────────────────────────────────────────────────
// Called once during initialize(), just before the 1-sec interval is started.
function optionsInitalize() {

	// Legacy jQuery dialog — kept for compatibility with gmap.html modal hook
	$('#dialog-modal').dialog({
		height       : 140,
		modal        : true,
		autoOpen     : false,
		closeOnEscape: false
	});

	// Seed localStorage defaults for any setting not yet written.
	// Using string 'true'/'false' keeps everything serialisable without JSON.
	if (localStorage['showTrails']        === undefined) { localStorage['showTrails']        = 'true';  }
	if (localStorage['showAirportLabels'] === undefined) { localStorage['showAirportLabels'] = 'true';  }
}

// ── optionsModal ──────────────────────────────────────────────────────────────
function optionsModal() {
	$('#dialog-modal').dialog('open');
}

// ── toggleTrails ──────────────────────────────────────────────────────────────
// Flips the showTrails preference in localStorage.
// planeObject.js / extension.js can read localStorage['showTrails'] to decide
// whether to call funcUpdateLines() for non-selected aircraft.
function toggleTrails() {
	var current = localStorage['showTrails'] !== 'false'; // default true
	localStorage['showTrails'] = current ? 'false' : 'true';
	return localStorage['showTrails'] === 'true';
}

// ── toggleAirportLabels ───────────────────────────────────────────────────────
// Flips the showAirportLabels preference in localStorage.
// A Leaflet layer or overlay can query this flag to show/hide airport markers.
function toggleAirportLabels() {
	var current = localStorage['showAirportLabels'] !== 'false'; // default true
	localStorage['showAirportLabels'] = current ? 'false' : 'true';
	return localStorage['showAirportLabels'] === 'true';
}

// ── clearAircraftCache ────────────────────────────────────────────────────────
// Wipes window.AircraftMetaCache (populated by extension.js).
// Safe to call at any time; guards against the cache not existing yet.
function clearAircraftCache() {
	if (window.AircraftMetaCache && typeof window.AircraftMetaCache === 'object') {
		window.AircraftMetaCache = {};
	}
}
