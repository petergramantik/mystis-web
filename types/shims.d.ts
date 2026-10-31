// Náhradní typy pro kontrolu (balíček @types/react tu není k dispozici).
declare module "react" {
  export type ReactNode = any;
  export type CSSProperties = { [k: string]: any };
  export type RefObject<T> = { current: T | null };
  export function useState<T>(v: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(f: () => void | (() => void), deps?: any[]): void;
  export function useLayoutEffect(f: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(v: T | null): RefObject<T>;
  export function useSyncExternalStore<T>(s: (cb: () => void) => () => void, g: () => T): T;
  export type FC = any;
  const React: any;
  export default React;
}
declare namespace React { type RefObject<T> = { current: T | null }; }
declare module "react-dom/client" { export function createRoot(el: Element): { render(n: any): void }; }
declare module "react/jsx-runtime" { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface ElementAttributesProperty {} interface IntrinsicAttributes { key?: any } }
declare module "*.css";
