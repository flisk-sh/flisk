function log<This, Args extends any[], Ret>(t: (this: This, ...a: Args) => Ret, c: ClassMethodDecoratorContext<This, (this: This, ...a: Args) => Ret>) {
  return function (this: This, ...a: Args): Ret { console.log(String(c.name)); return t.call(this, ...a); };
}
export class C { @log hi(n: number) { return n + 1; } @log bad(s: string) { return s; } }
new C().hi("x");
