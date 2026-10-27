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
Real on Linux: Shut Down / Restart / Sleep (systemctl), battery (/sys), network status (nmcli), brightness (brightnessctl).
Store app: searches and installs Flathub apps with flatpak (per-user, needs internet). On the live ISO, installed apps live in RAM and are gone after a reboot.
Volume has a hook (`silk.volume`) but no slider in the UI yet. Still fake: Wi-Fi picker, Files app.
