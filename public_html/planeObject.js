// ── SVG plane path (module-level constant — never re-concatenated) ──────────
var PLANE_SVG_PATH = "M 1.9565564,41.694305 C 1.7174505,40.497708 1.6419973,38.448747 " +
	"1.8096508,37.70494 1.8936398,37.332056 2.0796653,36.88191 2.222907,36.70461 " +
	"2.4497603,36.423844 4.087816,35.47248 14.917931,29.331528 l 12.434577," +
	"-7.050718 -0.04295,-7.613412 c -0.03657,-6.4844888 -0.01164,-7.7625804 " +
	"0.168134,-8.6194061 0.276129,-1.3160905 0.762276,-2.5869575 1.347875," +
	"-3.5235502 l 0.472298,-0.7553719 1.083746,-0.6085497 c 1.194146,-0.67053522 " +
	"1.399524,-0.71738842 2.146113,-0.48960552 1.077005,0.3285939 2.06344," +
	"1.41299352 2.797602,3.07543322 0.462378,1.0469993 0.978731,2.7738408 " +
	"1.047635,3.5036272 0.02421,0.2570284 0.06357,3.78334 0.08732,7.836246 0.02375," +
	"4.052905 0.0658,7.409251 0.09345,7.458546 0.02764,0.04929 5.600384,3.561772 " +
	"12.38386,7.805502 l 12.333598,7.715871 0.537584,0.959688 c 0.626485,1.118378 " +
	"0.651686,1.311286 0.459287,3.516442 -0.175469,2.011604 -0.608966,2.863924 " +
	"-1.590344,3.127136 -0.748529,0.200763 -1.293144,0.03637 -10.184829,-3.07436 " +
	"C 48.007733,41.72562 44.793806,40.60197 43.35084,40.098045 l -2.623567," +
	"-0.916227 -1.981212,-0.06614 c -1.089663,-0.03638 -1.985079,-0.05089 -1.989804," +
	"-0.03225 -0.0052,0.01863 -0.02396,2.421278 -0.04267,5.339183 -0.0395,6.147742 " +
	"-0.143635,7.215456 -0.862956,8.845475 l -0.300457,0.680872 2.91906,1.361455 " +
	"c 2.929379,1.366269 3.714195,1.835385 4.04589,2.41841 0.368292,0.647353 " +
	"0.594634,2.901439 0.395779,3.941627 -0.0705,0.368571 -0.106308,0.404853 " +
	"-0.765159,0.773916 L 41.4545,62.83158 39.259237,62.80426 c -6.030106,-0.07507 " +
	"-16.19508,-0.495041 -16.870991,-0.697033 -0.359409,-0.107405 -0.523792," +
	"-0.227482 -0.741884,-0.541926 -0.250591,-0.361297 -0.28386,-0.522402 -0.315075," +
	"-1.52589 -0.06327,-2.03378 0.23288,-3.033615 1.077963,-3.639283 0.307525," +
	"-0.2204 4.818478,-2.133627 6.017853,-2.552345 0.247872,-0.08654 0.247455," +
	"-0.102501 -0.01855,-0.711959 -0.330395,-0.756986 -0.708622,-2.221756 -0.832676," +
	"-3.224748 -0.05031,-0.406952 -0.133825,-3.078805 -0.185533,-5.937448 -0.0517," +
	"-2.858644 -0.145909,-5.208974 -0.209316,-5.222958 -0.06341,-0.01399 -0.974464," +
	"-0.0493 -2.024551,-0.07845 L 23.247235,38.61921 18.831373,39.8906 C 4.9432155," +
	"43.88916 4.2929558,44.057819 3.4954426,43.86823 2.7487826,43.690732 2.2007966," +
	"42.916622 1.9565564,41.694305 z";

