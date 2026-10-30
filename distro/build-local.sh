#!/bin/sh
# Build the ISO on your own Debian/Ubuntu machine or VM (needs sudo). Run from the repo root AFTER `npm run build:linux`.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/distro/config/packages.chroot"
cp "$ROOT"/dist/*.deb "$ROOT/distro/config/packages.chroot/"
sudo docker run --rm --privileged -v "$ROOT":/work -w /work/distro debian:trixie sh -ec '
  apt-get update && apt-get install -y live-build debootstrap squashfs-tools xorriso syslinux syslinux-common isolinux grub-pc-bin grub-efi-amd64-bin mtools dosfstools cpio ca-certificates
  # Git only carries the exec bit for files committed as executable, and live-build skips a hook it
  # cannot run, so make the hooks and session scripts runnable the way the ISO workflow does.
  chmod +x config/hooks/normal/* config/includes.chroot/usr/local/bin/*
  lb clean --purge || true
  lb config
  lb build
'
ls -lh "$ROOT"/distro/*.iso
