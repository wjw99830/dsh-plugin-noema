package fixture

func Plain() int { return 1 }
func Branch(x bool) int {
 if x { return 1 }
 return 0
}
func Nested(x int) int {
 if x > 0 {
  for x > 1 {
   if x == 2 { break }
   x--
  }
 }
 return x
}
func Outer(x bool) int {
 inner := func(y bool) int { if y { return 1 }; return 0 }
 if x { return inner(x) }
 return 0
}
func Recurse(n int) int {
 if n <= 0 { return 0 }
 return Recurse(n - 1)
}
func Shadow(Shadow func() int) int { return Shadow() }
type Reader struct{}
func (r *Reader) Read(x bool) int { if x { return 1 }; return 0 }
var Choose = func(x bool) int { if x { return 1 }; return 0 }
