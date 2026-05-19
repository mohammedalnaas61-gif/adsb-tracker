// ═══════════════════════════════════════════════════════════════════════════
// AIRBAND AUDIO MODULE — Real RTL-SDR airband listening via backend server
//
// Features:
//   SCAN MODE — Automatically scans all frequencies, locks on voice
//   SINGLE MODE — Listen to one chosen frequency
//
// Architecture (single dongle):
//   1. User clicks SCAN or PLAY → frontend calls airband_server.py (port 8086)
//   2. Server stops dump1090, starts rtl_fm + ffmpeg on airband frequency(s)
//   3. MP3 audio streams to browser via HTML5 <audio>
//   4. User clicks STOP → server stops pipeline, restarts dump1090
//
// WARNING: While listening to airband, ADS-B tracking PAUSES.
// ═══════════════════════════════════════════════════════════════════════════

var AIRBAND_SERVER = 'http://localhost:8086';

var AirbandState = {
	active       : false,
	scanMode     : false,
	frequency    : 118100000,
	freqName     : 'Mitiga TWR',
	activeFreq   : 0,
	activeFreqName: '',
	volume       : 0.7,
	muted        : false,
	audioEl      : null,
	vuInterval   : null,
	statusInterval: null,
	panelBuilt   : false,
	serverOnline : false
};

// ── Initialize Airband Panel ────────────────────────────────────────────────
function airbandInit() {
	var container = document.getElementById('airband_panel');
	if (!container || AirbandState.panelBuilt) return;

	var freqOptions = '';
	if (typeof AirbandFrequencies !== 'undefined') {
		for (var i = 0; i < AirbandFrequencies.length; i++) {
			var f = AirbandFrequencies[i];
			var freqHz = Math.round(f.freq * 1000000);
			freqOptions += '<option value="' + freqHz + '" data-name="' + f.name + '">' +
				f.freq.toFixed(3) + ' — ' + f.name + ' (' + f.type + ')' +
				'</option>';
		}
	}

	container.innerHTML =
		'<div class="ab-card">' +
			'<div class="ab-header">' +
				'<div class="ab-title">' +
					'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d2b4" stroke-width="2">' +
						'<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>' +
						'<circle cx="12" cy="12" r="4"/>' +
					'</svg>' +
					'<span>AIRBAND RECEIVER</span>' +
				'</div>' +
				'<div class="ab-status" id="ab-status">' +
					'<span class="ab-status-dot" id="ab-status-dot"></span>' +
					'<span id="ab-status-text">STANDBY</span>' +
				'</div>' +
			'</div>' +

			// Warning banner
			'<div id="ab-warning" style="display:none;background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.3);border-radius:4px;padding:4px 8px;margin-bottom:6px;font-size:9px;color:#ff9060;text-align:center;">' +
				'⚠ ADS-B tracking PAUSED while listening' +
			'</div>' +

			// Frequency display
			'<div class="ab-freq-display" id="ab-freq-display">' +
				'<span class="ab-freq-value" id="ab-freq-value">SCAN</span>' +
				'<span class="ab-freq-unit" id="ab-freq-unit"></span>' +
				'<span class="ab-freq-name" id="ab-freq-name">Auto-detect active frequency</span>' +
			'</div>' +

			// VU meter
			'<div class="ab-vu-bar"><div class="ab-vu-fill" id="ab-vu-fill"></div></div>' +

			// Buttons row: SCAN + PLAY + MUTE + VOLUME
			'<div class="ab-controls">' +
				// SCAN button (main action)
				'<button class="ab-btn ab-scan" id="ab-scan-btn" title="Auto-scan all frequencies">' +
					'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d2b4" stroke-width="2" id="ab-scan-icon">' +
						'<path d="M2 12h4l3-9 4 18 3-9h6"/>' +
					'</svg>' +
				'</button>' +
				'<button class="ab-btn ab-play" id="ab-play-btn" title="Play selected frequency">' +
					'<svg width="16" height="16" viewBox="0 0 24 24" fill="#7fa8a0" id="ab-play-icon">' +
						'<polygon points="5,3 19,12 5,21"/>' +
					'</svg>' +
				'</button>' +
				'<button class="ab-btn ab-mute" id="ab-mute-btn" title="Mute">' +
					'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7fa8a0" stroke-width="2">' +
						'<polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="#7fa8a0"/>' +
						'<path d="M15.54 8.46a5 5 0 0 1 0 7.07" id="ab-vol-wave1"/>' +
						'<path d="M19.07 4.93a10 10 0 0 1 0 14.14" id="ab-vol-wave2"/>' +
					'</svg>' +
				'</button>' +
				'<input type="range" id="ab-volume" class="ab-volume" min="0" max="100" value="70" />' +
				'<span class="ab-vol-label" id="ab-vol-label">70%</span>' +
			'</div>' +

			// Frequency selector (for single mode)
			'<div class="ab-controls">' +
				'<select id="ab-freq-select" class="ab-select">' + freqOptions + '</select>' +
			'</div>' +

			'<div class="ab-info" id="ab-info">' +
				'<b style="color:#00d2b4;">⟳ SCAN</b> = auto-finds who\'s talking<br>' +
				'<b style="color:#7fa8a0;">▶ PLAY</b> = listen to selected frequency<br>' +
				'<span id="ab-server-status" style="color:#3a5a54;">Checking server...</span>' +
			'</div>' +
		'</div>';

	AirbandState.panelBuilt = true;

	// Create hidden audio element
	AirbandState.audioEl = document.createElement('audio');
	AirbandState.audioEl.crossOrigin = 'anonymous';
	document.body.appendChild(AirbandState.audioEl);

	// Bind events
	document.getElementById('ab-scan-btn').addEventListener('click', airbandToggleScan);
	document.getElementById('ab-play-btn').addEventListener('click', airbandTogglePlay);
	document.getElementById('ab-mute-btn').addEventListener('click', airbandToggleMute);

	document.getElementById('ab-volume').addEventListener('input', function() {
		AirbandState.volume = this.value / 100;
		if (AirbandState.audioEl) {
			AirbandState.audioEl.volume = AirbandState.muted ? 0 : AirbandState.volume;
		}
		document.getElementById('ab-vol-label').textContent = this.value + '%';
	});

	document.getElementById('ab-freq-select').addEventListener('change', function() {
		var opt = this.options[this.selectedIndex];
		AirbandState.frequency = parseInt(this.value);
		AirbandState.freqName  = opt.getAttribute('data-name') || '';
		// If playing single mode, switch frequency
		if (AirbandState.active && !AirbandState.scanMode) {
			airbandStop(function() { airbandStartSingle(); });
		}
	});

	// Check server status
	checkAirbandServer();
	setInterval(checkAirbandServer, 10000);
}

