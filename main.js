// main.js
const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor } = require("electron");
const path = require("path");
const fetch = require("node-fetch"); // v2
const FormData = require("form-data");

// Load .env only in development
if (!app.isPackaged) {
  require("dotenv").config();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, "assets", "icons", "iconwin.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "build", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers

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
      const fullUrl = `https://chat.mcqstudy.com${result.path}`;
      console.log(`✅ Uploaded: ${fullUrl}`);
      return { success: true, path: fullUrl };
    }
    console.error("❌ Upload failed:", result.error);
    return { success: false };
  } catch (error) {
    console.error("❌ Upload error:", error);
    return { success: false };
  }
});
