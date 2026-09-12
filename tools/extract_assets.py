"""Extract user-supplied reference artwork, without browser chrome or UI text."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
dest = root / 'app/public/artwork'
dest.mkdir(parents=True, exist_ok=True)
assets = {
    'record': ('frame-01.jpg', (211, 279, 405, 472)),
    'sleeve': ('frame-01.jpg', (245, 315, 368, 438)),
    'night': ('frame-04.jpg', (131, 376, 373, 489)),
    'tea': ('frame-09.jpg', (405, 229, 692, 357)),
    'desk': ('frame-04.jpg', (728, 375, 972, 488)),
    'coffee': ('gallery-top.jpg', (444, 370, 657, 523)),
    'evening': ('gallery-top.jpg', (719, 369, 930, 524)),
    'forest': ('frame-06.jpg', (174, 306, 380, 451)),
    'flowers': ('frame-06.jpg', (440, 305, 656, 462)),
    'reading': ('frame-06.jpg', (720, 304, 935, 458)),
}
for name, (source, box) in assets.items():
    Image.open(root / 'reference' / source).crop(box).save(dest / f'{name}.webp', quality=93)
print(f'Extracted {len(assets)} assets from the supplied video.')
