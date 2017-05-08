export interface S {
    root<T>(fn: (dispose?: () => void) => T): T;
    <T>(fn: () => T): () => T;
    <T>(fn: (v: T) => T, seed: T): () => T;
    on<T>(ev: () => any, fn: () => T): () => T;
    on<T>(ev: () => any, fn: (v: T) => T, seed: T, onchanges?: boolean): () => T;
    data<T>(value: T): S.DataSignal<T>;
    value<T>(value: T, eq?: (a: T, b: T) => boolean): S.DataSignal<T>;
    freeze<T>(fn: () => T): T;
    sample<T>(fn: () => T): T;
    cleanup(fn: (final: boolean) => any): void;
    subclock(): <T>(fn: () => T) => T;
    subclock<T>(fn: () => T): T;
}
export declare namespace S {
    interface DataSignal<T> {
        (): T;
        (val: T): T;
    }
}
declare const S: S;
export default S;
