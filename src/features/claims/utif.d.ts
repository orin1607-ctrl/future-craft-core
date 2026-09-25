declare module 'utif' {
  type TiffImage = { width: number; height: number; t256?: number[]; t257?: number[] };
  const tiff: {
    decode(buffer: ArrayBuffer): TiffImage[];
    decodeImage(buffer: ArrayBuffer, image: TiffImage): void;
    toRGBA8(image: TiffImage): Uint8Array;
  };
  export default tiff;
}
