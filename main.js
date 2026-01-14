const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  powerMonitor,
} = require("electron");

const path = require("path");
const fs = require("fs");
const os = require("os");
const fetch = require("node-fetch");
const FormData = require("form-data");
const psList = require("ps-list");
const sqlite3 = require("sqlite3").verbose();
const activeWin = require("active-win");

console.log("✅ Main process starting...");

if (!app.isPackaged) {
  require("dotenv").config();
}

let mainWindow;

/* =====================================================
   WINDOW
   ===================================================== */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    icon: path.join(__dirname, "assets", "icons", "iconwin.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3000");

    mainWindow.on("blur", () => {
      try {
        mainWindow.webContents.send("force-pause");
      } catch {}
    });

    mainWindow.on("minimize", () => {
      try {
        mainWindow.webContents.send("force-pause");
      } catch {}
    });

    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "build", "index.html"));
  }

  console.log("Main window created!");
}

/* =====================================================
   ✅ REAL TIME-SPENT TRACKING (PER HOSTNAME)
   ===================================================== */

let siteTimeMap = {}; // { hostname: seconds }
let lastTickTime = Date.now();

setInterval(async () => {
  try {
    const win = await activeWin();
    if (!win) return;

    const browserNames = ["chrome", "firefox", "msedge", "brave"];
    const processName = win.owner.name.toLowerCase();
    if (!browserNames.some((b) => processName.includes(b))) return;

    const now = Date.now();
    const deltaSeconds = Math.floor((now - lastTickTime) / 1000);
    lastTickTime = now;

    if (deltaSeconds <= 0) return;

    let hostname = "unknown";
    try {
      if (win.url) hostname = new URL(win.url).hostname;
    } catch {}

    if (!hostname) hostname = "unknown";

    if (!siteTimeMap[hostname]) siteTimeMap[hostname] = 0;
    siteTimeMap[hostname] += deltaSeconds;
  } catch {}
}, 5000);

/* =====================================================
   CHROME PROFILE HELPERS
   ===================================================== */

function getChromeUserDataDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome"
    );
  }
  return path.join(os.homedir(), ".config", "google-chrome");
}

function listChromeProfilesSafe() {
  const baseDir = getChromeUserDataDir();
  if (!baseDir || !fs.existsSync(baseDir)) return [];

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  const profiles = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((dir) => fs.existsSync(path.join(baseDir, dir, "History")));

  profiles.sort((a, b) => {
    if (a === "Default") return -1;
    if (b === "Default") return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return profiles;
}

function sanitizeProfileDir(profileDir) {
  const available = listChromeProfilesSafe();
  if (!available.length) return "Default";
  if (available.includes(profileDir)) return profileDir;
  return available.includes("Default") ? "Default" : available[0];
}

/* =====================================================
   ✅ FIXED: TODAY-ONLY CHROME HISTORY
   Returns: { hostname, visitTime }
   ===================================================== */

const fetchChromeHistory = ({ profileDir = "Default", dbLimit = 5000 } = {}) => {
  return new Promise((resolve) => {
    const baseDir = getChromeUserDataDir();
    if (!baseDir) return resolve([]);

    const safeProfile = sanitizeProfileDir(profileDir);
    const chromePath = path.join(baseDir, safeProfile, "History");
    if (!fs.existsSync(chromePath)) return resolve([]);

    const tempPath = path.join(
      app.getPath("userData"),
      `TempHistory_${safeProfile.replace(/[^\w.-]/g, "_")}`
    );

    try {
      fs.copyFileSync(chromePath, tempPath);

      const db = new sqlite3.Database(
        tempPath,
        sqlite3.OPEN_READONLY,
        (openErr) => {
          if (openErr) {
            try { fs.unlinkSync(tempPath); } catch {}
            return resolve([]);
          }

          db.all(
            "SELECT url, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT ?",
            [Number(dbLimit) || 5000],
            (err, rows) => {
              db.close(() => {
                try { fs.unlinkSync(tempPath); } catch {}
              });

              if (err || !Array.isArray(rows)) return resolve([]);

              const CHROME_EPOCH_OFFSET_MS = 11644473600000;

              const now = new Date();
              const todayStart = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
              ).getTime();
              const todayEnd = todayStart + 24 * 60 * 60 * 1000;

              const seen = new Set();
              const result = [];

              for (const r of rows) {
                if (!r.last_visit_time) continue;

                const visitMs =
                  Number(r.last_visit_time) / 1000 -
                  CHROME_EPOCH_OFFSET_MS;

                if (!Number.isFinite(visitMs)) continue;
                if (visitMs < todayStart || visitMs >= todayEnd) continue;

                let hostname = "";
                try {
                  hostname = new URL(r.url).hostname;
                } catch {
                  continue;
                }

                if (!hostname) continue;

                const visitDate = new Date(visitMs);

                const minuteKey =
                  visitDate.getHours() + ":" + visitDate.getMinutes();
                const uniqueKey = `${hostname}|${minuteKey}`;

                if (seen.has(uniqueKey)) continue;
                seen.add(uniqueKey);

                result.push({
                  hostname,
                  visitTime: visitDate.toLocaleTimeString(),
                });
              }

              resolve(result);
            }
          );
        }
      );
    } catch {
      try { fs.unlinkSync(tempPath); } catch {}
      resolve([]);
    }
  });
};

/* =====================================================
   🔥 URGENT WINDOW CONTROL
   ===================================================== */

function bringWindowToFrontUrgent() {
  if (!mainWindow) return;

  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    mainWindow.moveTop();
    mainWindow.flashFrame(true);
  } catch (e) {
    console.error("Urgent bring-to-front failed:", e);
  }
}

