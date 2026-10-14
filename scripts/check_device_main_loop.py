import gc
import sys
from hardware import MatrixKeyboard
# Release previous diagnostic globals before measuring the actual module path.
globals().pop('scope', None)
globals().pop('dictionary', None)
gc.collect()

class Event:
    def __init__(self, keycode, row=0, col=1):
        self.keycode, self.row, self.col = keycode, row, col

if '/flash/apps' not in sys.path:
    sys.path.append('/flash/apps')
keyboard = MatrixKeyboard()
keyboard.set_callback(None)
keyboard._keyboard._keyevents.clear()
keyboard._keyboard._keyevents.extend([Event(ord(c)) for c in 'apple'] + [Event(13), Event(27)])
sys.modules.pop('dictionary', None)
import dictionary
assert dictionary.last_entry and dictionary.last_word == 'apple', dictionary.status
assert '苹果' in dictionary.last_entry['definitions'][0]
assert not dictionary.running
print('PASS: real module import and main loop, apple EN->CN, Escape')
sys.modules.pop('dictionary', None)
del dictionary
gc.collect()
keyboard._keyboard._keyevents.extend([Event(43, 1, 0)] + [Event(ord(c)) for c in 'zhongguo'] + [Event(32), Event(ord('1')), Event(10), Event(27)])
import dictionary
assert dictionary.last_entry and dictionary.last_word == '中国', dictionary.status
assert 'China' in dictionary.last_entry['definitions'][0]
assert not dictionary.running
print('PASS: real main loop Tab->pinyin->candidate 1->CN lookup->Escape')
sys.modules.pop('dictionary', None)
del dictionary
gc.collect()
