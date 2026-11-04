interface User { id: number; name: string }
const u: User = { id: "1", name: 2 };
function f(x) { return x.y }
const unused = 1;
function g(n: number): string { if (n) { return "a"; } }
let t: [number, string] = [1, 2, 3];
class A { private p = 1 } class B extends A { p = 2 }
const m = new Map<string, number>(); m.set(1, "x");
enum E { A, B } const e: E = 5 as string;
export {};
