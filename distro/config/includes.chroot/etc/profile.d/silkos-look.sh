# Xcursor and Qt are configured through the environment because neither reads GTK's settings.ini.
# The values name the theme data installed by 0102-theme.hook.chroot.
export XCURSOR_THEME=WhiteSur-cursors
export XCURSOR_SIZE=24
export QT_STYLE_OVERRIDE=adwaita
# GTK apps hand their menu bar to SilkOS instead of drawing it (see silkos-appmenu). The bare name
# resolves to /usr/lib/x86_64-linux-gnu/gtk-3.0/modules/libappmenu-gtk-module.so.
export GTK_MODULES="${GTK_MODULES:+$GTK_MODULES:}appmenu-gtk-module"
