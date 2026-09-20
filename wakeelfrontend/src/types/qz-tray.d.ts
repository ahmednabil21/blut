declare module 'qz-tray' {
  type PixelPrintData = {
    type: 'pixel';
    format: 'html' | 'image' | 'pdf';
    flavor: 'plain' | 'base64' | 'file';
    data: string;
    options?: {
      pageWidth?: number;
      pageHeight?: number;
      scaleContent?: boolean;
    };
  };

  type PrintConfigOptions = {
    size?: { width: number; height: number } | null;
    units?: 'in' | 'cm' | 'mm';
    margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
    scaleContent?: boolean;
    rasterize?: boolean;
    interpolation?: string;
    colorType?: string;
    copies?: number;
    jobName?: string;
  };

  type PrintConfig = unknown;

  interface QzApi {
    websocket: {
      isActive: () => boolean;
      connect: (options?: Record<string, unknown>) => Promise<void>;
      disconnect: () => Promise<void>;
    };
    printers: {
      find: (query?: string) => Promise<string | string[]>;
      getDefault: () => Promise<string>;
    };
    configs: {
      create: (printer: string, options?: PrintConfigOptions) => PrintConfig;
    };
    print: (config: PrintConfig, data: PixelPrintData[]) => Promise<void>;
    security: {
      setCertificatePromise: (
        handler: (resolve: (cert: string) => void, reject: (err?: unknown) => void) => void
      ) => void;
      setSignatureAlgorithm: (algorithm: string) => void;
      setSignaturePromise: (
        factory: (
          toSign: string
        ) => (resolve: (signature: string) => void, reject: (err?: unknown) => void) => void
      ) => void;
    };
  }

  const qz: QzApi;
  export default qz;
}
