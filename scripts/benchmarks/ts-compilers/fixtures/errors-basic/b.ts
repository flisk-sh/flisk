import { nope } from "./a";
import missing from "./does-not-exist";
type R = Readonly<{ a: number }>; const r: R = { a: 1 }; r.a = 2;
async function h() { const x: number = await Promise.resolve("s"); return x }
const arr = [1, 2, 3] as const; arr.push(4);
label: for (;;) { break nolabel; }
export {};
