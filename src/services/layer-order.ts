export function layerDropPosition(pointerY: number, top: number, height: number): "before" | "after" {
  return pointerY <= top + height / 2 ? "before" : "after";
}
