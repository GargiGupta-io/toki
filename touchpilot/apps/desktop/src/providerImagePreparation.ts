export const PROVIDER_IMAGE_MAX_EDGE = 1536;
export const PROVIDER_IMAGE_JPEG_QUALITY = 0.9;
export const PROVIDER_IMAGE_PASSTHROUGH_BYTE_LIMIT = 2_000_000;

type ImageFormat = "png" | "jpeg";
export type ProviderImageStrategy =
  | "passthrough"
  | "crop"
  | "resize"
  | "crop_resize"
  | "reencode";

export type ProviderImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProviderImagePreparationInput = {
  imageWidth: number;
  imageHeight: number;
  format: ImageFormat;
  byteLength: number;
  crop?: ProviderImageRegion | null;
};

export type ProviderImagePreparationPlan = {
  strategy: ProviderImageStrategy;
  shouldRender: boolean;
  sourceGeometry: {
    imageWidth: number;
    imageHeight: number;
    format: ImageFormat;
    region: ProviderImageRegion;
  };
  output: {
    imageWidth: number;
    imageHeight: number;
    format: ImageFormat;
  };
  preprocessing: {
    strategy: ProviderImageStrategy;
    scaleX: number;
    scaleY: number;
    maxEdge: number;
    jpegQuality?: number;
  };
};

function assertPositiveFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function assertValidRegion(
  region: ProviderImageRegion,
  imageWidth: number,
  imageHeight: number,
) {
  if (
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    region.x < 0 ||
    region.y < 0
  ) {
    throw new Error("provider image source region origin is invalid");
  }

  assertPositiveFinite("provider image source region width", region.width);
  assertPositiveFinite("provider image source region height", region.height);

  if (region.x + region.width > imageWidth || region.y + region.height > imageHeight) {
    throw new Error("provider image source region exceeds the screenshot bounds");
  }
}

export function createProviderImagePreparationPlan(
  input: ProviderImagePreparationInput,
): ProviderImagePreparationPlan {
  assertPositiveFinite("screenshot width", input.imageWidth);
  assertPositiveFinite("screenshot height", input.imageHeight);

  if (!Number.isFinite(input.byteLength) || input.byteLength < 0) {
    throw new Error("screenshot byte length must be a non-negative finite number");
  }

  const sourceRegion = input.crop ?? {
    x: 0,
    y: 0,
    width: input.imageWidth,
    height: input.imageHeight,
  };
  assertValidRegion(sourceRegion, input.imageWidth, input.imageHeight);

  const hasCrop = input.crop != null;
  const longestEdge = Math.max(sourceRegion.width, sourceRegion.height);
  const scale = Math.min(1, PROVIDER_IMAGE_MAX_EDGE / longestEdge);
  const imageWidth = Math.max(1, Math.round(sourceRegion.width * scale));
  const imageHeight = Math.max(1, Math.round(sourceRegion.height * scale));
  const hasResize = imageWidth !== sourceRegion.width || imageHeight !== sourceRegion.height;
  const needsReencode =
    !hasCrop && !hasResize && input.byteLength > PROVIDER_IMAGE_PASSTHROUGH_BYTE_LIMIT;
  const strategy = hasCrop
    ? hasResize
      ? "crop_resize"
      : "crop"
    : hasResize
      ? "resize"
      : needsReencode
        ? "reencode"
        : "passthrough";
  const shouldRender = strategy !== "passthrough";

  return {
    strategy,
    shouldRender,
    sourceGeometry: {
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      format: input.format,
      region: { ...sourceRegion },
    },
    output: {
      imageWidth,
      imageHeight,
      format: shouldRender ? "jpeg" : input.format,
    },
    preprocessing: {
      strategy,
      scaleX: imageWidth / sourceRegion.width,
      scaleY: imageHeight / sourceRegion.height,
      maxEdge: PROVIDER_IMAGE_MAX_EDGE,
      ...(shouldRender ? { jpegQuality: PROVIDER_IMAGE_JPEG_QUALITY } : {}),
    },
  };
}
