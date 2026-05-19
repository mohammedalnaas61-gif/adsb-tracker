// --------------------------------------------------------
// ADS-B Receiver — Configuration
// Load this file before script.js in gmap.html.
// --------------------------------------------------------

// -- Data Source ------------------------------------------
// dump1090's built-in HTTP server serves at '/data.json'.
DUMP1090_DATA_URL = '/data.json';

// -- Output Settings -------------------------------------
Metric = false; // true = km/kmh, false = NM/kt/ft

// -- Map Settings ----------------------------------------
CONST_CENTERLAT = 32.8704149;  // Tripoli, Libya
CONST_CENTERLON = 13.1445539;
CONST_ZOOMLVL   = 13;

// -- Tile Layer ------------------------------------------
TILE_URL  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
TILE_ATTR = '\u0026copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> \u0026copy; <a href="https://carto.com/">CARTO</a>';

// -- Marker Settings -------------------------------------
MarkerColor   = "rgb(0, 210, 180)";
SelectedColor = "rgb(255, 255, 255)";

// -- Site Settings ---------------------------------------
SiteShow    = true;
SiteLat     = 32.8704149;
SiteLon     = 13.1445539;
SiteCircles = true;
SiteCirclesDistances = [10, 25, 50, 100, 200, 300];

// -- Receiver Health -------------------------------------
POLL_INTERVAL_MS      = 1000;
OFFLINE_THRESHOLD_SEC = 10;
MAX_FETCH_FAILURES    = 5;

// -- Airband Frequencies (MHz) ---------------------------
AirbandFrequencies = [
    { name: 'Mitiga TWR',       freq: 118.1, type: 'Tower'     },
    { name: 'Mitiga GND',       freq: 121.9, type: 'Ground'    },
    { name: 'Mitiga APP',       freq: 119.7, type: 'Approach'  },
    { name: 'Tripoli TWR',      freq: 118.3, type: 'Tower'     },
    { name: 'Tripoli GND',      freq: 121.7, type: 'Ground'    },
    { name: 'Tripoli APP',      freq: 120.1, type: 'Approach'  },
    { name: 'Emergency',        freq: 121.5, type: 'Emergency' },
    { name: 'Guard (Military)', freq: 243.0, type: 'Military'  }
];
