// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION — Aircraft detail card with photo + metadata + flight history
// ═══════════════════════════════════════════════════════════════════════════

var _extLastRendered = null;
var _extLastData     = null;

function extendedInitalize() {
	window.AircraftMetaCache = {};

	// Inject CSS for the extension card
	if (document.getElementById('adsb-ext-styles')) return;
	var s = document.createElement('style');
	s.id = 'adsb-ext-styles';
	s.textContent = [
		// Photo card
		'.ac-photo-card{background:#0d1520;border-top:1px solid rgba(0,210,180,0.15);padding:0;overflow:hidden;}',
		'.ac-photo-wrap{position:relative;width:100%;max-height:200px;overflow:hidden;background:#070b10;}',
		'.ac-photo-wrap img{width:100%;display:block;object-fit:cover;max-height:200px;transition:opacity 0.5s;}',
		'.ac-photo-credit{position:absolute;bottom:4px;right:6px;font-size:8px;color:rgba(255,255,255,0.6);background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:2px;}',
		'.ac-no-photo{width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0a1018,#111c2e);color:#2a4a44;font-family:"Share Tech Mono",monospace;font-size:11px;letter-spacing:0.1em;}',
		'.ac-photo-loading{width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:#0a1018;}',
		'.ac-photo-loading::after{content:"";width:20px;height:20px;border:2px solid rgba(0,210,180,0.2);border-top-color:#00d2b4;border-radius:50%;animation:ac-spin 0.8s linear infinite;}',
		'@keyframes ac-spin{to{transform:rotate(360deg);}}',
		// Info rows
		'.ac-info{padding:8px 12px;background:#111c2e;}',
		'.ac-info-row{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(0,210,180,0.06);}',
		'.ac-info-row:last-child{border-bottom:none;}',
		'.ac-lbl{font-family:"Exo 2",sans-serif;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#7fa8a0;flex-shrink:0;margin-right:8px;}',
		'.ac-val{font-family:"Share Tech Mono",monospace;font-size:11px;color:#e8f4f0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;}',
		'.ac-val.accent{color:#00d2b4;}',
		// History section
		'.hist-card{padding:6px 10px;background:#0d1520;border-top:1px solid rgba(0,210,180,0.1);}',
		'.hist-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-family:"Share Tech Mono",monospace;font-size:10px;cursor:pointer;border-bottom:1px solid rgba(0,210,180,0.04);transition:background 0.15s;}',
		'.hist-row:hover{background:rgba(0,210,180,0.05);}',
		'.hist-icao{color:#00d2b4;width:60px;}',
		'.hist-flight{color:#e8f4f0;flex:1;}',
		'.hist-time{color:#7fa8a0;font-size:9px;}',
		'.hist-active{color:#39ff6e;}',
		'.hist-ended{color:#ff6b35;}',
		'.hist-count{font-size:9px;color:#3a5a54;padding:4px 0;text-align:center;letter-spacing:0.1em;}'
	].join('\n');
	document.head.appendChild(s);
}

// ── extendedPulse ───────────────────────────────────────────────────────────
// Called every second from fetchData. Updates aircraft detail card + history.
function extendedPulse() {
	_updateAircraftCard();
	_updateHistoryPanel();
}

// ── Aircraft Detail Card ────────────────────────────────────────────────────
function _updateAircraftCard() {
	var el = document.getElementById('plane_extension');
	if (!el) return;

	if (typeof SelectedPlane === 'undefined' || SelectedPlane === null) {
		if (_extLastRendered !== null) {
			el.innerHTML = '';
			_extLastRendered = null;
			_extLastData = null;
		}
		return;
	}

	// Trigger lookup (async — will update when data arrives)
	var cached = AircraftDB.getFromCache(SelectedPlane);

	// If selection changed, show loading state immediately
	if (SelectedPlane !== _extLastRendered) {
		_extLastRendered = SelectedPlane;
		_extLastData = null;

		if (cached) {
			el.innerHTML = _buildCard(cached);
		} else {
			// Show loading spinner
			el.innerHTML =
				'<div class="ac-photo-card">' +
				'<div class="ac-photo-loading"></div>' +
				'<div class="ac-info">' +
				'<div class="ac-info-row"><span class="ac-lbl">Status</span><span class="ac-val">Looking up aircraft...</span></div>' +
				'</div></div>';

			// Fire async lookup
			AircraftDB.lookup(SelectedPlane, function(result) {
				if (SelectedPlane === _extLastRendered && result) {
					el.innerHTML = _buildCard(result);
					_extLastData = result;
					// Also populate the global AircraftMetaCache
					window.AircraftMetaCache[result.icao] = {
						registration: result.registration,
						type: result.typeLong || result.type,
						manufacturer: result.manufacturer
					};
				}
			});
		}
		return;
	}

	// Same plane — check if cached data arrived since last render
	if (!_extLastData && cached) {
		el.innerHTML = _buildCard(cached);
		_extLastData = cached;
	}
}

