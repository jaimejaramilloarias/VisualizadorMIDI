import type { ShapeId } from '../core/state/visualConfiguration';

type Context = OffscreenCanvasRenderingContext2D;

const scaledFrame = (
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
) => ({
  x: x + (width * (1 - scale)) / 2,
  y: y + (height * (1 - scale)) / 2,
  width: width * scale,
  height: height * scale,
});

const traceShape = (
  context: Context,
  shape: ShapeId,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const singleShape = shape.replace(/Double$/, '') as ShapeId;

  context.beginPath();
  if (singleShape === 'circle') {
    context.ellipse(
      centerX,
      centerY,
      Math.max(0.01, width / 2),
      Math.max(0.01, height / 2),
      0,
      0,
      Math.PI * 2,
    );
  } else if (singleShape === 'square') {
    context.rect(x, y, width, height);
  } else if (singleShape === 'roundedSquare') {
    context.roundRect(
      x,
      y,
      width,
      height,
      Math.min(width, height) * 0.25,
    );
  } else if (singleShape === 'diamond') {
    context.moveTo(centerX, y);
    context.lineTo(x + width, centerY);
    context.lineTo(centerX, y + height);
    context.lineTo(x, centerY);
    context.closePath();
  } else if (singleShape === 'hexagon') {
    context.moveTo(x + width * 0.25, y);
    context.lineTo(x + width * 0.75, y);
    context.lineTo(x + width, centerY);
    context.lineTo(x + width * 0.75, y + height);
    context.lineTo(x + width * 0.25, y + height);
    context.lineTo(x, centerY);
    context.closePath();
  } else if (singleShape === 'fourPointStar') {
    context.moveTo(centerX, y);
    context.lineTo(x + width * 0.62, y + height * 0.38);
    context.lineTo(x + width, centerY);
    context.lineTo(x + width * 0.62, y + height * 0.62);
    context.lineTo(centerX, y + height);
    context.lineTo(x + width * 0.38, y + height * 0.62);
    context.lineTo(x, centerY);
    context.lineTo(x + width * 0.38, y + height * 0.38);
    context.closePath();
  } else if (singleShape === 'sixPointStar') {
    for (let point = 0; point < 12; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 6;
      const radius =
        (point % 2 === 0 ? 0.5 : 0.23) * Math.min(width, height);
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      if (point === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  } else {
    context.moveTo(centerX, y);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.closePath();
  }
};

export const drawNoteShape = (
  context: Context,
  shape: ShapeId,
  x: number,
  y: number,
  width: number,
  height: number,
  primaryColor: string,
  secondaryColor: string,
): void => {
  const isDouble = shape.endsWith('Double');
  const layers = isDouble
    ? [
        { scale: 1, color: primaryColor },
        { scale: 0.72, color: secondaryColor },
        { scale: 0.414, color: primaryColor },
      ]
    : [{ scale: 1, color: primaryColor }];

  layers.forEach((layer) => {
    const frame = scaledFrame(x, y, width, height, layer.scale);
    traceShape(
      context,
      shape,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
    );
    context.fillStyle = layer.color;
    context.fill();
  });
};

export const strokeNoteShape = (
  context: Context,
  shape: ShapeId,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  traceShape(context, shape, x, y, width, height);
  context.stroke();
};