// ── Check Server ────────────────────────────────────────────────────────────
function checkAirbandServer() {
	$.ajax({
		url: AIRBAND_SERVER + '/status',
		type: 'GET',
		dataType: 'json',
		timeout: 3000
	}).done(function(data) {
		AirbandState.serverOnline = true;
		var el = document.getElementById('ab-server-status');
		if (el) {
			el.style.color = '#39ff6e';
			el.textContent = '● Airband server online';
		}
		// Update active freq display during scan
		if (data.scan_mode && data.active_freq > 0) {
			AirbandState.activeFreq = data.active_freq;
			AirbandState.activeFreqName = data.active_freq_name || '';
			document.getElementById('ab-freq-value').textContent = data.active_freq_mhz.toFixed(3);
			document.getElementById('ab-freq-unit').textContent = 'MHz';
			document.getElementById('ab-freq-name').textContent = data.active_freq_name || 'Scanning...';
		}
	}).fail(function() {
		AirbandState.serverOnline = false;
		var el = document.getElementById('ab-server-status');
		if (el) {
			el.style.color = '#ff4444';
			el.textContent = '○ Server offline — run: python airband_server.py';
		}
	});
}

// ── SCAN toggle ─────────────────────────────────────────────────────────────
function airbandToggleScan() {
	if (AirbandState.active) {
		airbandStop();
	} else {
		airbandStartScan();
	}
}

// ── Single-freq toggle ──────────────────────────────────────────────────────
function airbandTogglePlay() {
	if (AirbandState.active) {
		airbandStop();
	} else {
		airbandStartSingle();
	}
}

// ── Start SCAN ──────────────────────────────────────────────────────────────
function airbandStartScan() {
	if (!AirbandState.serverOnline) {
		_showServerError(); return;
	}

	AirbandState.scanMode = true;
	updateAirbandStatus('SCANNING...', false);

	// Update display
	document.getElementById('ab-freq-value').textContent = 'SCAN';
	document.getElementById('ab-freq-unit').textContent = '';
	document.getElementById('ab-freq-name').textContent = 'Searching for voice...';

	// Connect to scan stream
	AirbandState.audioEl.src = AIRBAND_SERVER + '/scan';
	AirbandState.audioEl.volume = AirbandState.muted ? 0 : AirbandState.volume;

	AirbandState.audioEl.play().then(function() {
		AirbandState.active = true;
		_activateUI('SCANNING', true);
		// Poll status every 1.5s to get current frequency
		AirbandState.statusInterval = setInterval(checkAirbandServer, 1500);
	}).catch(function(e) {
		updateAirbandStatus('ERROR', false);
		console.error('[AIRBAND] Scan failed:', e);
	});
}

