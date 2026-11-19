#!/usr/bin/env python3
"""Split the ten keycaps and six burst strokes in the Type Battle logo."""

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

REFERENCE_SIZE = (2720, 976)
EXPECTED_BOXES = {
    "type-t": (93, 129, 408, 478),
    "type-y": (411, 88, 720, 432),
    "type-p": (738, 130, 1041, 470),
    "type-e": (1046, 96, 1364, 447),
    "battle-B": (738, 534, 1041, 874),
    "battle-a": (1057, 548, 1357, 884),
    "battle-t-1": (1381, 533, 1677, 867),
    "battle-t-2": (1695, 546, 1998, 886),
    "battle-l": (2019, 532, 2319, 868),
    "battle-e": (2339, 545, 2635, 879),
}
EXPECTED_BURST_GROUPS = {
    "burst-a": (391, 495, 669, 773),
    "burst-b": (1411, 187, 1689, 465),
}
KEY_SPRITE_NAMES = list(EXPECTED_BOXES)
BURST_SPRITE_NAMES = [f"burst-{group}-{index}" for group in ("a", "b") for index in range(1, 4)]
KEY_COMPONENTS = 10
BURST_COMPONENTS = 6
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


def box_distance(first: tuple[float, float, float, float], second: tuple[float, float, float, float]) -> float:
    dx = max(first[0] - second[2], second[0] - first[2], 0)
    dy = max(first[1] - second[3], second[1] - first[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def scaled_box(box: tuple[int, int, int, int], scale: float) -> tuple[float, float, float, float]:
    return tuple(value * scale for value in box)


def separate_components(
    components: list[Component],
    scale: float,
) -> tuple[list[Component], list[Component]]:
    if len(components) != KEY_COMPONENTS + BURST_COMPONENTS:
        raise RuntimeError(
            f"Beklenen 16 alfa bağlı bileşen; {len(components)} bulundu."
        )

    ranked = sorted(components, key=lambda item: item.area, reverse=True)
    keys = ranked[:KEY_COMPONENTS]
    bursts = ranked[KEY_COMPONENTS:]
    if keys[-1].area < bursts[0].area * MIN_SIZE_GAP:
        raise RuntimeError("10 tuş bileşeni ile burst çizgileri alanla net ayrışmıyor.")

    normalized_key_areas = [component.area / (scale * scale) for component in keys]
    normalized_burst_areas = [component.area / (scale * scale) for component in bursts]
    print(f"Alfa bağlı bileşen sayısı: {len(components)}")
    print(
        "Büyük bileşen sayısı: "
        f"{len(keys)}; alan/s²: {min(normalized_key_areas):.1f}–{max(normalized_key_areas):.1f}"
    )
    print(
        "Burst bileşen sayısı: "
        f"{len(bursts)}; alan/s²: {min(normalized_burst_areas):.1f}–{max(normalized_burst_areas):.1f}"
    )

    if any(not 82_000 <= area <= 100_000 for area in normalized_key_areas):
        raise RuntimeError("Tuş bileşeni alanı beklenen yaklaşık 91.000·s² aralığının dışında.")
    if any(not 6_700 <= area <= 8_100 for area in normalized_burst_areas):
        raise RuntimeError("Burst bileşeni alanı beklenen yaklaşık 7.100–7.700·s² aralığının dışında.")

    for kind, selected in (("key", keys), ("burst", bursts)):
        for component in sorted(selected, key=lambda item: (item.top, item.left)):
            normalized_area = component.area / (scale * scale)
            print(f"  {kind} bbox={component.box} area/s²={normalized_area:.1f}")
    return keys, bursts


def order_keycaps(components: list[Component], height: int) -> list[tuple[str, Component]]:
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
    return list(zip(KEY_SPRITE_NAMES, ordered))


def group_bursts(
    components: list[Component],
    scale: float,
) -> dict[str, list[Component]]:
    regions = {
        name: scaled_box(box, scale)
        for name, box in EXPECTED_BURST_GROUPS.items()
    }
    groups = {name: [] for name in regions}
    for component in components:
        nearest = min(
            regions,
            key=lambda name: box_distance(component.box, regions[name]),
        )
        groups[nearest].append(component)

    for name, group in groups.items():
        if len(group) != 3:
            raise RuntimeError(f"{name}: beklenen 3 burst çizgisi, {len(group)} bulundu.")
        group.sort(key=lambda item: (item.top, item.left))
        bounds = (
            min(item.left for item in group),
            min(item.top for item in group),
            max(item.right for item in group),
            max(item.bottom for item in group),
        )
        print(f"{name} bbox={bounds}")
    return groups


def validate_boxes(sprites: list[tuple[str, Component]], scale: float) -> None:
    tolerance = max(6 * scale, 3)
    mismatches = []
    for name, component in sprites:
        expected = scaled_box(EXPECTED_BOXES[name], scale)
        actual = component.box
        if any(
            abs(actual_value - expected_value) > tolerance
            for actual_value, expected_value in zip(actual, expected)
        ):
            mismatches.append(
                f"{name}: actual={actual}, expected={tuple(round(value, 2) for value in expected)}"
            )
    if mismatches:
        raise RuntimeError(
            f"Beklenen bbox'lardan {tolerance:.2f} px'den fazla sapma:\n"
            + "\n".join(mismatches)
        )


def burst_origin(
    component: Component,
    keys: list[tuple[str, Component]],
) -> tuple[str, str]:
    nearest_key, _ = min(
        ((name, key) for name, key in keys),
        key=lambda item: box_distance(component.box, item[1].box),
    )
    key_box = next(key.box for name, key in keys if name == nearest_key)
    corners = (
        (component.left, component.top, "0% 0%"),
        (component.right, component.top, "100% 0%"),
        (component.left, component.bottom, "0% 100%"),
        (component.right, component.bottom, "100% 100%"),
    )

    def point_distance(point: tuple[int, int]) -> float:
        x, y = point
        dx = max(key_box[0] - x, x - key_box[2], 0)
        dy = max(key_box[1] - y, y - key_box[3], 0)
        return (dx * dx + dy * dy) ** 0.5

    _, _, origin = min(corners, key=lambda corner: point_distance(corner[:2]))
    return origin, nearest_key


def validate_source(
    image: Image.Image,
    sprites: list[tuple[str, Component]],
    scale: float,
) -> None:
    expected_ratio = REFERENCE_SIZE[0] / REFERENCE_SIZE[1]
    actual_ratio = image.width / image.height
    if abs(actual_ratio - expected_ratio) >= 0.005:
        raise RuntimeError(
            f"Kaynak oranı {actual_ratio:.6f}, beklenen {expected_ratio:.6f}; tolerans 0.005."
        )
    validate_boxes(sprites, scale)


def write_sprites(
    image: Image.Image,
    pixel_labels: array,
    keys: list[tuple[str, Component]],
    burst_groups: dict[str, list[Component]],
) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    layout = {
        "canvas": {"width": image.width, "height": image.height, "scale": image.width / REFERENCE_SIZE[0]},
        "sprites": [],
    }
    sprites = [(name, component, "key") for name, component in keys]
    for group_name in ("burst-a", "burst-b"):
        for index, component in enumerate(burst_groups[group_name], start=1):
            name = f"{group_name}-{index}"
            sprites.append((name, component, "burst"))

    for name, component, kind in sprites:
        left, top, right, bottom = component.box
        cropped = image.crop(component.box)
        cropped_pixels = cropped.load()
        for y in range(top, bottom):
            for x in range(left, right):
                if pixel_labels[y * image.width + x] != component.label:
                    cropped_pixels[x - left, y - top] = (0, 0, 0, 0)

        filename = f"{name}.png"
        cropped.save(OUTPUT / filename, format="PNG", optimize=True, compress_level=9)
        sprite = {
            "name": name,
            "kind": kind,
            "file": filename,
            "x0": left,
            "y0": top,
            "w": right - left,
            "h": bottom - top,
        }
        if kind == "burst":
            sprite["origin"], sprite["nearestKey"] = burst_origin(component, keys)
        layout["sprites"].append(sprite)

    LAYOUT.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_bytes = sum((OUTPUT / item["file"]).stat().st_size for item in layout["sprites"])
    print(f"PNG toplam boyutu: {total_bytes} bytes")
    print(f"Yazıldı: {OUTPUT}")


def main() -> None:
    if not SOURCE.is_file():
        raise RuntimeError(f"Kaynak dosya bulunamadı: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    scale = image.width / REFERENCE_SIZE[0]
    ratio = image.width / image.height
    expected_ratio = REFERENCE_SIZE[0] / REFERENCE_SIZE[1]
    print(f"Kaynak tuval: {image.width}x{image.height}; s={scale:.8f}; oran={ratio:.8f}")
    if abs(ratio - expected_ratio) >= 0.005:
        raise RuntimeError(
            f"Kaynak oranı {ratio:.6f}, beklenen {expected_ratio:.6f}; tolerans 0.005."
        )

    alpha = image.getchannel("A").tobytes()
    pixel_labels, components = connected_components(alpha, image.width, image.height)
    keycaps, burst_lines = separate_components(components, scale)
    keys = order_keycaps(keycaps, image.height)
    bursts = group_bursts(burst_lines, scale)
    validate_source(image, keys, scale)
    if [name for name, _ in keys] != KEY_SPRITE_NAMES:
        raise RuntimeError("Tuş bileşenleri beklenen sıra ve adlarla eşleşmiyor.")
    actual_burst_names = [
        f"{group_name}-{index}"
        for group_name, group in bursts.items()
        for index, _ in enumerate(group, start=1)
    ]
    if actual_burst_names != BURST_SPRITE_NAMES:
        raise RuntimeError("Burst sprite adları beklenen sırada değil.")
    write_sprites(image, pixel_labels, keys, bursts)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"HATA: {error}") from error