// ── Build the photo + info card HTML ────────────────────────────────────────
function _buildCard(data) {
	var html = '<div class="ac-photo-card">';

	// Photo
	if (data.photo) {
		html += '<div class="ac-photo-wrap">';
		html += '<img src="' + data.photo + '" alt="Aircraft Photo" onerror="this.parentNode.innerHTML=\'<div class=ac-no-photo>NO PHOTO AVAILABLE</div>\'" />';
		if (data.photoCredit) {
			html += '<span class="ac-photo-credit">📷 ' + _escH(data.photoCredit) + '</span>';
		}
		html += '</div>';
	} else {
		html += '<div class="ac-no-photo">NO PHOTO AVAILABLE</div>';
	}

	// Info rows
	html += '<div class="ac-info">';
	if (data.registration) html += _infoRow('Registration', data.registration, true);
	if (data.type || data.typeLong) html += _infoRow('Aircraft Type', data.typeLong || data.type);
	if (data.manufacturer) html += _infoRow('Manufacturer', data.manufacturer);
	if (data.operator)     html += _infoRow('Operator', data.operator);
	if (data.country)      html += _infoRow('Country', data.country);

	// Show flight info from current plane data
	var plane = (typeof Planes !== 'undefined' && Planes[data.icao]) ? Planes[data.icao] : null;
	if (plane) {
		if (plane.flight) html += _infoRow('Callsign', plane.flight, true);
		if (plane.altitude) html += _infoRow('Altitude', plane.altitude + ' ft');
		if (plane.speed)    html += _infoRow('Speed', plane.speed + ' kt');
		if (plane.squawk && plane.squawk !== '0000') html += _infoRow('Squawk', plane.squawk);
	}
	html += '</div>';

	html += '</div>';
	return html;
}

function _infoRow(label, value, accent) {
	return '<div class="ac-info-row">' +
		'<span class="ac-lbl">' + label + '</span>' +
		'<span class="ac-val' + (accent ? ' accent' : '') + '">' + _escH(value) + '</span>' +
		'</div>';
}

function _escH(s) {
	if (!s) return '';
	return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── History Panel ───────────────────────────────────────────────────────────
var _histLastCount = -1;

function _updateHistoryPanel() {
	var el = document.getElementById('flight_history');
	if (!el) return;

	var count = FlightHistory.getCount();
	// Only redraw when count changes (new aircraft detected)
	if (count === _histLastCount) return;
	_histLastCount = count;

	var flights = FlightHistory.getRecent(30);
	if (flights.length === 0) {
		el.innerHTML = '<div class="hist-count">NO FLIGHTS RECORDED YET</div>';
		return;
	}

	var html = '<div class="hist-card">';
	html += '<div class="hist-count">' + count + ' AIRCRAFT DETECTED THIS SESSION</div>';

	for (var i = 0; i < flights.length; i++) {
		var f = flights[i];
		var dur = Math.round((f.lastSeen - f.firstSeen) / 1000);
		var durStr = dur < 60 ? dur + 's' : Math.round(dur/60) + 'm';
		var statusCls = f.active ? 'hist-active' : 'hist-ended';
		var statusTxt = f.active ? '● LIVE' : '○ GONE';

		html += '<div class="hist-row" onclick="selectPlaneByHex(\'' + f.icao + '\')">';
		html += '<span class="hist-icao">' + f.icao.toUpperCase() + '</span>';
		html += '<span class="hist-flight">' + (f.flight || '—') + '</span>';
		html += '<span class="hist-time">' + durStr + '</span>';
		html += '<span class="' + statusCls + '" style="width:50px;text-align:right;font-size:9px;">' + statusTxt + '</span>';
		html += '</div>';
	}
	html += '</div>';
	el.innerHTML = html;

	// Update session counter in header if element exists
	var hdrEl = document.getElementById('ui-session-count');
	if (hdrEl) hdrEl.textContent = count;
}

// ── Legacy compat ───────────────────────────────────────────────────────────
function getAircraftMeta(hex) {
	if (hex && window.AircraftMetaCache && window.AircraftMetaCache[hex]) {
		return window.AircraftMetaCache[hex];
	}
	return { registration: 'N/A', type: 'N/A', manufacturer: 'N/A' };
}
