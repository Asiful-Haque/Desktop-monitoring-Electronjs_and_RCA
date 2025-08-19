// require('dotenv').config();
// const {
//   app,
//   BrowserWindow,
//   ipcMain,
//   desktopCapturer,
//   powerMonitor,
//   session,
// } = require("electron");
// const path = require("path");
// const fetch = require("node-fetch"); // v2
// const FormData = require("form-data");
// const querystring = require("querystring");

// //Making the cookies clear
// async function clearOAuthCookies() {
//   const oauthSession = session.fromPartition("persist:oauth-session");

//   try {
//     await oauthSession.clearStorageData({
//       storages: ["cookies"],
//     });
//     console.log("OAuth session cookies cleared!");
//   } catch (err) {
//     console.error("Failed to clear cookies:", err);
//   }
// }

// function createWindow() {
//   const win = new BrowserWindow({
//     width: 1000,
//     height: 700,
//     webPreferences: {
//       contextIsolation: true,
//       nodeIntegration: false,
//       preload: path.join(__dirname, "preload.js"),
//     },
//   });

//   //   win.loadFile(path.join(__dirname, 'index.html'));
//   win.loadURL("http://localhost:3000");
// }

// app.whenReady().then(async () => {
//   await clearOAuthCookies(); //It will be replaced with logout..here it is danger .....⚠️⚠️⚠️⚠️
//   createWindow(); // Your existing window creation function
// });

// // 💤 Get system idle time
// ipcMain.handle("get-idle-time", () => {
//   return powerMonitor.getSystemIdleTime();
// });

// // 🔁 Get screen sources
// ipcMain.handle("get-sources", async () => {
//   return await desktopCapturer.getSources({ types: ["screen"] });
// });

// // 🖼 Upload screenshot
// ipcMain.handle("save-image", async (_event, buffer) => {
//   const filename = `screenshot-${Date.now()}.png`;

//   const form = new FormData();
//   form.append("file", Buffer.from(buffer), {
//     filename,
//     contentType: "image/png",
//   });

//   try {
//     const response = await fetch("https://chat.mcqstudy.com/upload.php", {
//       method: "POST",
//       body: form,
//     });

//     const result = await response.json();

//     if (result.success) {
//       const fullUrl = `https://chat.mcqstudy.com${result.path}`;
//       console.log(`✅ Uploaded: ${fullUrl}`);
//       return { success: true, path: fullUrl };
//     } else {
//       console.error("❌ Upload failed:", result.error);
//       return { success: false };
//     }
//   } catch (error) {
//     console.error("❌ Upload error:", error);
//     return { success: false };
//   }
// });

// // 🔐 Start Google OAuth
// // 🔐 Start Google OAuth (fixed)
// // console.log("🔑 Client ID:", process.env.GOOGLE_CLIENT_ID);
// // console.log("🔑 Client Secret:", process.env.GOOGLE_CLIENT_SECRET);

// ipcMain.handle("start-oauth", async () => {
//   return new Promise((resolve) => {
//     const authWindow = new BrowserWindow({
//       width: 1000,
//       height: 700,
//       show: true,
//       webPreferences: {
//         session: session.fromPartition("persist:oauth-session"),
//         contextIsolation: false,
//         nodeIntegration: false,
//       },
//     });

//     const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
//     const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
//     const REDIRECT_URI = "http://localhost"; // Must exactly match the Google Cloud Console redirect URI

//     // Construct the OAuth authorization URL
//     const AUTH_URL =
//       "https://accounts.google.com/o/oauth2/v2/auth?" +
//       querystring.stringify({
//         client_id: CLIENT_ID,
//         redirect_uri: REDIRECT_URI,
//         response_type: "code",
//         scope: "email profile",
//         access_type: "offline",
//         prompt: "consent",
//       });

//     authWindow.loadURL(AUTH_URL);

//     authWindow.webContents.on("will-redirect", async (event, urlStr) => {
//       const parsedUrl = new URL(urlStr);
//       const code = parsedUrl.searchParams.get("code");

//       if (code) {
//         event.preventDefault(); // Prevent loading redirect page

//         try {
//           // Exchange authorization code for access token
//           const tokenResponse = await fetch(
//             "https://oauth2.googleapis.com/token",
//             {
//               method: "POST",
//               headers: { "Content-Type": "application/x-www-form-urlencoded" },
//               body: querystring.stringify({
//                 code,
//                 client_id: CLIENT_ID,
//                 client_secret: CLIENT_SECRET,
//                 redirect_uri: REDIRECT_URI,
//                 grant_type: "authorization_code",
//               }),
//             }
//           );

//           const tokenData = await tokenResponse.json();

//           console.log("Token response:", tokenData); // Log token response for debugging

//           authWindow.close();

//           if (tokenData.error) {
//             resolve({
//               success: false,
//               error: tokenData.error_description || tokenData.error,
//             });
//           } else {
//             resolve({ success: true, tokenData });
//           }
//         } catch (err) {
//           resolve({ success: false, error: err.message });
//         }
//       }
//     });

//     authWindow.on("closed", () => {
//       resolve({ success: false, error: "Window closed before login" });
//     });
//   });
// });









