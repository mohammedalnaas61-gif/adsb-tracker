// ═══════════════════════════════════════════════════════════════════════════
// AIRCRAFT DATABASE — Auto-lookup photos + metadata from public APIs
// Uses hexdb.io for aircraft data + planespotters.net for photos
// Caches everything in localStorage so repeated detections are instant
// ═══════════════════════════════════════════════════════════════════════════

var AircraftDB = {
	_cache: {},          // In-memory cache (fast)
	_pending: {},        // Prevents duplicate API calls for same ICAO
	_CACHE_TTL: 7 * 24 * 3600 * 1000,  // 7 days cache TTL

	// ── lookup ──────────────────────────────────────────────────────────────
	// Main entry point. Returns cached data immediately or fetches from APIs.
	// callback(result) where result = {icao, registration, type, operator, photo, ...}
	lookup: function(icao, callback) {
		if (!icao) return;
		icao = icao.toLowerCase();

		// 1. Check memory cache
		if (this._cache[icao]) {
			callback(this._cache[icao]);
			return;
		}

		// 2. Check localStorage
		try {
			var stored = localStorage.getItem('acdb_' + icao);
			if (stored) {
				var parsed = JSON.parse(stored);
				// Check TTL
				if (parsed.fetchedAt && (Date.now() - parsed.fetchedAt) < this._CACHE_TTL) {
					this._cache[icao] = parsed;
					callback(parsed);
					return;
				}
			}
		} catch(e) {}

		// 3. If already fetching, skip
		if (this._pending[icao]) return;
		this._pending[icao] = true;

		// 4. Fetch from APIs
		var self = this;
		this._fetchFromAPIs(icao, function(result) {
			delete self._pending[icao];
			if (result) {
				self._cache[icao] = result;
				try {
					localStorage.setItem('acdb_' + icao, JSON.stringify(result));
				} catch(e) {
					// localStorage full — clear old entries
					self._cleanOldEntries();
					try { localStorage.setItem('acdb_' + icao, JSON.stringify(result)); } catch(e2) {}
				}
				callback(result);
			}
		});
	},

	// ── _fetchFromAPIs ──────────────────────────────────────────────────────
	_fetchFromAPIs: function(icao, callback) {
		var result = {
			icao: icao,
			registration: '',
			type: '',
			typeLong: '',
			manufacturer: '',
			operator: '',
			country: '',
			photo: null,
			photoThumb: null,
			photoCredit: '',
			fetchedAt: Date.now()
		};

		// Step 1: Get aircraft metadata from hexdb.io
		$.ajax({
			url: 'https://hexdb.io/api/v1/aircraft/' + icao.toUpperCase(),
			type: 'GET',
			dataType: 'json',
			timeout: 8000
		})
		.done(function(data) {
			if (data) {
				result.registration = data.Registration || '';
				result.type         = data.ICAOTypeCode || data.Type || '';
				result.typeLong     = data.Type || '';
				result.manufacturer = data.Manufacturer || '';
				result.operator     = data.RegisteredOwners || data.OperatorFlagCode || '';
				result.country      = data.ModeSCountry || '';
			}
		})
		.always(function() {
			// Step 2: Get photo from planespotters.net
			$.ajax({
				url: 'https://api.planespotters.net/pub/photos/hex/' + icao.toUpperCase(),
				type: 'GET',
				dataType: 'json',
				timeout: 8000
			})
			.done(function(photoData) {
				if (photoData && photoData.photos && photoData.photos.length > 0) {
					var p = photoData.photos[0];
					result.photo      = p.thumbnail_large ? p.thumbnail_large.src : (p.thumbnail ? p.thumbnail.src : null);
					result.photoThumb = p.thumbnail ? p.thumbnail.src : result.photo;
					result.photoCredit = p.photographer || '';
				}
			})
			.always(function() {
				callback(result);
			});
		});
	},

	// ── getFromCache (sync) ─────────────────────────────────────────────────
	getFromCache: function(icao) {
		if (!icao) return null;
		icao = icao.toLowerCase();
		if (this._cache[icao]) return this._cache[icao];
		try {
			var stored = localStorage.getItem('acdb_' + icao);
			if (stored) {
				var parsed = JSON.parse(stored);
				this._cache[icao] = parsed;
				return parsed;
			}
		} catch(e) {}
		return null;
	},

	// ── _cleanOldEntries ────────────────────────────────────────────────────
	_cleanOldEntries: function() {
		var keysToRemove = [];
		for (var i = 0; i < localStorage.length; i++) {
			var key = localStorage.key(i);
			if (key && key.indexOf('acdb_') === 0) {
				try {
					var item = JSON.parse(localStorage.getItem(key));
					if (!item.fetchedAt || (Date.now() - item.fetchedAt) > this._CACHE_TTL) {
						keysToRemove.push(key);
					}
				} catch(e) { keysToRemove.push(key); }
			}
		}
		for (var j = 0; j < keysToRemove.length; j++) {
			localStorage.removeItem(keysToRemove[j]);
		}
	}
};

// ═══════════════════════════════════════════════════════════════════════════
// FLIGHT HISTORY — Records all aircraft seen during session + persists
// ═══════════════════════════════════════════════════════════════════════════

var FlightHistory = {
	flights: {},   // keyed by icao
	_saveTimer: null,

	// Called for every aircraft in every data update
	recordFlight: function(plane) {
		if (!plane || !plane.icao) return;
		var hex = plane.icao;

		if (!this.flights[hex]) {
			this.flights[hex] = {
				icao: hex,
				flight: plane.flight || '',
				squawk: plane.squawk || '',
				firstSeen: Date.now(),
				lastSeen: Date.now(),
				maxAlt: plane.altitude || 0,
				maxSpeed: plane.speed || 0,
				positions: [],
				active: true
			};
		}

		var f = this.flights[hex];
		f.lastSeen = Date.now();
		f.active   = !plane.reapable;
		if (plane.flight) f.flight = plane.flight;
		if (plane.squawk) f.squawk = plane.squawk;
		if (plane.altitude > f.maxAlt) f.maxAlt = plane.altitude;
		if (plane.speed > f.maxSpeed)  f.maxSpeed = plane.speed;

		// Record position (limit to every 5 seconds to save memory)
		if (plane.vPosition && plane.latitude && plane.longitude) {
			var lastPos = f.positions.length > 0 ? f.positions[f.positions.length - 1] : null;
			if (!lastPos || (Date.now() - lastPos.t) > 5000) {
				f.positions.push({
					lat: plane.latitude,
					lon: plane.longitude,
					alt: plane.altitude,
					spd: plane.speed,
					hdg: plane.track,
					t: Date.now()
				});
				// Cap at 500 positions per flight
				if (f.positions.length > 500) f.positions.shift();
			}
		}
	},

	// Mark flight as ended
	endFlight: function(icao) {
		if (this.flights[icao]) {
			this.flights[icao].active = false;
		}
	},

	// Get recent flights for history display
	getRecent: function(limit) {
		var list = [];
		for (var hex in this.flights) {
			list.push(this.flights[hex]);
		}
		list.sort(function(a, b) { return b.lastSeen - a.lastSeen; });
		return list.slice(0, limit || 20);
	},

	// Get count
	getCount: function() {
		var count = 0;
		for (var hex in this.flights) { count++; }
		return count;
	}
};
