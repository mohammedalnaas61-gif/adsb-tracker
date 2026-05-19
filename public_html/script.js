// ── Global State ────────────────────────────────────────────────────────────
var GoogleMap     = null;
var Planes        = {};
var PlanesOrdered = [];
var PlanesOnMap   = 0;
var PlanesOnTable = 0;
var PlanesToReap  = 0;
var SelectedPlane = null;
var SpecialSquawk = false;
var MessageRate   = 0;
var _msgRatePrev  = 0;
var _msgRateTime  = 0;

// ── Receiver Health ─────────────────────────────────────────────────────────
var ReceiverOnline   = false;
var _fetchFailures   = 0;
var _lastDataTime    = 0;

var iSortCol = -1;
var bSortASC = true;
var bDefaultSortASC = true;
var iDefaultSortCol = 3;

// Map settings from localStorage or config defaults
var CenterLat = Number(localStorage['CenterLat']) || CONST_CENTERLAT;
var CenterLon = Number(localStorage['CenterLon']) || CONST_CENTERLON;
var ZoomLvl   = Number(localStorage['ZoomLvl'])   || CONST_ZOOMLVL;

// ── Header Stats ────────────────────────────────────────────────────────────
function updateHeaderStats() {
	var elAC = document.getElementById('ui-aircraft-count');
	var elMR = document.getElementById('ui-msg-rate');
	if (elAC) { elAC.textContent = PlanesOrdered.length; }
	if (elMR) { elMR.textContent = MessageRate.toFixed(1); }
}

// ── Receiver Status Indicator ───────────────────────────────────────────────
function updateReceiverStatus(online) {
	ReceiverOnline = online;
	var dot    = document.getElementById('receiver-dot');
	var label  = document.getElementById('receiver-label');
	if (!dot || !label) { return; }
	if (online) {
		dot.className   = 'live-dot online';
		label.textContent = 'ONLINE';
		label.style.color = '#39ff6e';
	} else {
		dot.className   = 'live-dot offline';
		label.textContent = 'OFFLINE';
		label.style.color = '#ff4444';
	}
}

