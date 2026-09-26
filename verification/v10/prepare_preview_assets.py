"""Preview-only resized copies of existing repository assets. Production bytes are untouched."""
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[2]
destination=R/'preview/v10/assets'; destination.mkdir(parents=True,exist_ok=True)
for source in sorted((R/'frontend/public/assets/boothup').glob('*.png')):
    with Image.open(source) as image:
        image.thumbnail((800,800),Image.Resampling.LANCZOS)
        image.save(destination/(source.stem+'.webp'),format='WEBP',quality=82)
with Image.open(R/'frontend/public/assets/brand/logo.png') as image:
    image.thumbnail((480,180),Image.Resampling.LANCZOS)
    image.save(destination/'logo.png',format='PNG',optimize=True)
print('Preview-only asset copies prepared; production images unchanged.')
