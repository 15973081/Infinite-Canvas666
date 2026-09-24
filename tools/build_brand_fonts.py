"""Optional asset preparation; requires fonttools[woff]==4.66.0, not used at runtime."""
from pathlib import Path

from fontTools.ttLib import TTFont


def main():
    directory = Path(__file__).resolve().parents[1] / 'static/vendor/fonts/shadox'
    for source in sorted(directory.glob('*.ttf')):
        with TTFont(source, recalcTimestamp=False) as font:
            font.flavor = 'woff2'
            destination = source.with_suffix('.woff2')
            font.save(destination)
        print(f'{destination.name}: {source.stat().st_size} -> {destination.stat().st_size} bytes')


if __name__ == '__main__':
    main()
