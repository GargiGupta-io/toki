export type CoordinateSize = {
  width: number;
  height: number;
};

export type CoordinateRect = CoordinateSize & {
  x: number;
  y: number;
};

export type ProviderTargetCoordinates = {
  x?: number;
  y?: number;
  centerX?: number;
  centerY?: number;
  width?: number;
  height?: number;
};

export type CoordinateTransformContext = {
  display: CoordinateSize;
  screenshot: CoordinateSize;
  providerImage: CoordinateSize;
  crop?: CoordinateRect | null;
};

export type ProviderTargetMapping = {
  coordinateMode: "center" | "top_left";
  providerRect: CoordinateRect;
  screenshotRect: CoordinateRect;
  displayRect: CoordinateRect;
  scale: {
    imageToScreenshotX: number;
    imageToScreenshotY: number;
    screenshotToDisplayX: number;
    screenshotToDisplayY: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function assertPositiveSize(name: string, size: CoordinateSize) {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(`${name} dimensions must be positive finite numbers`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function intersectRects(first: CoordinateRect, second: CoordinateRect) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * A rectangle in display points, expressed in screenshot pixels.
 *
 * Exported because watching a target region for change needs the same
 * mapping as cropping one, and two copies of a scale factor is how they
 * come to disagree.
 */
export function displayRectToScreenshotRect(
  rect: CoordinateRect,
  display: CoordinateSize,
  screenshot: CoordinateSize,
) {
  assertPositiveSize("display", display);
  assertPositiveSize("screenshot", screenshot);

  const scaleX = screenshot.width / display.width;
  const scaleY = screenshot.height / display.height;

  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

export function createScreenshotCropFromDisplayRect(
  rect: CoordinateRect,
  display: CoordinateSize,
  screenshot: CoordinateSize,
  minimumSize = 120,
): CoordinateRect | null {
  const mapped = displayRectToScreenshotRect(rect, display, screenshot);
  const x = Math.round(clamp(mapped.x, 0, screenshot.width - 1));
  const y = Math.round(clamp(mapped.y, 0, screenshot.height - 1));
  const right = Math.round(
    clamp(mapped.x + mapped.width, x + 1, screenshot.width),
  );
  const bottom = Math.round(
    clamp(mapped.y + mapped.height, y + 1, screenshot.height),
  );
  const width = right - x;
  const height = bottom - y;

  if (width < minimumSize || height < minimumSize) {
    return null;
  }

  return { x, y, width, height };
}

export function mapDisplayRectToProviderImage(
  rect: CoordinateRect,
  context: CoordinateTransformContext,
): CoordinateRect | null {
  assertPositiveSize("provider image", context.providerImage);
  const screenshotRect = displayRectToScreenshotRect(
    rect,
    context.display,
    context.screenshot,
  );
  const sourceBounds = context.crop ?? {
    x: 0,
    y: 0,
    width: context.screenshot.width,
    height: context.screenshot.height,
  };
  const visibleRect = intersectRects(screenshotRect, sourceBounds);

  if (visibleRect == null) {
    return null;
  }

  const scaleX = context.providerImage.width / sourceBounds.width;
  const scaleY = context.providerImage.height / sourceBounds.height;
  const left = Math.round(
    clamp((visibleRect.x - sourceBounds.x) * scaleX, 0, context.providerImage.width - 1),
  );
  const top = Math.round(
    clamp((visibleRect.y - sourceBounds.y) * scaleY, 0, context.providerImage.height - 1),
  );
  const right = Math.round(
    clamp(
      (visibleRect.x + visibleRect.width - sourceBounds.x) * scaleX,
      left + 1,
      context.providerImage.width,
    ),
  );
  const bottom = Math.round(
    clamp(
      (visibleRect.y + visibleRect.height - sourceBounds.y) * scaleY,
      top + 1,
      context.providerImage.height,
    ),
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function mapProviderTargetToDisplay(
  target: ProviderTargetCoordinates,
  context: CoordinateTransformContext,
  options: {
    defaultTargetSize?: number;
    minimumDisplayTargetSize?: number;
  } = {},
): ProviderTargetMapping {
  assertPositiveSize("display", context.display);
  assertPositiveSize("screenshot", context.screenshot);
  assertPositiveSize("provider image", context.providerImage);

  const defaultTargetSize = options.defaultTargetSize ?? 44;
  const minimumDisplayTargetSize = options.minimumDisplayTargetSize ?? 16;
  const rawWidth = isFiniteNumber(target.width) ? target.width : defaultTargetSize;
  const rawHeight = isFiniteNumber(target.height) ? target.height : defaultTargetSize;

  if (rawWidth <= 0 || rawHeight <= 0) {
    throw new Error("vision model target size is invalid");
  }

  const hasCenterCoordinates =
    isFiniteNumber(target.centerX) && isFiniteNumber(target.centerY);
  const hasTopLeftCoordinates = isFiniteNumber(target.x) && isFiniteNumber(target.y);

  if (!hasCenterCoordinates && !hasTopLeftCoordinates) {
    throw new Error("vision model target coordinates are missing");
  }

  const coordinateMode = hasCenterCoordinates ? "center" : "top_left";
  const targetCenterX: number = hasCenterCoordinates
    ? (target.centerX as number)
    : (target.x as number) + rawWidth / 2;
  const targetCenterY: number = hasCenterCoordinates
    ? (target.centerY as number)
    : (target.y as number) + rawHeight / 2;
  const targetLeft = targetCenterX - rawWidth / 2;
  const targetTop = targetCenterY - rawHeight / 2;

  if (
    targetLeft < 0 ||
    targetTop < 0 ||
    targetLeft + rawWidth > context.providerImage.width ||
    targetTop + rawHeight > context.providerImage.height
  ) {
    throw new Error(
      `vision model target is outside the provided image (${Math.round(targetLeft)}, ${Math.round(
        targetTop,
      )}, ${Math.round(rawWidth)} x ${Math.round(rawHeight)} for ${
        context.providerImage.width
      } x ${context.providerImage.height})`,
    );
  }

  const sourceBounds = context.crop ?? {
    x: 0,
    y: 0,
    width: context.screenshot.width,
    height: context.screenshot.height,
  };
  const imageToScreenshotScaleX = sourceBounds.width / context.providerImage.width;
  const imageToScreenshotScaleY = sourceBounds.height / context.providerImage.height;
  const screenshotToDisplayScaleX = context.display.width / context.screenshot.width;
  const screenshotToDisplayScaleY = context.display.height / context.screenshot.height;
  const screenshotCenterX =
    sourceBounds.x + targetCenterX * imageToScreenshotScaleX;
  const screenshotCenterY =
    sourceBounds.y + targetCenterY * imageToScreenshotScaleY;
  const screenshotWidth = rawWidth * imageToScreenshotScaleX;
  const screenshotHeight = rawHeight * imageToScreenshotScaleY;
  const width = Math.round(
    clamp(
      screenshotWidth * screenshotToDisplayScaleX,
      minimumDisplayTargetSize,
      context.display.width,
    ),
  );
  const height = Math.round(
    clamp(
      screenshotHeight * screenshotToDisplayScaleY,
      minimumDisplayTargetSize,
      context.display.height,
    ),
  );
  const x = Math.round(
    clamp(
      screenshotCenterX * screenshotToDisplayScaleX - width / 2,
      0,
      context.display.width - width,
    ),
  );
  const y = Math.round(
    clamp(
      screenshotCenterY * screenshotToDisplayScaleY - height / 2,
      0,
      context.display.height - height,
    ),
  );

  return {
    coordinateMode,
    providerRect: {
      x: targetLeft,
      y: targetTop,
      width: rawWidth,
      height: rawHeight,
    },
    screenshotRect: {
      x: screenshotCenterX - screenshotWidth / 2,
      y: screenshotCenterY - screenshotHeight / 2,
      width: screenshotWidth,
      height: screenshotHeight,
    },
    displayRect: { x, y, width, height },
    scale: {
      imageToScreenshotX: imageToScreenshotScaleX,
      imageToScreenshotY: imageToScreenshotScaleY,
      screenshotToDisplayX: screenshotToDisplayScaleX,
      screenshotToDisplayY: screenshotToDisplayScaleY,
    },
  };
}
