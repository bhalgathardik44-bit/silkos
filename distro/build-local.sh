#!/bin/sh
# Build the ISO on your own Debian/Ubuntu machine or VM (needs sudo). Run from the repo root AFTER `npm run build:linux`.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/distro/config/packages.chroot"
cp "$ROOT"/dist/*.deb "$ROOT/distro/config/packages.chroot/"
sudo docker run --rm --privileged -v "$ROOT":/work -w /work/distro debian:trixie sh -ec '
  apt-get update && apt-get install -y live-build debootstrap squashfs-tools xorriso syslinux syslinux-common isolinux grub-pc-bin grub-efi-amd64-bin mtools dosfstools cpio ca-certificates
  lb clean --purge || true
  lb config
  lb build
'
ls -lh "$ROOT"/distro/*.iso