function clearUrgentMode() {
  if (!mainWindow) return;
  try {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.flashFrame(false);
  } catch {}
}

/* =====================================================
   IPC HANDLERS
   ===================================================== */

// ✅ REAL time spent per site
ipcMain.handle("get-active-time-logs", () => {
  return Object.entries(siteTimeMap).map(([hostname, seconds]) => ({
    hostname,
    seconds,
  }));
});

// optional reset
ipcMain.handle("reset-site-time-logs", () => {
  siteTimeMap = {};
  lastTickTime = Date.now();
  return true;
});

// process list
ipcMain.handle("track-browser-activity", async () => {
  try {
    const processes = await psList();
    return processes
      .filter((p) => {
        const name = p.name.toLowerCase();
        return (
          name.includes("chrome") ||
          name.includes("firefox") ||
          name.includes("edge")
        );
      })
      .map((p) => ({
        browser: p.name,
        pid: p.pid,
        time: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
});

// chrome profiles
ipcMain.handle("chrome:list-profiles", async () => {
  try {
    return listChromeProfilesSafe();
  } catch {
    return [];
  }
});

// fixed history
ipcMain.handle("fetch-browser-history", async (_event, args) => {
  let opts = {};
  if (typeof args === "string") opts = { profileDir: args };
  else if (args && typeof args === "object") opts = args;
  return await fetchChromeHistory(opts);
});

// urgent window
ipcMain.handle("urgent:show", () => {
  bringWindowToFrontUrgent();
  return true;
});

ipcMain.handle("urgent:clear", () => {
  clearUrgentMode();
  return true;
});

/* =====================================================
   EXISTING IPC — UNTOUCHED
   ===================================================== */

ipcMain.handle("get-idle-time", () => {
  return powerMonitor.getSystemIdleTime();
});

ipcMain.handle("get-sources", async () => {
  return await desktopCapturer.getSources({ types: ["screen"] });
});

ipcMain.handle("save-image", async (_event, buffer) => {
  const filename = `screenshot-${Date.now()}.png`;
  const form = new FormData();
  form.append("file", Buffer.from(buffer), {
    filename,
    contentType: "image/png",
  });

  try {
    const response = await fetch("https://chat.mcqstudy.com/upload.php", {
      method: "POST",
      body: form,
    });
    const result = await response.json();

    if (result.success) {
      return { success: true, path: `https://chat.mcqstudy.com${result.path}` };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
});

ipcMain.handle("get-token-cookie", async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({
      url: "http://localhost:5500",
    });
    const tokenCookie = cookies.find((c) => c.name === "token");
    return tokenCookie ? tokenCookie.value : null;
  } catch {
    return null;
  }
});

/* =====================================================
   APP LIFECYCLE
   ===================================================== */

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
