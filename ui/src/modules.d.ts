/** Ambient module declarations for packages without type definitions. */

declare module 'crypto-browserify' {
  const cryptoBrowserify: Record<string, any>;
  export default cryptoBrowserify;
}

declare module 'jszip' {
  class JSZip {
    file(name: string, data: string | Uint8Array | ArrayBuffer | Blob): this;
    generateAsync(options: { type: string }): Promise<Blob>;
  }
  export default JSZip;
}
