export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}
export interface Point {
  x: number;
  y: number;
}
export function clampZoom(zoom: number, min = 0.25, max = 4): number {
  return Math.max(min, Math.min(max, zoom));
}

export function zoomViewport(viewport: Viewport, delta: number): Viewport {
  const factor = delta < 0 ? 1.1 : 0.9;

  return {
    ...viewport,
    zoom: clampZoom(viewport.zoom * factor),
  };
}

export function calculateZoom(
  event: WheelEvent,
  svg: SVGSVGElement,
  zoom: number,
  panX: number,
  panY: number,
): {
  zoom: number;
  panX: number;
  panY: number;
} {
  const point = svg.createSVGPoint();

  point.x = event.clientX;
  point.y = event.clientY;

  const matrix = svg.getScreenCTM();

  if (!matrix) {
    return {
      zoom,
      panX,
      panY,
    };
  }

  const mouse = point.matrixTransform(matrix.inverse());

  const oldZoom = zoom;

  const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;

  const newZoom = Math.max(0.25, Math.min(4, oldZoom * zoomFactor));

  return {
    zoom: newZoom,

    panX: panX - mouse.x * (newZoom - oldZoom),

    panY: panY - mouse.y * (newZoom - oldZoom),
  };
}

export function getSvgPoint(
  event: MouseEvent,
  svg: SVGSVGElement,
  panX: number,
  panY: number,
  zoom: number,
): Point {
  const point = svg.createSVGPoint();

  point.x = event.clientX;
  point.y = event.clientY;

  const matrix = svg.getScreenCTM();

  if (!matrix) {
    return { x: 0, y: 0 };
  }

  const svgPoint = point.matrixTransform(matrix.inverse());

  return {
    x: (svgPoint.x - panX) / zoom,
    y: (svgPoint.y - panY) / zoom,
  };
}
