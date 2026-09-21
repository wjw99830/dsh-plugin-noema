const structured = {
  ts: `class Catalog {
  filter(items: number[]) {
    const accept = (value: number) => value > 0 && value < 100
    return items.filter(value => {
      if (!accept(value)) return false
      return value % 2 === 0
    })
  }
}
function nested(rows: number[][]) {
  for (const row of rows) {
    for (let value of row) {
      if (value > 0) {
        while (value > 1) {
          if (value % 2 === 0) break
          value--
        }
      }
    }
  }
}
function outer(flag: boolean) {
  function inner(value: number) { if (flag && value) return value; return 0 }
  return inner(1)
}
function factorial(n: number): number { if (n <= 1) return 1; return n * factorial(n - 1) }
function even(n: number): boolean { if (n === 0) return true; return odd(n - 1) }
function odd(n: number): boolean { if (n === 0) return false; return even(n - 1) }
`,
  py: `class Catalog:
    def filter(self, items):
        def accept(value):
            return value > 0 and value < 100
        return list(filter(lambda value: accept(value) if value else False, items))

def nested(rows):
    for row in rows:
        for value in row:
            if value > 0:
                while value > 1:
                    if value % 2 == 0:
                        break
                    value -= 1

def outer(flag):
    def inner(value):
        if flag and value:
            return value
        return 0
    return inner(1)

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def even(n):
    if n == 0:
        return True
    return odd(n - 1)

def odd(n):
    if n == 0:
        return False
    return even(n - 1)
`,
  go: `package benchmark

type Catalog struct{}
func (Catalog) Filter(items []int) []int {
  accept := func(value int) bool { return value > 0 && value < 100 }
  result := []int{}
  for _, value := range items {
    if func() bool { if !accept(value) { return false }; return value % 2 == 0 }() {
      result = append(result, value)
    }
  }
  return result
}
func nested(rows [][]int) {
  for _, row := range rows {
    for _, value := range row {
      if value > 0 {
        for value > 1 {
          if value % 2 == 0 { break }
          value--
        }
      }
    }
  }
}
func outer(flag bool) int {
  inner := func(value int) int { if flag && value != 0 { return value }; return 0 }
  return inner(1)
}
func factorial(n int) int { if n <= 1 { return 1 }; return n * factorial(n - 1) }
func even(n int) bool { if n == 0 { return true }; return odd(n - 1) }
func odd(n int) bool { if n == 0 { return false }; return even(n - 1) }
`,
};
structured.tsx = `${structured.ts}
function View({items}: {items: number[]}) {
  function label(value: number) { return value > 10 ? "large" : "small" }
  return <section>{items.length ? items.map(value =>
    <article key={value}>{value > 0 && <span>{label(value)}</span>}</article>
  ) : <p>Empty</p>}</section>
}
`;

const bodies = {
  ts: (index, count) => `function f${index}(xs: number[]) {
  let total = 0
  for (const value of xs) { if (value > 0) total += value }
  return ${index + 1 < count ? `total + f${index + 1}(xs)` : 'total'}
}`,
  tsx: (index) => `function View${index}({items}: {items: number[]}) {
  return <section>{items.length ? items.map(value =>
    <span key={value}>{value > 0 ? value : "empty"}</span>
  ) : <p>Empty</p>}</section>
}`,
  py: (index, count) => `def f${index}(xs):
    total = 0
    for value in xs:
        if value > 0:
            total += value
    return ${index + 1 < count ? `total + f${index + 1}(xs)` : 'total'}
`,
  go: (index, count) => `func f${index}(xs []int) int {
  total := 0
  for _, value := range xs { if value > 0 { total += value } }
  return ${index + 1 < count ? `total + f${index + 1}(xs)` : 'total'}
}`,
};

export const cases = Object.entries(bodies).flatMap(([language, body]) => [
  ...[1, 1000].map((count) => ({
    id: `${language}-${count === 1 ? 'small' : 'large'}`,
    path: `sample.${language}`,
    source: `${language === 'go' ? 'package benchmark\n' : ''}${Array.from({ length: count }, (_, index) => body(index, count)).join('\n')}\n`,
    functions: count,
  })),
  {
    id: `${language}-structured`,
    path: `sample.${language}`,
    source: structured[language],
    functions: language === 'tsx' ? 10 : 8,
  },
]);