// ── Start SINGLE ────────────────────────────────────────────────────────────
function airbandStartSingle() {
	if (!AirbandState.serverOnline) {
		_showServerError(); return;
	}

	AirbandState.scanMode = false;
	updateAirbandStatus('TUNING...', false);

	var mhz = (AirbandState.frequency / 1000000).toFixed(3);
	document.getElementById('ab-freq-value').textContent = mhz;
	document.getElementById('ab-freq-unit').textContent = 'MHz';
	document.getElementById('ab-freq-name').textContent = AirbandState.freqName;

	AirbandState.audioEl.src = AIRBAND_SERVER + '/stream?freq=' + AirbandState.frequency;
	AirbandState.audioEl.volume = AirbandState.muted ? 0 : AirbandState.volume;

	AirbandState.audioEl.play().then(function() {
		AirbandState.active = true;
		_activateUI('RECEIVING', true);
	}).catch(function(e) {
		updateAirbandStatus('ERROR', false);
		console.error('[AIRBAND] Play failed:', e);
	});
}

// ── Activate UI (common for both modes) ─────────────────────────────────────
function _activateUI(statusText, active) {
	// Swap scan button icon to STOP
	var scanIcon = document.getElementById('ab-scan-icon');
	if (scanIcon) scanIcon.innerHTML = '<rect x="6" y="6" width="12" height="12"/>';
	// Style scan button
	var scanBtn = document.getElementById('ab-scan-btn');
	if (scanBtn) scanBtn.style.borderColor = '#ff6b35';

	updateAirbandStatus(statusText, active);
	var warn = document.getElementById('ab-warning');
	if (warn) warn.style.display = 'block';
	if (typeof updateReceiverStatus === 'function') updateReceiverStatus(false);
	startVuMeter();
}

// ── Stop ────────────────────────────────────────────────────────────────────
function airbandStop(callback) {
	AirbandState.active = false;
	AirbandState.scanMode = false;
	if (AirbandState.audioEl) {
		AirbandState.audioEl.pause();
		AirbandState.audioEl.src = '';
	}
	if (AirbandState.statusInterval) {
		clearInterval(AirbandState.statusInterval);
		AirbandState.statusInterval = null;
	}

	// Restore scan button icon
	var scanIcon = document.getElementById('ab-scan-icon');
	if (scanIcon) scanIcon.innerHTML = '<path d="M2 12h4l3-9 4 18 3-9h6"/>';
	var scanBtn = document.getElementById('ab-scan-btn');
	if (scanBtn) scanBtn.style.borderColor = '';

	updateAirbandStatus('STOPPING...', false);

	// Reset display
	document.getElementById('ab-freq-value').textContent = 'SCAN';
	document.getElementById('ab-freq-unit').textContent = '';
	document.getElementById('ab-freq-name').textContent = 'Auto-detect active frequency';

	$.ajax({ url: AIRBAND_SERVER + '/stop', type: 'GET', timeout: 10000 })
	.always(function() {
		updateAirbandStatus('STANDBY', false);
		var warn = document.getElementById('ab-warning');
		if (warn) warn.style.display = 'none';
		stopVuMeter();
		setTimeout(function() {
			if (typeof updateReceiverStatus === 'function') updateReceiverStatus(true);
		}, 3000);
		if (callback) callback();
	});
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _showServerError() {
	var info = document.getElementById('ab-info');
	if (info) info.innerHTML = '<span style="color:#ff6b35;">Server not running!</span><br>Run: <b>python airband_server.py</b>';
}

function airbandToggleMute() {
	AirbandState.muted = !AirbandState.muted;
	if (AirbandState.audioEl) {
		AirbandState.audioEl.volume = AirbandState.muted ? 0 : AirbandState.volume;
	}
	var w1 = document.getElementById('ab-vol-wave1');
	var w2 = document.getElementById('ab-vol-wave2');
	if (w1) w1.style.opacity = AirbandState.muted ? '0.2' : '1';
	if (w2) w2.style.opacity = AirbandState.muted ? '0.2' : '1';
}

function updateAirbandStatus(text, active) {
	var dot  = document.getElementById('ab-status-dot');
	var label = document.getElementById('ab-status-text');
	if (dot)   dot.className = 'ab-status-dot' + (active ? ' active' : '');
	if (label) label.textContent = text;
}

function startVuMeter() {
	stopVuMeter();
	AirbandState.vuInterval = setInterval(function() {
		var fill = document.getElementById('ab-vu-fill');
		if (!fill) return;
		var level = AirbandState.active ? (Math.random() * 60 + 10) : 0;
		fill.style.width = level + '%';
		fill.style.background = level > 60
			? 'linear-gradient(90deg, #00d2b4, #ff6b35)'
			: 'linear-gradient(90deg, #00d2b4 80%, #007d6b)';
	}, 120);
}

function stopVuMeter() {
	if (AirbandState.vuInterval) {
		clearInterval(AirbandState.vuInterval);
		AirbandState.vuInterval = null;
	}
	var fill = document.getElementById('ab-vu-fill');
	if (fill) fill.style.width = '0%';
}
