type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type Paths<T> = T extends object ? { [K in keyof T & string]: K | `${K}.${Paths<T[K]>}` }[keyof T & string] : never;
type Cfg = { a: { b: { c: number }; d: string }; e: boolean };
const p: Paths<Cfg> = "a.b.c";
const bad: Paths<Cfg> = "a.x";
declare function pick<T, K extends keyof T>(o: T, ...k: K[]): Pick<T, K>;
const r = pick({ x: 1, y: "s" }, "x", "z");
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
const i: UnionToIntersection<{ a: 1 } | { b: 2 }> = { a: 1 };
type Fib<N extends number, A extends unknown[] = [], B extends unknown[] = [1]> = A["length"] extends N ? B["length"] : Fib<N, B, [...A, ...B]>;
const f: Fib<10> = 0;
abstract class Base<T> { abstract get(): T } class D extends Base<number> { get() { return "s" } }
const dp: DeepPartial<Cfg> = { a: { b: { c: "no" } } };
satisfiesTest();
function satisfiesTest() { const v = { a: 1 } satisfies { a: string }; return v }
export {};
