const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  powerMonitor,
} = require("electron");

const { spawn } = require("child_process");

const path = require("path");
const fs = require("fs");
const os = require("os");
const fetch = require("node-fetch");
const FormData = require("form-data");
const psList = require("ps-list");
const sqlite3 = require("sqlite3").verbose();

let urlEngine = null;
let sessionCache = {};
let currentSession = { domain: null, startTime: null };

const exePath = path.join(__dirname, "src", "bin", "UrlGetter.exe"); //Its the engine path

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
   ✅ REAL TIME-SPENT TRACKING (PER HOSTNAME) — FIXED
   Uses PowerShell (no native bindings)
   ===================================================== */

let siteTimeMap = {}; // { hostname: seconds }
let lastTickTime = Date.now();

const exec = require("child_process").exec;

function getActiveWindowTitle() {
  const cmd = `
powershell -command "
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
  [DllImport(\\"user32.dll\\")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport(\\"user32.dll\\", SetLastError=true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@
$hWnd = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[Win32]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
$sb.ToString()
"
  `;
  exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ Error:", err);
      console.error("❌ stderr:", stderr);
      return;
    }

    const title = stdout.trim();
    console.log("Active Window Title:", title);
  });
}

// Test the active window title capture
getActiveWindowTitle();

// setInterval(() => {
//   console.log("⏱ TRACKER TICK", new Date().toLocaleTimeString());

//   getActiveWindowTitle((title) => {
//     if (!title) {
//       console.log("❌ NO ACTIVE TITLE");
//       return;
//     }

//     console.log("📝 WINDOW TITLE:", title); // Log the title every time it is retrieved

//     const now = Date.now();
//     const deltaSeconds = Math.floor((now - lastTickTime) / 1000);
//     lastTickTime = now;

//     if (deltaSeconds <= 0) return;

//     let hostname = "";

//     // Extract domain from window title
//     const match = title.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
//     if (match) {
//       hostname = match[0];
//       console.log("🌐 Extracted HOSTNAME:", hostname); // Log extracted hostname
//     } else {
//       console.log("⚠ No valid hostname found in title.");
//       return;
//     }

//     if (!hostname) {
//       console.log("⚠ No valid hostname detected.");
//       return;
//     }

//     if (!siteTimeMap[hostname]) siteTimeMap[hostname] = 0;
//     siteTimeMap[hostname] += deltaSeconds;

//     console.log("✅ Time accumulated:", hostname, siteTimeMap[hostname], "seconds");

//     // Log the entire siteTimeMap
//     console.log("Current siteTimeMap:", siteTimeMap);
//   });
// }, 5000);

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
   ✅ TODAY-ONLY CHROME HISTORY
   ===================================================== */

const fetchChromeHistory = ({
  profileDir = "Default",
  dbLimit = 5000,
} = {}) => {
  console.log(`Fetching Chrome history for profile: ${profileDir}`); // Log profile being used

  return new Promise((resolve) => {
    const baseDir = getChromeUserDataDir();
    if (!baseDir) return resolve([]);

    const safeProfile = sanitizeProfileDir(profileDir);
    const chromePath = path.join(baseDir, safeProfile, "History");
    console.log("Chrome history database path:", chromePath); // Log the path

    if (!fs.existsSync(chromePath)) return resolve([]);

    const tempPath = path.join(
      app.getPath("userData"),
      `TempHistory_${safeProfile.replace(/[^\w.-]/g, "_")}`
    );

    try {
      fs.copyFileSync(chromePath, tempPath);
      // console.log("✅ Copied history file to temporary location:", tempPath);

      const db = new sqlite3.Database(
        tempPath,
        sqlite3.OPEN_READONLY,
        (openErr) => {
          if (openErr) {
            console.error("❌ Failed to open history database:", openErr);
            try {
              fs.unlinkSync(tempPath);
            } catch {}
            return resolve([]);
          }

          db.all(
            "SELECT url, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT ?",
            [Number(dbLimit) || 5000],
            (err, rows) => {
              db.close(() => {
                try {
                  fs.unlinkSync(tempPath);
                } catch {}
              });

              if (err || !Array.isArray(rows)) {
                console.error("❌ Error fetching history rows:", err);
                return resolve([]);
              }

              // console.log("✅ Fetched Chrome history rows:", rows); // Log the fetched rows

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
                  Number(r.last_visit_time) / 1000 - CHROME_EPOCH_OFFSET_MS;
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

              // console.log("✅ Filtered Chrome history data:", result); // Log filtered result
              resolve(result);
            }
          );
        }
      );
    } catch {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
      resolve([]);
    }
  });
};

function handleUrlDetection(newUrl) {
  if (!newUrl || newUrl === "No URL found") return;
  const now = new Date();

  try {
    const domain = new URL(
      newUrl.startsWith("http") ? newUrl : `https://${newUrl}`
    ).hostname;

    if (currentSession.domain && currentSession.domain !== domain) {
      const seconds = Math.floor((now - currentSession.startTime) / 1000);
      sessionCache[currentSession.domain] =
        (sessionCache[currentSession.domain] || 0) + seconds;
    }

    if (currentSession.domain !== domain) {
      currentSession = { domain, startTime: now };
    }
  } catch (e) {}
}

// Function to finalize the time for the currently active tab
function finalizeLastSession() {
  const now = new Date();
  if (currentSession.domain && currentSession.startTime) {
    const seconds = Math.floor((now - currentSession.startTime) / 1000);

    // Add the final seconds to our cache
    sessionCache[currentSession.domain] =
      (sessionCache[currentSession.domain] || 0) + seconds;

    console.log(`Finalized ${currentSession.domain}: ${seconds}s`);

    // Reset the session so it doesn't double-count
    currentSession = { domain: null, startTime: null };
  }
}

function syncDataToDatabase() {
  // Here you perform your MySQL UPSERT or call your Next.js API
  console.log("Final Task Data:", sessionCache);
  sessionCache = {};
  // ... insert MySQL logic here ...
}

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
// ipcMain.handle("get-active-time-logs", () => {
//   const activeTimeLogs = Object.entries(siteTimeMap).map(([hostname, seconds]) => ({
//     hostname,
//     seconds,
//   }));
//   // console.log("✅ Active time logs sent to renderer:", activeTimeLogs); // Log the time logs
//   return activeTimeLogs;
// });

// optional reset
ipcMain.handle("reset-site-time-logs", () => {
  siteTimeMap = {};
  lastTickTime = Date.now();
  return true;
});

// process list (unchanged)
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



let engineProcess = null; 

ipcMain.on("start-tracking", () => {
  console.log("🚀 Task Started: Launching Engine...");

  sessionCache = {};

  // 2. Spawn the process ONCE (No setInterval needed)
  // Ensure your C# code is a loop that prints the URL every 2s
  engineProcess = spawn(exePath);

  engineProcess.stdout.on("data", (data) => {
    const url = data.toString().trim();
    if (url && url !== "No URL found") {
      handleUrlDetection(url);
    }
  });

  engineProcess.on("error", (err) => {
    console.error("❌ Engine failed to start:", err);
  });

  engineProcess.stderr.on("data", (data) => {
    console.error(`Engine Error: ${data}`);
  });
});

ipcMain.on("stop-tracking", () => {
  console.log("🛑 Task Stopped: Finalizing Data...");

  // 1. Kill the long-running engine process
  if (engineProcess) {
    engineProcess.kill();
    engineProcess = null;
  }

  // 2. Finalize the very last active tab
  finalizeLastSession();

  // 3. Sync to DB (wrapped in setImmediate inside the function)
  syncDataToDatabase();
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
