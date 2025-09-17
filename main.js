const { app, BrowserWindow, ipcMain, session, desktopCapturer, powerMonitor } = require("electron");
const path = require("path");
const fetch = require("node-fetch"); // v2
const FormData = require("form-data");

// Add a debug log to ensure the main process is starting
console.log("✅ Main process starting...");

// Load .env only in development
if (!app.isPackaged) {
  require("dotenv").config();
}

// This function is triggered when the app is ready
function createWindow() {
  console.log("Inside createWindow function...");

  const win = new BrowserWindow({
    width: 1000,
    height: 750,
    icon: path.join(__dirname, "assets", "icons", "iconwin.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  console.log("Creating BrowserWindow...");

  if (!app.isPackaged) {
    console.log("Loading React app from http://localhost:3000...");
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools();  // Open Developer Tools for debugging
  } else {
    console.log("Loading production build...");
    win.loadFile(path.join(__dirname, "build", "index.html"));
  }

  console.log("BrowserWindow created and page loaded!");
}

// This will be called when the app is ready
app.whenReady().then(() => {
  console.log("App is ready! Creating the window now...");
  createWindow();
});

// If all windows are closed, quit the app (except on macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// On macOS, recreate a window when the app is activated
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers (for communication with renderer process)

// Handling idle time request
ipcMain.handle("get-idle-time", () => {
  console.log("Handling get-idle-time request...");
  return powerMonitor.getSystemIdleTime();
});

// Handling screen source request
ipcMain.handle("get-sources", async () => {
  console.log("Handling get-sources request...");
  return await desktopCapturer.getSources({ types: ["screen"] });
});

// Handling screenshot upload request
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
      console.log(`✅ Screenshot uploaded: ${fullUrl}`);
      return { success: true, path: fullUrl };
    } else {
      console.error("❌ Upload failed:", result.error);
      return { success: false };
    }
  } catch (error) {
    console.error("❌ Upload error:", error);
    return { success: false };
  }
});

// Add IPC handler to retrieve the token cookie and log it in the console
ipcMain.handle("get-token-cookie", async () => {
  try {
    console.log("Retrieving cookies for http://localhost:5500...");
    // console.log("Retrieving cookies for https://taskpro.twinstack.net...");
    

    // Retrieve cookies for the given URL (replace with your actual domain)
    const cookies = await session.defaultSession.cookies.get({ url: 'http://localhost:5500' });
    // const cookies = await session.defaultSession.cookies.get({ url: 'https://taskpro.twinstack.net' });

    // Log all cookies to debug
    console.log('Cookies retrieved:', cookies);

    // Find the token cookie
    const tokenCookie = cookies.find(cookie => cookie.name === 'token');
    if (tokenCookie) {
      console.log('Token cookie found:', tokenCookie.value);  // Log the token in the console
      return tokenCookie.value; // Return token to renderer process if needed
    } else {
      console.log('Token cookie not found');
      return null; // Return null if token not found
    }
  } catch (error) {
    console.error('Error retrieving cookies:', error);
    return null; // Return null in case of error
  }
});
