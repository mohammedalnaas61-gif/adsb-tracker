#!/usr/bin/env python3
"""
ADS-B Airband Audio Server — with Auto-SCAN
Streams live ATC/airband audio from RTL-SDR via rtl_fm + ffmpeg.

Endpoints:
  GET /scan                   — Auto-scan all frequencies, lock on voice
  GET /stream?freq=118100000  — Stream single frequency
  GET /stop                   — Stop pipeline, restart dump1090
  GET /status                 — Current status JSON
"""

import subprocess, threading, http.server, json, os, sys, time, re, io

# Fix Windows console encoding for Arabic paths
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── Configuration ────────────────────────────────────────────────────────────
PORT = 8086
SAMPLE_RATE = 24000
GAIN = 49.6
SQUELCH = 50

SCAN_FREQUENCIES = [
    118100000,  121900000,  119700000,  118300000,
    121500000,  126500000,  128700000,  134100000,
]
FREQ_NAMES = {
    118100000: "Mitiga TWR",   121900000: "Mitiga GND",
    119700000: "Mitiga APP",   118300000: "Tripoli TWR",
    121500000: "Emergency",    126500000: "Tripoli APP",
    128700000: "Tripoli ACC",  134100000: "Military",
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RTL_FM  = os.path.join(SCRIPT_DIR, "tools", "rtl-sdr", "rtl-sdr-64bit-20240623", "rtl_fm.exe")
FFMPEG  = os.path.join(SCRIPT_DIR, "tools", "ffmpeg", "ffmpeg-8.1.1-essentials_build", "bin", "ffmpeg.exe")
DUMP1090 = os.path.join(SCRIPT_DIR, "dump1090.exe")

# ── State ────────────────────────────────────────────────────────────────────
S = {
    "rtl": None, "ff": None,
    "active": False, "scan": False,
    "freq": 0, "active_freq": 0,
    "t0": 0, "dump_was": False,
    "lock": threading.Lock()
}

def _kill(name):
    try: subprocess.run(["taskkill","/F","/IM",name], capture_output=True, timeout=5)
    except: pass

def _running(name):
    try:
        r = subprocess.run(["tasklist","/FI",f"IMAGENAME eq {name}"], capture_output=True, text=True, timeout=5)
        return name.lower() in r.stdout.lower()
    except: return False

def _stderr_reader():
    proc = S.get("rtl")
    if not proc or not proc.stderr: return
    try:
        for line in proc.stderr:
            t = line.decode('utf-8', errors='replace').strip()
            m = re.search(r'(\d{8,10})', t)
            if m: S["active_freq"] = int(m.group(1))
    except: pass

def start(freq_hz=0, scan=False):
    with S["lock"]:
        if S["active"]: _stop_inner()

        S["dump_was"] = _running("dump1090.exe")
        if S["dump_was"]:
            print("[AIRBAND] Stopping dump1090...")
            _kill("dump1090.exe")
            time.sleep(2)

        cmd = [RTL_FM, "-M", "am"]
        if scan:
            for f in SCAN_FREQUENCIES: cmd += ["-f", str(f)]
            print(f"[AIRBAND] SCANNER: {len(SCAN_FREQUENCIES)} freqs")
        else:
            cmd += ["-f", str(int(freq_hz))]
            print(f"[AIRBAND] Single: {freq_hz/1e6:.3f} MHz")

        cmd += ["-s", str(SAMPLE_RATE), "-g", str(GAIN), "-l", str(SQUELCH), "-"]

        try:
            cf = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            S["rtl"] = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=cf)
            threading.Thread(target=_stderr_reader, daemon=True).start()

            ff_cmd = [FFMPEG, "-f","s16le", "-ar",str(SAMPLE_RATE), "-ac","1", "-i","-",
                      "-c:a","libmp3lame", "-b:a","32k", "-f","mp3", "-"]
            S["ff"] = subprocess.Popen(ff_cmd, stdin=S["rtl"].stdout, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, creationflags=cf)

            S["active"] = True
            S["scan"] = scan
            S["freq"] = 0 if scan else freq_hz
            S["active_freq"] = 0 if scan else freq_hz
            S["t0"] = time.time()
            return True
        except Exception as e:
            print(f"[AIRBAND] ERROR: {e}")
            _stop_inner()
            return False

