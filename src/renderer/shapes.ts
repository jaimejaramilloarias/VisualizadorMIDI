import type { ShapeId } from '../core/state/visualConfiguration';

type Context = OffscreenCanvasRenderingContext2D;

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

  context.beginPath();
  if (shape === 'circle') {
    context.ellipse(
      centerX,
      centerY,
      Math.max(0.01, width / 2),
      Math.max(0.01, height / 2),
      0,
      0,
      Math.PI * 2,
    );
  } else if (shape === 'square') {
    context.rect(x, y, width, height);
  } else if (shape === 'roundedSquare') {
    context.roundRect(
      x,
      y,
      width,
      height,
      Math.min(width, height) * 0.25,
    );
  } else if (shape === 'diamond') {
    context.moveTo(centerX, y);
    context.lineTo(x + width, centerY);
    context.lineTo(centerX, y + height);
    context.lineTo(x, centerY);
    context.closePath();
  } else if (shape === 'hexagon') {
    context.moveTo(x + width * 0.25, y);
    context.lineTo(x + width * 0.75, y);
    context.lineTo(x + width, centerY);
    context.lineTo(x + width * 0.75, y + height);
    context.lineTo(x + width * 0.25, y + height);
    context.lineTo(x, centerY);
    context.closePath();
  } else if (shape === 'fourPointStar') {
    context.moveTo(centerX, y);
    context.quadraticCurveTo(
      x + width * 0.53,
      y + height * 0.22,
      x + width * 0.62,
      y + height * 0.38,
    );
    context.quadraticCurveTo(
      x + width * 0.78,
      y + height * 0.47,
      x + width,
      centerY,
    );
    context.quadraticCurveTo(
      x + width * 0.78,
      y + height * 0.53,
      x + width * 0.62,
      y + height * 0.62,
    );
    context.quadraticCurveTo(
      x + width * 0.53,
      y + height * 0.78,
      centerX,
      y + height,
    );
    context.quadraticCurveTo(
      x + width * 0.47,
      y + height * 0.78,
      x + width * 0.38,
      y + height * 0.62,
    );
    context.quadraticCurveTo(
      x + width * 0.22,
      y + height * 0.53,
      x,
      centerY,
    );
    context.quadraticCurveTo(
      x + width * 0.22,
      y + height * 0.47,
      x + width * 0.38,
      y + height * 0.38,
    );
    context.quadraticCurveTo(
      x + width * 0.47,
      y + height * 0.22,
      centerX,
      y,
    );
    context.closePath();
  } else if (shape === 'sixPointStar') {
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
  _secondaryColor: string,
): void => {
  traceShape(context, shape, x, y, width, height);
  context.fillStyle = primaryColor;
  context.fill();
};
