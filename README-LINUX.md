# SilkOS → bootable Linux ISO

## Build with GitHub Actions (recommended)
1. Create a new GitHub repo and upload everything in this folder (keep the `.github` folder).
2. Open the **Actions** tab → **Build SilkOS ISO** → **Run workflow** (takes ~15-25 min).
3. When it finishes, download the **silkos-iso** artifact (unzip it to get the `.iso`).
   If it fails, download the **build-log** artifact and send me the last ~60 lines.

## Test in VMware Workstation Pro
1. File > New Virtual Machine > Custom (advanced) > Next. Choose **"I will install the operating system later"**.
2. Guest OS: Linux > **Debian 12.x 64-bit** (or Debian 13 if listed). Firmware: BIOS (default).
3. 2 processors (1 core each), **4096 MB** memory, NAT network. For the disk, 20 GB is fine (it is never used by the live image).
4. Before starting: VM > Settings > Display > tick **Accelerate 3D graphics**, graphics memory 512 MB or more.
   CD/DVD > Use ISO image file > pick the SilkOS ISO. Make sure "Connect at power on" is ticked.
5. Power on. SilkOS starts by itself.
   - First boot: it uses software rendering (safe). To try the GPU, hit **e** / **Tab** at the boot menu and add `silkos.gpu`.
   - If animations stutter in software mode, switch on Lite Mode in Settings.

## Handy things
- Debug shell: Ctrl+Alt+F2, log in as `silk` / password `live`. Logs: `/tmp/silkos.log`, `/tmp/openbox.log`.
- Boot-menu options (press Tab/e): `silkos.gpu` = allow GPU in a VM, `silkos.nosandbox` = Electron --no-sandbox.
- Run on any Linux desktop without the ISO: `./linux/run.sh`
- Build locally instead (Ubuntu/Debian machine with Docker): `npm install && npm run build:linux && ./distro/build-local.sh`

## What is real vs fake now
Real on Linux: Shut Down / Restart / Sleep (systemctl), battery (/sys), network status (nmcli), brightness (brightnessctl), and output volume.
Finder browses files (including optional hidden files; double-click an .exe to run it with Wine). Terminal opens xterm. Notes supports folders, search, rich text, checklists, pinning, Trash and restore, export, and automatic local saving.
SilkOS keeps its desktop shell visible across four Openbox desktops; SilkOS windows stay on the desktop where you opened them. Switch with Ctrl+Alt+Left/Right or a four-finger horizontal swipe; swipe progress moves the current and next desktop together, settling on release. A five-finger inward pinch interactively reveals Launchpad and its backdrop as the gesture progresses. The Linux image includes Touchégg 2.0.18 for trackpad gestures; supported multitouch hardware is required, and virtual machines may not pass gestures through.
Saving (persistence): add a second empty virtual disk (8 GB or larger) to the VM, then Settings > Storage > Set up, and restart. Everything is kept after that. Installed Store apps appear in the dock and Launchpad.
All Openbox-managed desktop app windows (including Flatpak, Wine, and terminal apps) use the shared SilkOS dark title bar, with centered titles and the three colored controls on the left. Store-launched Flatpak apps disable GTK client-side decorations so they use the same SilkOS title bar. Picom matches SilkOS's rounded window corners to the display scale and adds soft shadows to normal app windows while leaving the fullscreen SilkOS desktop square. Store app icons retain transparent backgrounds so their logos blend into the dock.
Store app: searches and installs Flathub apps with flatpak (per-user, needs internet). On the live ISO, installed apps live in RAM and are gone after a reboot.
Control Center includes Wi-Fi and Bluetooth power controls and nearby-network/device panes for connecting, brightness and volume sliders, keyboard-backlight control when supported by the hardware, Do Not Disturb for SilkOS Browser toast notifications, a screen-lock action, and media-player controls when an MPRIS player is active. The live image enables NetworkManager and BlueZ and includes the Wi-Fi supplicant and radio-control utilities; usable wireless hardware and firmware are still required. AirDrop and Screen Mirroring are shown as unavailable in this Linux build. Settings includes desktop/dock layout, custom and built-in wallpapers, window behavior, keyboard switcher, accessibility, clock, Finder start folder/sorting/hidden-file/extension options, startup and app-session restore, audio, browser, security, and storage options. Alt+Tab cycles SilkOS windows and native app windows; Alt+Shift+Tab cycles in reverse.
The Apple menu, Control Center, and Settings > Security provide a SilkOS screen lock. Set a separate password in Settings > Security; any non-empty password is accepted (there is no 8-character minimum). The password is stored as a salted hash in the app's user data. This locks the SilkOS app window and does not replace the Linux account login.
