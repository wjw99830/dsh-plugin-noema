export function plain(): number { return 1 }
export function branch(x: boolean): number {
  if (x) return 1
  return 0
}
export function nested(x: number): number {
  if (x > 0) {
    while (x > 1) {
      if (x === 2) break
      x--
    }
  }
  return x
}
export const arrow = (x: boolean): number => x ? 1 : 0
export function outer(x: boolean): number {
  function inner(y: boolean): number { if (y) return 1; return 0 }
  if (x) return inner(x)
  return 0
}
export function recurse(n: number): number {
  if (n <= 0) return 0
  return recurse(n - 1)
}
export class Reader {
  read(x: boolean): number { if (x) return 1; return 0 }
}
export const first = () => 1; export const second = (x: boolean) => x ? 2 : 3
