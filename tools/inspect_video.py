from pathlib import Path
import cv2
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
video = cv2.VideoCapture(str(root / 'd8bd5d62-3d02-443f-8759-18006ef19afb.mp4'))
fps = video.get(cv2.CAP_PROP_FPS)
duration = video.get(cv2.CAP_PROP_FRAME_COUNT) / fps
print(f'Duration: {duration:.2f}s; FPS: {fps}')
out = root / 'reference'
out.mkdir(exist_ok=True)
times = [duration * i / 19 for i in range(20)]
sheet = Image.new('RGB', (1600, 5 * 260), '#202020')
draw = ImageDraw.Draw(sheet)
for i, seconds in enumerate(times):
    video.set(cv2.CAP_PROP_POS_MSEC, min(seconds, duration - .5) * 1000)
    ok, frame = video.read()
    if not ok:
        continue
    im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    im.save(out / f'frame-{i:02}.jpg')
    im.thumbnail((400, 235))
    x, y = (i % 4) * 400, (i // 4) * 260
    sheet.paste(im, (x, y + 25))
    draw.text((x + 8, y + 6), f'{i:02} | {seconds:.1f}s', fill='white')
sheet.save(out / 'contact-sheet.jpg')
video.release()
