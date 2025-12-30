const { app, BrowserWindow, ipcMain, session, desktopCapturer, powerMonitor } = require("electron");
const path = require("path");
const fetch = require("node-fetch");
const FormData = require("form-data");

console.log("✅ Main process starting...");

if (!app.isPackaged) {
  require("dotenv").config();
}

let mainWindow; // ✅ ADD THIS

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

/* ===========================
   🔥 URGENT WINDOW CONTROL
   =========================== */

function bringWindowToFrontUrgent() {
  if (!mainWindow) return;

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();

    // strongest safe level
    mainWindow.setAlwaysOnTop(true, "screen-saver");

    // ensure visibility everywhere
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });

    // nudge window managers
    mainWindow.moveTop();

    // taskbar / dock attention
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

/* ===========================
   IPC
   =========================== */

ipcMain.handle("urgent:show", () => {
  bringWindowToFrontUrgent();
  return true;
});

ipcMain.handle("urgent:clear", () => {
  clearUrgentMode();
  return true;
});

/* ===========================
   APP LIFECYCLE
   =========================== */

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ===========================
   EXISTING IPC — UNTOUCHED
   =========================== */

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
