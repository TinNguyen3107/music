from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / 'reference'
source = Image.open(root / 'frame-00.jpg').convert('RGB')
implementation = Image.open(root / 'desktop-viewport.png').convert('RGB')
print('Source pixels:', source.size, 'Implementation pixels:', implementation.size)
# The desktop browser capture is scaled by its host window; normalize to its
# explicit 1110 x 960 CSS viewport before comparing, without stitched full-page output.
implementation = implementation.resize((1110, 960), Image.Resampling.LANCZOS)
def pair(left, right, name):
    canvas = Image.new('RGB', (left.width + right.width + 24, max(left.height, right.height) + 32), '#eae4e8')
    canvas.paste(left, (0, 32)); canvas.paste(right, (left.width + 24, 32))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), 'USER VIDEO REFERENCE', fill='#392d3b')
    draw.text((left.width + 36, 10), 'MELODIK IMPLEMENTATION - AUTHORIZED ADAPTATION', fill='#392d3b')
    canvas.save(root / name)
pair(source.crop((0, 89, 1110, 720)), implementation.crop((0, 0, 1110, 631)), 'comparison-desktop.jpg')
pair(source.crop((150, 412, 465, 720)), implementation.crop((41, 333, 359, 641)), 'comparison-record.jpg')
