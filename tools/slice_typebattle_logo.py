#!/usr/bin/env python3
"""Split the ten keycaps in the supplied transparent Type Battle logo."""

from __future__ import annotations

import json
from array import array
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design" / "typebattle-logo-dark-bg_4x.png"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "brand"
LAYOUT = OUTPUT / "sprites.json"

EXPECTED_SIZE = (2720, 976)
EXPECTED_BOXES = {
    "type-t": (93, 129, 408, 478),
    "type-y": (411, 88, 720, 432),
    "type-p": (738, 130, 1041, 470),
    "type-e": (1046, 96, 1364, 447),
    "battle-b": (738, 534, 1041, 874),
    "battle-a": (1057, 548, 1357, 884),
    "battle-t-1": (1381, 533, 1677, 867),
    "battle-t-2": (1695, 546, 1998, 886),
    "battle-l": (2019, 532, 2319, 868),
    "battle-e": (2339, 545, 2635, 879),
}
SPRITE_NAMES = list(EXPECTED_BOXES)
LARGE_COMPONENTS = 10
MIN_SIZE_GAP = 5


@dataclass
class Component:
    label: int
    area: int = 0
    left: int = 2**31 - 1
    top: int = 2**31 - 1
    right: int = 0
    bottom: int = 0

    @property
    def box(self) -> tuple[int, int, int, int]:
        return self.left, self.top, self.right, self.bottom


class Labels:
    def __init__(self) -> None:
        self.parents = [0]

    def add(self) -> int:
        label = len(self.parents)
        self.parents.append(label)
        return label

    def find(self, label: int) -> int:
        root = label
        while self.parents[root] != root:
            root = self.parents[root]
        while self.parents[label] != label:
            parent = self.parents[label]
            self.parents[label] = root
            label = parent
        return root

    def union(self, first: int, second: int) -> int:
        first_root = self.find(first)
        second_root = self.find(second)
        if first_root == second_root:
            return first_root
        root, child = sorted((first_root, second_root))
        self.parents[child] = root
        return root


def connected_components(alpha: bytes, width: int, height: int) -> tuple[array, list[Component]]:
    pixel_labels = array("I", [0]) * (width * height)
    labels = Labels()

    for y in range(height):
        row = y * width
        for x in range(width):
            index = row + x
            if alpha[index] == 0:
                continue

            neighbors = []
            if x:
                neighbors.append(pixel_labels[index - 1])
            if y:
                above = index - width
                if x:
                    neighbors.append(pixel_labels[above - 1])
                neighbors.append(pixel_labels[above])
                if x + 1 < width:
                    neighbors.append(pixel_labels[above + 1])

            roots = {labels.find(label) for label in neighbors if label}
            if not roots:
                pixel_labels[index] = labels.add()
            else:
                root = min(roots)
                for other in roots:
                    root = labels.union(root, other)
                pixel_labels[index] = root

    components: dict[int, Component] = {}
    for index, label in enumerate(pixel_labels):
        if not label:
            continue
        root = labels.find(label)
        pixel_labels[index] = root
        component = components.setdefault(root, Component(root))
        x = index % width
        y = index // width
        component.area += 1
        component.left = min(component.left, x)
        component.top = min(component.top, y)
        component.right = max(component.right, x + 1)
        component.bottom = max(component.bottom, y + 1)

    return pixel_labels, list(components.values())


