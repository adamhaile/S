# S.js

S.js is a tiny library (2kb gzipped) for performing simple, clean, fast reactive programming in Javascript.

### Simple
- The core of S is just two functions, S() and S.data()
- S is inspired by the *Scheme* school of design: a few simple primitives which can be combined to produce advanced behavior

### Clean
- S seeks to avoid unexpected or surprising corner cases
- S has an extensive and growing behavior-based test suite

### Fast
- Benchmarks put S 5-100 times faster than most well-known libraries at dispatching updates

S.js takes its name from *signal*, a reactive term for a value that changes over time.  In S there are two kinds of signals, *data signals* and *formulas*.  *Data signals* are the leaves in the depenency tree: they're where data (and change) enter the system.  *Formulas* perform computations on signals, generating useful side-effects and/or derived values.  When a data signal changes, S propagates that to the formulas which reference it, then to the upstream formulas which reference those formulas, and so on, until the system has finished reacting to the change.  In this way, an S application implements its behavior by creating and maintaining a tree of signals.  

## A Quick Inductive Example

Let's start with the following simple piece of code:

```javascript
var a = 1,
    b = a * 2;
console.log(b);
>>> 2
```
Plain enough: take a number, double it, and log it.

Now suppose that this code becomes part of a larger application, and as that application runs, it's going to change the value of `a`.  We want to keep our log up-to-date, so we'll wrap the doubling and logging steps as functions:

```javascript
var a = 1,
    b = () => a * 2,
    c = () => console.log(b());
c();
>>> 2
```

Now whenever `a` changes, we just call `c()` and the log will be updated:

```javascript
a = 2;
c();
>>> 4
a = 3;
c();
>>> 6
```

This works, but it also creates a new problem: we have to remember to call `c()` each time we change `a`, or we'll miss a log entry.  If our code is complicated, or if there are multiple people working on it, this may be hard to enforce.

This is the kind of problem S solves.  Let's wrap our code in S's primitives:

```javascript
var a = S.data(1),
    b = S(() => a() * 2),
    c = S(() => console.log(b()));
>>> 2
```

Note that we didn't have to call `c()` to perform the first log, S did it for us.  Nor do we need to call it as `a` changes:

```javascript
a(2)
>>> 4
a(3)
>>> 6
```

Whenever `a` changes, we can call `c()` to double and log it.

But what if we want this to happen *every time* a changes? We'll have to audit our code and insert calls to `c()` everywhere a is modified.  If this code is being maintained by multiple people, we'll have to make sure that everybody knows about the new rule to call c() whenever a changes.

## A Simple Inductive Example

Here is a small example of reactive programming in S, a tiny 'application' which takes a number, doubles it, and logs the result to the console:

```javascript
// create a data signal and two formulas
var d = S.data(1),
    f = S(function () { return d() * 2; }),
    g = S(function () { console.log("f is now " + f()); });
>> "f is now 2"
// update the data signal, thereby re-triggering the formulas
d(2)
>> "f is now 4"
```
As small as it is, this snippet demonstrates several characteristics of S:
- S has two core primitives: `S.data(<value>)`, the constructor for a data signal, and `S(<paramless function>)`, the constructor for a formula.
- Data signals are getter-setter functions: we fetch their value by calling them directly `d()`; we set them by passing them a new value `d(2)`.
- When we create a formula, S invokes the function and watches to see what signals it references.
- When any of those signals change, S re-evaluates the formula, as when `d()` changes above.
- Formulas can return values, in which case they may be referenced just like data signals &ndash; see `g()`'s call to `f()`.
- Formulas may also be created for their side effects, like `g()` which logs to console.
- By default, formulas are *eager*: when a signal changes, S immediately re-evaluates all formulas that reference it.

## TodoMVC with S.js and friends, plus ES6

For a longer example, the below code is a minimalist but fully functional version of &ndash; what else &ndash; TodoMVC.  It handles creating, modifying, deleting, filtering and clearing todos.  S.js provides just the core reactive primitives, so to create an entire HTML application, we need help from a few other companion libraries.  This example uses the suite Surplus.js, aka "S plus" some friends.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array utility for a data signal carrying an array.  This example also uses ES6's fat-arrow functions to demonstrate how well they works with S.js.

