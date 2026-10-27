# Auto-start the SilkOS X session when the live user logs in on tty1.
if [ -z "$DISPLAY" ] && [ "$(id -u)" != 0 ] && [ "$(tty 2>/dev/null)" = /dev/tty1 ]; then
  exec startx /bin/sh /usr/local/bin/silkos-xsession -- -nolisten tcp
fi
