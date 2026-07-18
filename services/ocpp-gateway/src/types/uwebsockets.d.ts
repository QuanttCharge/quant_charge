/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'uWebSockets.js' {
  export interface HttpRequest {
    getUrl(): string;
    getHeader(key: string): string;
  }

  export interface HttpResponse {
    writeStatus(status: string): HttpResponse;
    end(body?: string): void;
    upgrade(
      userData: unknown,
      secKey: string,
      secProtocol: string,
      secExtensions: string,
      context: unknown,
    ): void;
  }

  export interface WebSocket<T = unknown> {
    getUserData(): T;
    send(message: string | ArrayBuffer, isBinary?: boolean): number;
    end(code?: number, shortMessage?: string): void;
  }

  export interface WebSocketBehavior<T = unknown> {
    compression?: number;
    maxPayloadLength?: number;
    idleTimeout?: number;
    upgrade?: (res: HttpResponse, req: HttpRequest, context: unknown) => void;
    open?: (ws: WebSocket<T>) => void;
    message?: (ws: WebSocket<T>, message: ArrayBuffer, isBinary: boolean) => void;
    close?: (ws: WebSocket<T>, code?: number, message?: ArrayBuffer) => void;
  }

  export interface TemplatedApp {
    ws<T>(pattern: string, behavior: WebSocketBehavior<T>): TemplatedApp;
    get(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp;
    listen(port: number, cb: (listenSocket: unknown) => void): TemplatedApp;
  }

  export const SHARED_COMPRESSOR: number;
  export function App(): TemplatedApp;

  const uWS: {
    App: typeof App;
    SHARED_COMPRESSOR: number;
  };

  export default uWS;
}

declare namespace uWS {
  type HttpRequest = import('uWebSockets.js').HttpRequest;
  type HttpResponse = import('uWebSockets.js').HttpResponse;
  type WebSocket<T = unknown> = import('uWebSockets.js').WebSocket<T>;
  type TemplatedApp = import('uWebSockets.js').TemplatedApp;
}