// ── HTML Escape (security) ──────────────────────────────────────────────────
function escHtml(str) {
	if (!str) return '';
	return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Aircraft Image Hook ─────────────────────────────────────────────────────
function getAircraftImagePath(plane) {
	return 'images/default-aircraft.png';
}
function updateAircraftImagePlaceholder(plane) {
	var img = document.getElementById('aircraft_image');
	if (!img) { return; }
	img.src = getAircraftImagePath(plane);
}

// ── fetchData ───────────────────────────────────────────────────────────────
function fetchData() {
	$.getJSON(DUMP1090_DATA_URL)
	.done(function(data) {
		// Reset failure counter on success
		_fetchFailures = 0;
		_lastDataTime  = new Date().getTime();
		updateReceiverStatus(true);

		PlanesOnMap = 0;
		SpecialSquawk = false;

		for (var j = 0; j < data.length; j++) {
			var isNew = false;
			if (Planes[data[j].hex]) {
				var plane = Planes[data[j].hex];
			} else {
				var plane = jQuery.extend(true, {}, planeObject);
				plane.trackdata = [];
				plane.trackline = [];
				isNew = true;
			}

			if (data[j].squawk == '7500' || data[j].squawk == '7600' || data[j].squawk == '7700') {
				SpecialSquawk = true;
			}

			plane.funcUpdateData(data[j]);
			Planes[plane.icao] = plane;

			// Record in flight history
			if (typeof FlightHistory !== 'undefined') {
				FlightHistory.recordFlight(plane);
			}

			// Auto-lookup aircraft data on first detection
			if (isNew && typeof AircraftDB !== 'undefined') {
				AircraftDB.lookup(plane.icao, function(result) {
					if (result && window.AircraftMetaCache) {
						window.AircraftMetaCache[result.icao] = {
							registration: result.registration,
							type: result.typeLong || result.type,
							manufacturer: result.manufacturer
						};
					}
				});
			}
		}

		PlanesOnTable = data.length;

		// Rebuild PlanesOrdered
		PlanesOrdered = [];
		var totalMessages = 0;
		for (var hex in Planes) {
			if (!Planes[hex].reapable) {
				PlanesOrdered.push(Planes[hex]);
				totalMessages += (Planes[hex].messages || 0);
			}
		}

		// Compute message rate
		var now = new Date().getTime();
		if (_msgRateTime > 0) {
			var elapsed = (now - _msgRateTime) / 1000;
			if (elapsed > 0) {
				MessageRate = Math.max(0, (totalMessages - _msgRatePrev) / elapsed);
			}
		}
		_msgRatePrev = totalMessages;
		_msgRateTime = now;

		updateHeaderStats();
		reaper();
		refreshTableInfo();
		refreshSelected();
		extendedPulse();
	})
	.fail(function() {
		_fetchFailures++;
		if (_fetchFailures >= MAX_FETCH_FAILURES) {
			updateReceiverStatus(false);
		}
	});
}

// ── Initialize ──────────────────────────────────────────────────────────────
function initialize() {
	GoogleMap = L.map('map_canvas', {
		center: [CenterLat, CenterLon],
		zoom: ZoomLvl,
		zoomControl: true
	});

	// Dark tile layer (CartoDB Dark Matter)
	L.tileLayer(TILE_URL, {
		attribution: TILE_ATTR,
		maxZoom: 19,
		subdomains: 'abcd'
	}).addTo(GoogleMap);

	// Persist map position
	GoogleMap.on('moveend', function() {
		var c = GoogleMap.getCenter();
		localStorage['CenterLat'] = c.lat;
		localStorage['CenterLon'] = c.lng;
	});
	GoogleMap.on('zoomend', function() {
		localStorage['ZoomLvl'] = GoogleMap.getZoom();
	});

	// Site marker with inline SVG (no external Google dependency)
	if (SiteShow && typeof SiteLat !== 'undefined' && typeof SiteLon !== 'undefined') {
		var siteIcon = L.divIcon({
			html: '<div style="width:20px;height:20px;">' +
				'<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">' +
				'<circle cx="10" cy="10" r="8" fill="none" stroke="#00d2b4" stroke-width="1.5" opacity="0.7"/>' +
				'<circle cx="10" cy="10" r="3" fill="#00d2b4"/>' +
				'<line x1="10" y1="1" x2="10" y2="5" stroke="#00d2b4" stroke-width="1.2"/>' +
				'<line x1="10" y1="15" x2="10" y2="19" stroke="#00d2b4" stroke-width="1.2"/>' +
				'<line x1="1" y1="10" x2="5" y2="10" stroke="#00d2b4" stroke-width="1.2"/>' +
				'<line x1="15" y1="10" x2="19" y2="10" stroke="#00d2b4" stroke-width="1.2"/>' +
				'</svg></div>',
			className: '',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});
		var marker = L.marker([SiteLat, SiteLon], {
			title: 'My Radar Site',
			zIndexOffset: -99999,
			icon: siteIcon
		}).addTo(GoogleMap);

		if (SiteCircles) {
			for (var i = 0; i < SiteCirclesDistances.length; i++) {
				drawCircle(marker, SiteCirclesDistances[i]);
			}
		}
	}

	// Load options
	optionsInitalize();
	extendedInitalize();

	// Inject styles for detail panel
	(function injectDetailStyles() {
		if (document.getElementById('adsb-sd-styles')) { return; }
		var s = document.createElement('style');
		s.id = 'adsb-sd-styles';
		s.textContent = [
			'.sd-header{display:flex;align-items:flex-start;flex-wrap:wrap;gap:6px;padding:8px 10px 6px;border-bottom:1px solid rgba(0,210,180,0.15);width:100%;}',
			'.sd-callsign{font-family:"Share Tech Mono",monospace;font-size:15px;font-weight:bold;color:#e8f4f0;letter-spacing:0.08em;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;flex:1 1 100%;}',
			'.sd-badge{font-size:10px;border-radius:3px;padding:2px 6px;font-weight:bold;}',
			'.sd-link{font-size:11px;color:#1e90ff;text-decoration:none;}',
			'.sd-link:hover{text-decoration:underline;}',
			'.sd-table{border-collapse:collapse;font-family:"Share Tech Mono",monospace;font-size:11px;margin:4px 0;width:100%;table-layout:fixed;}',
			'.sd-table.dim{opacity:0.4;}',
			'.sd-label{color:#7fa8a0;padding:4px 6px 4px 10px;white-space:normal;word-break:break-word;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;}',
			'.sd-value{color:#e8f4f0;padding:4px 10px 4px 4px;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;max-width:100%;}',
			'#planes_table table thead th{cursor:pointer;}',
			'#planes_table table thead th:hover{color:#00d2b4;}'
		].join('\n');
		document.head.appendChild(s);
	})();

	// Start polling
	window.setInterval(function() {
		fetchData();
	}, POLL_INTERVAL_MS);

	// Initial fetch
	fetchData();
}

// ── Reaper ──────────────────────────────────────────────────────────────────
function reaper() {
	PlanesToReap = 0;
	var reaptime = new Date().getTime();  // FIX: was implicit global
	for (var reap in Planes) {
		if (Planes[reap].reapable === true) {
			if ((reaptime - Planes[reap].updated) > 300000) {
				// Mark ended in flight history before deleting
				if (typeof FlightHistory !== 'undefined') {
					FlightHistory.endFlight(reap);
				}
				delete Planes[reap];
			}
			PlanesToReap++;
		}
	}
}

// ── refreshSelected ─────────────────────────────────────────────────────────
var _lastSelectedHash = '';

function refreshSelected() {
	var selected = false;
	if (typeof SelectedPlane !== 'undefined' && SelectedPlane != "ICAO" && SelectedPlane != null) {
		selected = Planes[SelectedPlane];
	}

	updateAircraftImagePlaceholder(selected || null);

	// Build a hash to skip redundant DOM writes
	var hash = selected
		? [selected.icao, selected.flight, selected.squawk, selected.altitude,
		   selected.speed, selected.track, selected.latitude, selected.longitude,
		   selected.vPosition, selected.vTrack, selected.messages].join('|')
		: 'none';
	if (hash === _lastSelectedHash) { return; }
	_lastSelectedHash = hash;

	var html = '';
	var title = 'DUMP1090';
	if (selected) {
		title = (selected.flight && selected.flight !== '') ? escHtml(selected.flight) : ('N/A (' + escHtml(selected.icao) + ')');
	}

	html += '<div class="sd-header">';
	html += '<span class="sd-callsign">' + title + '</span>';

	if (selected) {
		if (selected.squawk == 7500) {
			html += '<span class="squawk7500 sd-badge">&nbsp;HIJACK&nbsp;</span>';
		} else if (selected.squawk == 7600) {
			html += '<span class="squawk7600 sd-badge">&nbsp;RADIO FAIL&nbsp;</span>';
		} else if (selected.squawk == 7700) {
			html += '<span class="squawk7700 sd-badge">&nbsp;EMERGENCY&nbsp;</span>';
		} else if (selected.flight && selected.flight !== '') {
			html += '&nbsp;<a class="sd-link" href="https://www.flightstats.com/go/FlightStatus/flightStatusByFlight.do?flightNumber=' +
				encodeURIComponent(selected.flight) + '" target="_blank">[FlightStats]</a>';
		}
	}
	html += '</div>';

	html += '<table id="selectedinfo" class="sd-table' + (selected ? '' : ' dim') + '" width="100%"><tbody>';

	// ICAO + Squawk
	html += '<tr>';
	html += '<td class="sd-label">ICAO</td>';
	html += '<td class="sd-value">' + (selected ? escHtml(selected.icao) : 'n/a') + '</td>';
	html += '<td class="sd-label">Squawk</td>';
	html += '<td class="sd-value">' + (selected && selected.squawk !== '0000' ? escHtml(selected.squawk) : 'n/a') + '</td>';
	html += '</tr>';

	// Altitude + Speed
	html += '<tr>';
	html += '<td class="sd-label">Altitude</td>';
	if (selected) {
		html += '<td class="sd-value">' + (Metric ? Math.round(selected.altitude / 3.2828) + ' m' : selected.altitude + ' ft') + '</td>';
	} else {
		html += '<td class="sd-value">n/a</td>';
	}
	html += '<td class="sd-label">Speed</td>';
	if (selected) {
		html += '<td class="sd-value">' + (Metric ? Math.round(selected.speed * 1.852) + ' km/h' : selected.speed + ' kt') + '</td>';
	} else {
		html += '<td class="sd-value">n/a</td>';
	}
	html += '</tr>';

	// Track
	html += '<tr>';
	html += '<td class="sd-label">Track</td>';
	if (selected && selected.vTrack) {
		html += '<td class="sd-value">' + selected.track + '° (' + normalizeTrack(selected.track, selected.vTrack)[1] + ')</td>';
	} else {
		html += '<td class="sd-value">n/a</td>';
	}
	html += '<td class="sd-label"></td><td class="sd-value"></td>';
	html += '</tr>';

	// Lat / Lon
	html += '<tr>';
	html += '<td class="sd-label">Latitude</td>';
	html += '<td class="sd-value">' + (selected && selected.vPosition ? selected.latitude : 'n/a') + '</td>';
	html += '<td class="sd-label">Longitude</td>';
	html += '<td class="sd-value">' + (selected && selected.vPosition ? selected.longitude : 'n/a') + '</td>';
	html += '</tr>';

	// Distance
	if (SiteShow) {
		html += '<tr>';
		html += '<td class="sd-label">Distance</td>';
		if (selected && selected.vPosition) {
			var sitePt  = L.latLng(SiteLat, SiteLon);
			var planePt = L.latLng(selected.latitude, selected.longitude);
			var dist = sitePt.distanceTo(planePt);
			if (Metric) { dist /= 1000; } else { dist /= 1852; }
			dist = (Math.round(dist * 10) / 10).toFixed(1);
			html += '<td class="sd-value" colspan="3">' + dist + (Metric ? ' km' : ' NM') + '</td>';
		} else {
			html += '<td class="sd-value" colspan="3">n/a ' + (Metric ? 'km' : 'NM') + '</td>';
		}
		html += '</tr>';
	}

	html += '</tbody></table>';
	document.getElementById('plane_detail').innerHTML = html;
}

// ── normalizeSpeed ──────────────────────────────────────────────────────────
function normalizeSpeed(speed, valid) {
	return speed;
}

// ── normalizeTrack ──────────────────────────────────────────────────────────
function normalizeTrack(track, valid) {
	var x = [];  // FIX: was implicit global
	if ((track > -1)    && (track < 22.5))  { x = ["North",      "N",  track]; }
	if ((track > 22.5)  && (track < 67.5))  { x = ["North East", "NE", track]; }
	if ((track > 67.5)  && (track < 112.5)) { x = ["East",       "E",  track]; }
	if ((track > 112.5) && (track < 157.5)) { x = ["South East", "SE", track]; }
	if ((track > 157.5) && (track < 202.5)) { x = ["South",      "S",  track]; }
	if ((track > 202.5) && (track < 247.5)) { x = ["South West", "SW", track]; }
	if ((track > 247.5) && (track < 292.5)) { x = ["West",       "W",  track]; }
	if ((track > 292.5) && (track < 337.5)) { x = ["North West", "NW", track]; }
	if ((track > 337.5) && (track < 361))   { x = ["North",      "N",  track]; }
	if (!valid) { x = [" ", "n/a", ""]; }
	return x;
}

// ── Table Infrastructure ────────────────────────────────────────────────────
var _tableEl       = null;
var _tbodyEl       = null;
var _tableRows     = {};
var _tableNeedsSort = true;

function _rowClasses(plane) {
	var cls = 'plane_table_row';
	if (plane.vPosition)             { cls += ' vPosition'; }
	if (plane.icao == SelectedPlane) { cls += ' selected'; }
	if (plane.squawk == 7500)        { cls += ' squawk7500'; }
	if (plane.squawk == 7600)        { cls += ' squawk7600'; }
	if (plane.squawk == 7700)        { cls += ' squawk7700'; }
	return cls;
}

function _rowCells(plane) {
	var squawkTxt = (plane.squawk && plane.squawk != '0000') ? plane.squawk : '\u00a0';
	var alt, spd;
	if (Metric) {
		alt = Math.round(plane.altitude / 3.2828);
		spd = Math.round(plane.speed * 1.852);
	} else {
		alt = plane.altitude;
		spd = plane.speed;
	}
	var trk = plane.vTrack ? normalizeTrack(plane.track, plane.vTrack)[2] : '\u00a0';
	return [plane.icao, plane.flight, squawkTxt, alt, spd, trk, plane.messages, plane.seen];
}

function _createRow(plane) {
	var tr = document.createElement('tr');
	tr.className = _rowClasses(plane);
	var cells = _rowCells(plane);
	for (var i = 0; i < cells.length; i++) {
		var td = document.createElement('td');
		td.textContent = cells[i];
		tr.appendChild(td);
	}
	tr.addEventListener('click', function() {
		var hex = tr.cells[0].textContent;
		if (hex) {
			selectPlaneByHex(hex);
			refreshTableInfo();
			refreshSelected();
		}
	});
	_tableRows[plane.icao] = tr;
	_tableNeedsSort = true;
	return tr;
}

function _updateRow(tr, plane) {
	var newCls = _rowClasses(plane);
	if (tr.className !== newCls) { tr.className = newCls; }
	var cells = _rowCells(plane);
	for (var i = 0; i < cells.length; i++) {
		var val = String(cells[i] == null ? '' : cells[i]);
		if (tr.cells[i].textContent !== val) {
			tr.cells[i].textContent = val;
		}
	}
}

function refreshTableInfo() {
	var container = document.getElementById('planes_table');
	if (!_tableEl || !container.contains(_tableEl)) {
		_tableRows = {};
		_tableEl = document.createElement('table');
		_tableEl.id    = 'tableinfo';
		_tableEl.width = '100%';
		var thead = document.createElement('thead');
		var headers = [
			['0','ICAO'], ['1','Flight'], ['2','Squawk'],
			['3','Altitude'], ['4','Speed'], ['5','Track'],
			['6','Msgs'], ['7','Seen']
		];
		for (var h = 0; h < headers.length; h++) {
			var th = document.createElement('th');
			(function(col) {
				th.addEventListener('click', function() {
					setASC_DESC(col);
					_tableNeedsSort = true;
					sortTable('tableinfo', col);
				});
			})(headers[h][0]);
			th.textContent = headers[h][1];
			thead.appendChild(th);
		}
		_tbodyEl = document.createElement('tbody');
		_tableEl.appendChild(thead);
		_tableEl.appendChild(_tbodyEl);
		container.innerHTML = '';
		container.appendChild(_tableEl);
	}

	var activeIcaos = {};
	for (var hex in Planes) {
		var plane = Planes[hex];
		if (plane.reapable) { continue; }
		activeIcaos[plane.icao] = true;
		if (_tableRows[plane.icao]) {
			_updateRow(_tableRows[plane.icao], plane);
		} else {
			_tbodyEl.appendChild(_createRow(plane));
		}
	}

	for (var icao in _tableRows) {
		if (!activeIcaos[icao]) {
			var staleRow = _tableRows[icao];
			if (staleRow.parentNode) { staleRow.parentNode.removeChild(staleRow); }
			delete _tableRows[icao];
			_tableNeedsSort = true;
		}
	}

	$('#SpecialSquawkWarning').css('display', SpecialSquawk ? 'inline' : 'none');

	if (_tableNeedsSort) {
		sortTable('tableinfo');
		_tableNeedsSort = false;
	}
}

function setASC_DESC(iCol) {
	if (iSortCol == iCol) { bSortASC = !bSortASC; }
	else { bSortASC = bDefaultSortASC; }
}

function sortTable(szTableID, iCol) {
	if (typeof iCol === 'undefined') {
		iCol = (iSortCol !== -1) ? iSortCol : iDefaultSortCol;
	}
	var oTbl = document.getElementById(szTableID);
	if (!oTbl || !oTbl.tBodies[0]) { return; }
	oTbl = oTbl.tBodies[0];
	var aStore = [];
	if (typeof oTbl.rows[0] !== 'undefined' && oTbl.rows[0].cells.length <= iCol) {
		iCol = (oTbl.rows[0].cells.length - 1);
	}
	iSortCol = iCol;
	var bNumeric = false;
	if (typeof oTbl.rows[0] !== 'undefined' &&
		!isNaN(parseFloat(oTbl.rows[0].cells[iSortCol].textContent))) {
		bNumeric = true;
	}
	for (var i = 0; i < oTbl.rows.length; i++) {
		var oRow = oTbl.rows[i];
		var vColData = bNumeric  // FIX: was implicit global
			? parseFloat(oRow.cells[iSortCol].textContent || oRow.cells[iSortCol].innerText)
			: String(oRow.cells[iSortCol].textContent || oRow.cells[iSortCol].innerText);
		aStore.push([vColData, oRow]);
	}
	if (bNumeric) {
		aStore.sort(function(x, y) { return bSortASC ? x[0] - y[0] : y[0] - x[0]; });
	} else {
		aStore.sort();
		if (!bSortASC) { aStore.reverse(); }
	}
	for (var i = 0; i < aStore.length; i++) {
		oTbl.appendChild(aStore[i][1]);
	}
}

function selectPlaneByHex(hex) {
	if (SelectedPlane != null && Planes[SelectedPlane]) {
		Planes[SelectedPlane].is_selected = false;
		Planes[SelectedPlane].funcClearLine();
		Planes[SelectedPlane].markerColor = MarkerColor;
		if (Planes[SelectedPlane].marker) {
			Planes[SelectedPlane].marker.setIcon(Planes[SelectedPlane].funcGetIcon());
		}
	}
	if (String(SelectedPlane) != String(hex)) {
		if (!Planes[hex]) {
			SelectedPlane = null;
		} else {
			SelectedPlane = hex;
			Planes[SelectedPlane].is_selected = true;
			if (Planes[SelectedPlane].marker) {
				Planes[SelectedPlane].funcUpdateLines();
				Planes[SelectedPlane].marker.setIcon(Planes[SelectedPlane].funcGetIcon());
			}
		}
	} else {
		SelectedPlane = null;
	}
	_lastSelectedHash = '';  // Force detail refresh
	refreshSelected();
	refreshTableInfo();
}

function resetMap() {
	localStorage['CenterLat'] = CONST_CENTERLAT;
	localStorage['CenterLon'] = CONST_CENTERLON;
	localStorage['ZoomLvl']   = CONST_ZOOMLVL;
	CenterLat = CONST_CENTERLAT;
	CenterLon = CONST_CENTERLON;
	ZoomLvl   = CONST_ZOOMLVL;
	GoogleMap.setView([CenterLat, CenterLon], ZoomLvl);
	if (SelectedPlane) { selectPlaneByHex(SelectedPlane); }
	refreshSelected();
	refreshTableInfo();
}

function drawCircle(marker, distance) {
	// FIX: dead code removed — validation now actually runs
	if (typeof distance === 'undefined') { return false; }
	if (!(!isNaN(parseFloat(distance)) && isFinite(distance)) || distance < 0) {
		return false;
	}

	distance *= 1000.0;
	if (!Metric) { distance *= 1.852; }

	var latlng = marker.getLatLng ? marker.getLatLng() : L.latLng(SiteLat, SiteLon);
	L.circle(latlng, {
		radius: distance,
		fill: false,
		weight: 1,
		opacity: 0.2,
		color: '#00d2b4',
		dashArray: '4, 8'
	}).addTo(GoogleMap);
}