```javascript
var // define our ToDo class ...
    ToDo = opts => ({
        title: S.data(opts.title || ''),
        done: S.data(opts.done || false)
    }),
    // ... and our collection of ToDos
    todos = S.array([]),
    // define our viewmodel: you can filter, add and remove ToDos
    vm = {
        filter: S.data(null), // null=all, true=done, false=pending
        filtered: todos.filter(t => vm.filter() === null
                                 || vm.filter() === t.done()),
        newTitle: S.data(""),
        add: () => {
            todos.unshift(ToDo({ title: vm.newTitle() }));
            vm.newTitle("");
        },
        remove: todo => todos.remove(todo)
    },
    // finally, define our view, using HtmlLiterals
    view =
        <h3>Minimalist TodoMVC App in S.js</h3>
        <input type="text" @data:keyup = vm.newTitle
            @onkey:enter => vm.add()
            @onkey:esc => vm.newTitle('')/>
        <a onclick => vm.add()>+</a>
        @vm.filtered().map(todo =>
            <div>
                <input type="checkbox" @data = todo.done />
                <input type="text" @data = todo.title />
                <a onclick => vm.remove(todo)>&times;</a>
            </div>)
        <div>
            show <a onclick => vm.filter(null)>all</a>
            | <a onclick => vm.filter(true)>done</a>
            | <a onclick => vm.filter(false)>pending</a>
        </div>;

// add our view to the page
document.body.appendChild(view);
```

More observations:

- Reactive programming allows us to write in a declarative style, which can be very efficient.  Here, the core logic of the application is only ~20 lines of javascript.
- S works particularly well with ES6 arrow functions
- DOM construction is handled with the *htmlliterals* library, which was designed alongside S to work well together
- While both these examples have used an MVC style, S doesn't assume any particular application design patter.  Design is left to the expert, you.

```javascript
var stored = localStorage.getItem('minimalist-todos');
if (stored) todos(JSON.parse(stored).map(t => Todo(t.title, t.done)));
S(() => localStorage.setItem('minimalist-todos',
    JSON.stringify(todos())));
```

### Dependencies

By default, **dependencies in S are automatic and dynamic**: we don't need to explicitly subscribe to signals, S watches our function's evaluation and does it for us.  Furthermore, only the dependencies from the most recent evaluation of a formula are active.

```javascript
var a = S.data("a"),
    b = S.data("b"),
    f = S(function () { console.log(a() || b()); });
>>> "a"
a("a 2") // f() depends on a(), so triggering a() re-evaluates f()
>>> "a 2"
b("b 2") // but f() doesn't depend on b(), since it never called b()

a(false) // now force f() to call and log b()
>>> "b 2"
b("b 3") // now b() is a dependency and updates f()
>>> "b 3"

a("a 3") // now turn the dependency on b() back off
>>> "a 3"
b("b 4") // b() no longer triggers f()
```

Automatic dependencies are usually what we want: if our formula references a signal, then it most likely depends upon that signal.  However, there are cases where we might want explicit control over when a formula updates.  Perhaps it references several signals but should only re-evaluate when a particular one changes.  Or perhaps there is a signal or two for which we only want the current value and don't care if it changes.

S provides two functions for explicitly controlling dependencies: S.on(...) and S.peek(...).  Formulas created with the .on(...) prefix modifier will update only when one of the indicated signals changes:

```javascript
var f = S.on(foo).S(function () { return foo() + bar(); });
```

In the above code, `f()` will update only when foo() triggers, even though it references both foo() and bar().  For that matter, it would update when foo() triggered even if its body didn't reference foo() at all.

### Subformulas

One of the core organizational patterns of programming is *composition*: big functions are composed of smaller functions, big objects of smaller objects and so on.  S follows in this trend, in that formulas may create sub-formulas within them that decompose their behavior into smaller pieces.  

Consider, for example, a design in which a single top-level formula defines "the application."  Without the ability to create subformulas, any small change to application state would require rebuilding the entire application and all its data structures. Subformulas avoid this problem by letting us break the application into appropriate pieces of behavior.

&copy; 2015 Adam Haile, adam.haile@gmail.com.  MIT License.