def select_keycaps(components: list[Component]) -> list[Component]:
    ranked = sorted(components, key=lambda item: item.area, reverse=True)
    if len(ranked) < LARGE_COMPONENTS:
        raise RuntimeError(
            f"Beklenen 10 büyük bileşen; toplam {len(ranked)} bağlı bileşen bulundu."
        )

    cutoff = ranked[LARGE_COMPONENTS - 1].area
    large = [component for component in ranked if component.area >= cutoff]
    next_area = ranked[LARGE_COMPONENTS].area if len(ranked) > LARGE_COMPONENTS else 0
    print(f"Alfa bağlı bileşen sayısı: {len(components)}")
    print(f"Büyük bileşen sayısı: {len(large)} (alfa alanı eşiği: {cutoff})")
    print(f"10. ve 11. büyük bileşen alan oranı: {cutoff / next_area if next_area else 'n/a'}")

    if len(large) != LARGE_COMPONENTS:
        raise RuntimeError(f"Beklenen tam 10 büyük bileşen; {len(large)} bulundu.")
    if next_area and cutoff < next_area * MIN_SIZE_GAP:
        raise RuntimeError(
            "En büyük 10 bileşen diğer bileşenlerden yeterince ayrışmıyor; "
            "sprite seçimi güvenilir değil."
        )

    for component in sorted(large, key=lambda item: (item.top, item.left)):
        print(f"  bbox={component.box} area={component.area}")
    return large


def order_sprites(components: list[Component], height: int) -> list[tuple[str, Component]]:
    midpoint = height / 2
    top_row = sorted(
        (component for component in components if (component.top + component.bottom) / 2 < midpoint),
        key=lambda item: item.left,
    )
    bottom_row = sorted(
        (component for component in components if (component.top + component.bottom) / 2 >= midpoint),
        key=lambda item: item.left,
    )
    if len(top_row) != 4 or len(bottom_row) != 6:
        raise RuntimeError(
            f"Beklenen satır dağılımı 4+6; bulunan dağılım {len(top_row)}+{len(bottom_row)}."
        )
    ordered = top_row + bottom_row
    return list(zip(SPRITE_NAMES, ordered))


def validate_boxes(sprites: list[tuple[str, Component]]) -> None:
    mismatches = []
    for name, component in sprites:
        expected = EXPECTED_BOXES[name]
        actual = component.box
        if any(abs(actual_value - expected_value) > 6 for actual_value, expected_value in zip(actual, expected)):
            mismatches.append(f"{name}: actual={actual}, expected={expected}")
    if mismatches:
        raise RuntimeError("Beklenen bbox'lardan 6 px'den fazla sapma:\n" + "\n".join(mismatches))


def validate_source(image: Image.Image, sprites: list[tuple[str, Component]]) -> None:
    errors = []
    if image.size != EXPECTED_SIZE:
        errors.append(
            f"Beklenen tuval {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, "
            f"kaynak {image.width}x{image.height}."
        )
    try:
        validate_boxes(sprites)
    except RuntimeError as error:
        errors.append(str(error))
    if errors:
        raise RuntimeError("\n".join(errors))


def write_sprites(
    image: Image.Image,
    pixel_labels: array,
    sprites: list[tuple[str, Component]],
) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    layout = {
        "canvas": {"width": image.width, "height": image.height},
        "sprites": [],
    }

    for name, component in sprites:
        left, top, right, bottom = component.box
        cropped = image.crop(component.box)
        cropped_pixels = cropped.load()
        for y in range(top, bottom):
            for x in range(left, right):
                if pixel_labels[y * image.width + x] != component.label:
                    cropped_pixels[x - left, y - top] = (0, 0, 0, 0)

        filename = f"{name}.png"
        cropped.save(OUTPUT / filename, format="PNG", optimize=True, compress_level=9)
        layout["sprites"].append(
            {
                "name": name,
                "file": filename,
                "x": left,
                "y": top,
                "w": right - left,
                "h": bottom - top,
            }
        )

    LAYOUT.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_bytes = sum((OUTPUT / item["file"]).stat().st_size for item in layout["sprites"])
    print(f"PNG toplam boyutu: {total_bytes} bytes")
    print(f"Yazıldı: {OUTPUT}")


def main() -> None:
    if not SOURCE.is_file():
        raise RuntimeError(f"Kaynak dosya bulunamadı: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A").tobytes()
    pixel_labels, components = connected_components(alpha, image.width, image.height)
    keycaps = select_keycaps(components)
    sprites = order_sprites(keycaps, image.height)
    validate_source(image, sprites)
    write_sprites(image, pixel_labels, sprites)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"HATA: {error}") from error
