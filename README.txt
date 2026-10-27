SILKOS DESKTOP (Windows)
1. Install Node.js (LTS) from https://nodejs.org  (one time)
2. Unzip this folder, double-click run.bat
   Electron downloads once into %LOCALAPPDATA%\SilkOS-runtime (about 100 MB). Updates never re-download it, and after that first run Node.js isn't needed.
Controls: F11 = toggle fullscreen. Browser app (compass icon) opens automatically at startup.
Optional - make a single .exe: open a terminal in this folder and run
   npm install
   npm run build
The exe appears in the "dist" folder.

Shortcuts: Ctrl+K = Spotlight, Ctrl+T new tab, Ctrl+W close tab, Ctrl+L address bar, Ctrl+R reload, Ctrl+D add bookmark, F11 fullscreen.