// main.js
// require("dotenv").config();
// const {
//   app,
//   BrowserWindow,
//   ipcMain,
//   desktopCapturer,
//   powerMonitor,
//   session,
// } = require("electron");
// const path = require("path");
// const fetch = require("node-fetch"); // v2
// const FormData = require("form-data");
// // const querystring = require("querystring");

// // ------------ Helpers ------------
// async function clearOAuthCookies() {
//   const oauthSession = session.fromPartition("persist:oauth-session");
//   try {
//     await oauthSession.clearStorageData({ storages: ["cookies"] });
//     console.log("OAuth session cookies cleared!");
//   } catch (err) {
//     console.error("Failed to clear cookies:", err);
//   }
// }

// function createWindow() {
//   const win = new BrowserWindow({
//     width: 1000,
//     height: 700,
//     webPreferences: {
//       contextIsolation: true,
//       nodeIntegration: false,
//       preload: path.join(__dirname, "preload.js"),
//     },
//   });

//   if (!app.isPackaged) {
//     // DEV: load React dev server
//     win.loadURL("http://localhost:3000");
//     win.webContents.openDevTools();
//   } else {
//     // PROD: load CRA build output
//     // Ensure your CRA "build" folder is included in electron-builder "files"
//     win.loadFile(path.join(__dirname, "build", "index.html"));
//   }
// }

// // ------------ App lifecycle ------------
// app.whenReady().then(async () => {
//   // ⚠️ Only clear OAuth cookies when the user logs out; doing it here wipes sessions every launch.
//   // await clearOAuthCookies();
//   createWindow();
// });

// app.on("window-all-closed", () => {
//   if (process.platform !== "darwin") app.quit();
// });

// app.on("activate", () => {
//   if (BrowserWindow.getAllWindows().length === 0) createWindow();
// });

// // ------------ IPC handlers you already had ------------

// // 💤 Get system idle time
// ipcMain.handle("get-idle-time", () => {
//   return powerMonitor.getSystemIdleTime();
// });

// // 🔁 Get screen sources
// ipcMain.handle("get-sources", async () => {
//   return await desktopCapturer.getSources({ types: ["screen"] });
// });

// // 🖼 Upload screenshot
// ipcMain.handle("save-image", async (_event, buffer) => {
//   const filename = `screenshot-${Date.now()}.png`;

//   const form = new FormData();
//   form.append("file", Buffer.from(buffer), {
//     filename,
//     contentType: "image/png",
//   });

//   try {
//     const response = await fetch("https://chat.mcqstudy.com/upload.php", {
//       method: "POST",
//       body: form,
//     });

//     const result = await response.json();

//     if (result.success) {
//       const fullUrl = `https://chat.mcqstudy.com${result.path}`;
//       console.log(`✅ Uploaded: ${fullUrl}`);
//       return { success: true, path: fullUrl };
//     } else {
//       console.error("❌ Upload failed:", result.error);
//       return { success: false };
//     }
//   } catch (error) {
//     console.error("❌ Upload error:", error);
//     return { success: false };
//   }
// });

// 🔐 Start Google OAuth
// ipcMain.handle("start-oauth", async () => {
//   return new Promise((resolve) => {
//     const authWindow = new BrowserWindow({
//       width: 1000,
//       height: 700,
//       show: true,
//       webPreferences: {
//         session: session.fromPartition("persist:oauth-session"),
//         contextIsolation: false,
//         nodeIntegration: false,
//       },
//     });

//     const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
//     const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
//     const REDIRECT_URI = "http://localhost"; // must match Google Console

//     const AUTH_URL =
//       "https://accounts.google.com/o/oauth2/v2/auth?" +
//       querystring.stringify({
//         client_id: CLIENT_ID,
//         redirect_uri: REDIRECT_URI,
//         response_type: "code",
//         scope: "email profile",
//         access_type: "offline",
//         prompt: "consent",
//       });

//     authWindow.loadURL(AUTH_URL);

//     authWindow.webContents.on("will-redirect", async (event, urlStr) => {
//       const parsedUrl = new URL(urlStr);
//       const code = parsedUrl.searchParams.get("code");

//       if (code) {
//         event.preventDefault(); // stop navigation
//         try {
//           const tokenResponse = await fetch(
//             "https://oauth2.googleapis.com/token",
//             {
//               method: "POST",
//               headers: { "Content-Type": "application/x-www-form-urlencoded" },
//               body: querystring.stringify({
//                 code,
//                 client_id: CLIENT_ID,
//                 client_secret: CLIENT_SECRET,
//                 redirect_uri: REDIRECT_URI,
//                 grant_type: "authorization_code",
//               }),
//             }
//           );

//           const tokenData = await tokenResponse.json();
//           console.log("Token response:", tokenData);
//           authWindow.close();

//           if (tokenData.error) {
//             resolve({
//               success: false,
//               error: tokenData.error_description || tokenData.error,
//             });
//           } else {
//             resolve({ success: true, tokenData });
//           }
//         } catch (err) {
//           resolve({ success: false, error: err.message });
//         }
//       }
//     });

//     authWindow.on("closed", () =>
//       resolve({ success: false, error: "Window closed before login" })
//     );
//   });
// });







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
