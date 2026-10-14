"""Add Dictionary to the UIFlow2.5.3 Cardputer ADV launcher."""

import M5
from startup.cardputeradv.app_base import AppBase
from startup.cardputeradv.apps.launcher import Icon
from startup.cardputeradv.framework import Framework
from startup.cardputeradv import res


class DictionaryApp(AppBase):
    def __init__(self, framework):
        super().__init__()
        self.framework = framework

    def start(self):
        try:
            import sys
            import gc
            if '/flash/apps' not in sys.path:
                sys.path.append('/flash/apps')
            sys.modules.pop('dictionary', None)
            gc.collect()
            __import__('dictionary')
        except Exception as exc:
            import sys
            sys.print_exception(exc)
            M5.Lcd.fillScreen(0)
            M5.Lcd.setCursor(8, 30)
            M5.Lcd.print('Dictionary error: ' + str(exc)[:60])
            import time
            time.sleep_ms(2500)
        finally:
            import sys
            import gc
            sys.modules.pop('dictionary', None)
            gc.collect()
            self.framework._app_selector.select(self.framework._launcher)
            # Launcher.on_view only redraws y>=16; redraw the top status bar
            # (y=0-15) too, otherwise the dictionary title leaves a residual.
            bar = getattr(self.framework, "_bar", None)
            if bar is not None:
                try:
                    bar.on_launch()
                    bar.on_view()
                except Exception:
                    pass
            self.framework._launcher.start()


def install():
    if getattr(Framework, '_dictionary_installed', False):
        return
    original_start = Framework.start

    # ponytail: uses UIFlow2.5.3 private launcher fields; recheck on firmware upgrade.
    def start(self):
        self._launcher._icos += (Icon('DICTIONARY', res.DEVELOP_ICO),)
        self.install(DictionaryApp(self))
        self._launcher._id = len(self._launcher._icos) - 1
        print('Launcher entries:', [icon.name for icon in self._launcher._icos])
        return original_start(self)

    Framework.start = start
    Framework._dictionary_installed = True
