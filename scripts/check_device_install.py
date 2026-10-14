import os
from libs.dictionary_menu import install
from startup.cardputeradv.framework import Framework
install()
assert Framework._dictionary_installed
source = open('/flash/apps/dictionary.py').read()
assert source.count('while running:') == 1
scope = {'__name__': '__main__'}
exec(source.replace('while running:', 'for _ in range(5):'), scope)
del source
import gc
gc.collect()
scope['query'] = ''
scope['page'] = 'search'
scope['on_key'](97)
assert scope['query'] == 'a'
called = []
scope['connect_wifi'] = lambda: called.append(True) or False
scope['on_key'](10)
scope['on_key'](13)
assert len(called) == 2
scope['page'] = 'result'
scope['on_key'](ord('3'))
assert scope['page'] == 'search' and scope['query'] == ''
scope['on_key'](27)
assert scope['running'] is False
print('PASS: device app startup, typing, both Enter codes, Home, Escape')

class Event:
    row = 1
    col = 0
    keycode = 43

event = Event()
assert scope['normalize_key'](event) == 9
event.row, event.col = 0, 12
assert scope['normalize_key'](event) == 43
scope['running'] = True
scope['page'] = 'search'
scope['direction'] = 'en-zh'
scope['connect_wifi'] = lambda: True
scope['on_key'](9)
assert scope['direction'] == 'zh-en' and scope['query'] == ''
for char in 'zhongguo':
    scope['on_key'](ord(char))
assert scope['composition'] == 'zhongguo'
scope['on_key'](32)
assert scope['page'] == 'candidates', scope['status']
assert scope['candidates'][0]['headword'] == '\u4e2d\u56fd'
scope['on_key'](ord('1'))
assert scope['query'] == '\u4e2d\u56fd' and scope['composition'] == ''
scope['on_key'](10)
assert scope['page'] == 'result' and scope['last_entry'], scope['status']
print('PASS: device Tab normalization, pinyin candidates, Chinese selection, CN->EN:', scope['last_entry']['definitions'][0])
scope['on_key'](ord('3'))
for char in 'apple':
    scope['on_key'](ord(char))
scope['on_key'](13)
assert scope['page'] == 'result' and scope['last_entry'], scope['status']
assert '\u82f9\u679c' in scope['last_entry']['definitions'][0]
scope['on_key'](27)
assert not scope['running']
print('PASS: device EN->CN apple lookup and Escape')