def _stop_inner():
    for k in ["ff","rtl"]:
        p = S.get(k)
        if p:
            try: p.terminate(); p.wait(timeout=3)
            except:
                try: p.kill()
                except: pass
            S[k] = None
    S["active"] = S["scan"] = False
    S["freq"] = S["active_freq"] = 0
    if S["dump_was"]:
        print("[AIRBAND] Restarting dump1090...")
        try:
            cf = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            subprocess.Popen([DUMP1090,"--interactive","--net","--net-http-port","8085",
                              "--net-ro-size","500","--net-ro-rate","5","--net-buffer","5",
                              "--net-beast","--mlat"], cwd=SCRIPT_DIR, creationflags=cf)
            S["dump_was"] = False
            print("[AIRBAND] dump1090 restarted")
        except Exception as e:
            print(f"[AIRBAND] Restart failed: {e}")

def stop():
    with S["lock"]: _stop_inner()

# ── HTTP ─────────────────────────────────────────────────────────────────────
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET, OPTIONS")
    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        params = {}
        if "?" in self.path:
            for p in self.path.split("?")[1].split("&"):
                if "=" in p:
                    k,v = p.split("=",1); params[k] = v

        if path == "/scan":     self._stream(scan=True)
        elif path == "/stream": self._stream(scan=False, freq=int(params.get("freq",118100000)))
        elif path == "/stop":   self._do_stop()
        elif path == "/status": self._do_status()
        else: self.send_response(404); self._cors(); self.end_headers()

    def _stream(self, scan=False, freq=0):
        ok = start(freq, scan=scan) if (not S["active"] or S["scan"] != scan or S["freq"] != freq) else True
        if not ok:
            self.send_response(500); self._cors(); self.end_headers()
            self.wfile.write(b"Failed"); return
        self.send_response(200)
        self.send_header("Content-Type","audio/mpeg")
        self.send_header("Cache-Control","no-cache, no-store")
        self._cors(); self.end_headers()
        try:
            while S["active"] and S["ff"]:
                chunk = S["ff"].stdout.read(4096)
                if not chunk: break
                self.wfile.write(chunk); self.wfile.flush()
        except: pass

    def _do_stop(self):
        stop()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self._cors(); self.end_headers()
        self.wfile.write(b'{"status":"stopped"}')

    def _do_status(self):
        af = S.get("active_freq", 0)
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self._cors(); self.end_headers()
        self.wfile.write(json.dumps({
            "active": S["active"],
            "scan_mode": S["scan"],
            "frequency": S["freq"],
            "active_freq": af,
            "active_freq_mhz": round(af/1e6, 3) if af else 0,
            "active_freq_name": FREQ_NAMES.get(af, ""),
            "uptime": time.time() - S["t0"] if S["active"] else 0
        }).encode())

def main():
    print("="*60)
    print("  ADS-B Airband Audio Server (with SCAN)")
    print(f"  Port: {PORT}")
    print("="*60)
    for t,p in [("rtl_fm",RTL_FM),("ffmpeg",FFMPEG)]:
        e = "OK" if os.path.exists(p) else "MISSING"
        print(f"  {t}: [{e}]")
    print(f"\n  /scan   — auto-find voice")
    print(f"  /stream — single freq")
    print(f"  /stop   — stop & restart dump1090")
    print(f"  /status — current state\n")
    srv = http.server.HTTPServer(("0.0.0.0", PORT), H)
    try: srv.serve_forever()
    except KeyboardInterrupt: stop(); srv.shutdown()

if __name__ == "__main__": main()