var planeObject = {
	oldlat		: null,
	oldlon		: null,
	oldalt		: null,

	// Basic location information
	altitude	: null,
	speed		: null,
	track		: null,
	latitude	: null,
	longitude	: null,

	// Info about the plane
	flight		: null,
	squawk		: null,
	icao		: null,
	is_selected	: false,

	// Data packet numbers
	messages	: null,
	seen		: null,

	// Valid flags
	vPosition	: false,
	vTrack		: false,

	// Leaflet marker and trail
	marker		: null,
	markerColor	: MarkerColor,
	line        : null,          // single L.polyline for trail

	// Track history — NOTE: these MUST be re-initialized per clone
	// in funcUpdateData to avoid shared-prototype reference bug.
	trackdata	: null,
	trackline	: null,

	// Cached render state for dirty-checking
	lastLat          : null,
	lastLon          : null,
	lastTrack        : null,
	lastMarkerColor  : null,
	lastSelectedState: null,
	_lastDetailHash  : null,

	// When was this last updated?
	updated		: null,
	reapable	: false,

	// Max trail points (300 ≈ 5 min at 1 update/sec)
	TRACK_MAX_POINTS : 300,

	// ── funcInitArrays ──────────────────────────────────────────────────────
	// Ensures each plane clone has its own arrays (not shared prototype refs).
	funcInitArrays : function() {
		if (this.trackdata === null) { this.trackdata = []; }
		if (this.trackline === null) { this.trackline = []; }
	},

	// ── funcAddToTrack ──────────────────────────────────────────────────────
	funcAddToTrack : function() {
		this.funcInitArrays();
		this.trackdata.push([this.latitude, this.longitude, this.altitude, this.track, this.speed]);
		this.trackline.push([this.latitude, this.longitude]);

		if (this.trackdata.length > this.TRACK_MAX_POINTS) {
			this.trackdata.shift();
		}
		if (this.trackline.length > this.TRACK_MAX_POINTS) {
			this.trackline.shift();
		}
	},

	// ── funcClearLine ───────────────────────────────────────────────────────
	funcClearLine : function() {
		if (this.line) {
			GoogleMap.removeLayer(this.line);
			this.line = null;
		}
	},

	// ── funcGetIcon ─────────────────────────────────────────────────────────
	funcGetIcon : function() {
		// Reset to base color, then apply priority overrides
		this.markerColor = MarkerColor;
		if (this.is_selected)    { this.markerColor = SelectedColor;       }
		if (this.squawk == 7500) { this.markerColor = 'rgb(255,85,85)';   }
		if (this.squawk == 7600) { this.markerColor = 'rgb(0,255,255)';   }
		if (this.squawk == 7700) { this.markerColor = 'rgb(255,255,0)';   }

		var strokeW = this.is_selected ? 1.5 : 0.8;
		var rot     = (this.track != null) ? this.track : 0;
		var color   = this.markerColor || MarkerColor;

		// Glow effect for selected aircraft
		var glow = this.is_selected
			? 'filter:drop-shadow(0 0 6px ' + color + ');'
			: '';

		var html =
			'<div style="' +
				'width:28px;height:28px;' +
				'transform:rotate(' + rot + 'deg);' +
				'transform-origin:center center;' +
				'transition:transform 0.8s ease;' +
				glow +
			'">' +
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 65" ' +
				'width="28" height="28">' +
				'<path d="' + PLANE_SVG_PATH + '" ' +
					'fill="' + color + '" ' +
					'fill-opacity="0.92" ' +
					'stroke="rgba(0,0,0,0.6)" ' +
					'stroke-width="' + strokeW + '" />' +
			'</svg>' +
			'</div>';

		return L.divIcon({
			html       : html,
			className  : '',
			iconSize   : [28, 28],
			iconAnchor : [14, 14]
		});
	},

	// ── funcSelectPlane ─────────────────────────────────────────────────────
	funcSelectPlane : function() {
		selectPlaneByHex(this.icao);
	},

	// ── funcUpdateData ──────────────────────────────────────────────────────
	funcUpdateData : function(data) {
		// Ensure own arrays (fixes shared-prototype bug)
		this.funcInitArrays();

		var oldlat = this.latitude;
		var oldlon = this.longitude;

		this.updated   = new Date().getTime();
		this.altitude  = data.altitude;
		this.speed     = data.speed;
		this.track     = data.track;
		this.latitude  = data.lat;
		this.longitude = data.lon;
		this.flight    = data.flight;
		this.squawk    = data.squawk;
		this.icao      = data.hex;
		this.messages  = data.messages;
		this.seen      = data.seen;

		// Reap aircraft not heard for > 58 seconds
		if (this.seen > 58) {
			this.reapable = true;
			if (this.marker) {
				GoogleMap.removeLayer(this.marker);
				this.marker = null;
			}
			if (this.line) {
				GoogleMap.removeLayer(this.line);
				this.line = null;
			}
			if (SelectedPlane == this.icao) {
				this.is_selected = false;
				SelectedPlane = null;
			}
		} else {
			this.reapable = false;
		}

		// Position handling
		if ((data.validposition == 1) && (this.reapable == false)) {
			this.vPosition = true;

			var changeLat = (oldlat !== this.latitude);
			var changeLon = (oldlon !== this.longitude);

			if (changeLat || changeLon) {
				this.funcAddToTrack();
				if (this.is_selected) {
					this.funcUpdateLines();
				}
			}
			this.funcUpdateMarker();
			PlanesOnMap++;
		} else {
			this.vPosition = false;
		}

		this.vTrack = (data.validtrack == 1);
	},

	// ── funcUpdateMarker ────────────────────────────────────────────────────
	funcUpdateMarker : function() {
		var latlng = [this.latitude, this.longitude];

		if (this.marker) {
			// Position: only update if changed
			if (this.latitude !== this.lastLat || this.longitude !== this.lastLon) {
				this.marker.setLatLng(latlng);
				this.lastLat = this.latitude;
				this.lastLon = this.longitude;
			}

			// Icon: only regenerate if track/color/selection changed
			var expectedColor = MarkerColor;
			if (this.is_selected)    { expectedColor = SelectedColor;       }
			if (this.squawk == 7500) { expectedColor = 'rgb(255,85,85)';   }
			if (this.squawk == 7600) { expectedColor = 'rgb(0,255,255)';   }
			if (this.squawk == 7700) { expectedColor = 'rgb(255,255,0)';   }

			var iconDirty = (
				this.track       !== this.lastTrack         ||
				expectedColor    !== this.lastMarkerColor   ||
				this.is_selected !== this.lastSelectedState
			);
			if (iconDirty) {
				this.marker.setIcon(this.funcGetIcon());
				this.lastTrack         = this.track;
				this.lastMarkerColor   = expectedColor;
				this.lastSelectedState = this.is_selected;
			}
		} else {
			// First appearance: create marker
			var icon = this.funcGetIcon();
			var self = this;
			this.marker = L.marker(latlng, {
				icon         : icon,
				zIndexOffset : 0
			}).addTo(GoogleMap);

			this.marker.icao = this.icao;
			this.marker.on('click', function() {
				self.funcSelectPlane();
			});

			this.lastLat           = this.latitude;
			this.lastLon           = this.longitude;
			this.lastTrack         = this.track;
			this.lastMarkerColor   = this.markerColor;
			this.lastSelectedState = this.is_selected;
		}  // ← FIX: was missing this closing brace — tooltip code now runs ALWAYS

		// Tooltip: create once, update only when label changes
		var label = (this.flight && this.flight.length > 0)
			? this.flight + ' (' + this.icao + ')'
			: this.icao;
		if (this.marker.getTooltip()) {
			if (this.marker.getTooltip().getContent() !== label) {
				this.marker.setTooltipContent(label);
			}
		} else {
			this.marker.bindTooltip(label, {
				permanent : false,
				direction : 'top',
				className : 'adsb-plane-tooltip'
			});
		}

		return this.marker;
	},

	// ── funcUpdateLines ─────────────────────────────────────────────────────
	funcUpdateLines : function() {
		this.funcInitArrays();
		if (this.line) {
			// Use addLatLng for efficiency (avoids full array copy)
			this.line.addLatLng([this.latitude, this.longitude]);
			// Enforce cap on rendered trail
			var latlngs = this.line.getLatLngs();
			if (latlngs.length > this.TRACK_MAX_POINTS) {
				this.line.setLatLngs(latlngs.slice(-this.TRACK_MAX_POINTS));
			}
		} else {
			this.line = L.polyline(this.trackline, {
				color   : 'rgba(0,210,180,0.7)',
				weight  : 2.5,
				opacity : 0.8,
				dashArray: '6, 4',
				lineJoin: 'round'
			}).addTo(GoogleMap);
		}
		return this.line;
	}
};
