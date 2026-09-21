def plain():
    return 1

def branch(x):
    if x:
        return 1
    return 0

def nested(x):
    if x > 0:
        while x > 1:
            if x == 2:
                break
            x -= 1
    return x

def outer(x):
    def inner(y):
        if y:
            return 1
        return 0
    return lambda z: z if x else inner(z)

def recurse(n):
    if n <= 0:
        return 0
    return recurse(n - 1)

class Reader:
    def read(self, x):
        if x:
            return 1
        return 0
