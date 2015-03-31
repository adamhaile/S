# S.js

S.js is a tiny library (2kb gzipped) for performing simple, clean, fast reactive programming in Javascript.

### Simple
- The core of S is just two functions, S() and S.data()
- S follows the *Scheme* school of design: a few simple primitives which can be combined to produce advanced behavior

### Clean
- S has been designed to avoid unexpected or surprising corner cases
- S has an extensive and growing behavior-based test suite containing more code than the library itself

### Fast
- Benchmarks put S 5-100 times faster than most well-known libraries at dispatching updates

## A Quick Taste of S

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
- S has two central primitives, `S.data(<value>)`, which creates what is called a *data signal*, and `S(<paramless function>)`, which creates a *formula*.
- *Data signals* are getter-setter functions: we fetch their value by calling them directly &ndash; `d()`; we set them by passing them a new value &ndash; `d(2)`.
- When we create a formula, S calls the function and watches to see what signals it references.
- When any of those signals change, S re-evaluates the formula, as when `d()` changes above.
- Formulas can return values, in which case they may be referenced just like data signals &ndash; see `g()`'s call to `f()`.
- Formulas may also be created for their side effects, like `g()` which logs to console.
- By default, formulas are *eager*: when a signal changes, S immediately re-evaluates all formulas that reference it.

### TodoMVC

For a slightly longer example of using S, the below fragment is a minimalist but fully functional version of &ndash; what else &ndash; a TodoMVC application.  It handles creating, modifying, deleting, filtering and clearing todos:

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

Automatic dependencies are usually what we want: if our formula references a signal, then it must likely depends upon that signal.  However, there are cases where we might want explicit control over when a formula updates.  Perhaps it references several signals but should only re-evaluate when a particular one changes.  Or perhaps there is a signal or two for which we only want the current value and don't care if it changes.

S provides two functions for explicitly controlling dependencies: .on(...) and .peek(...).  Formulas created with the .on(...) prefix modifier will update only when one of the indicated signals changes:

```javascript
var f = S.on(foo).S(function () { return foo() + bar(); });
```

In the above code, `f()` will update only when foo() triggers, even though it references both foo() and bar().  For that matter, it would update when foo() triggered even if its body didn't reference foo() at all.

### Subformulas

One of the core organizational patterns of programming is *composition*: big functions are composed of smaller functions, big objects of smaller objects and so on.  S follows in this trend, in that formulas may create sub-formulas within them that decompose their behavior into smaller pieces.  

Consider, for example, a design in which a single top-level formula defines "the application."  Without the ability to create subformulas, any small change to application state would require rebuilding the entire application and all its data structures. Subformulas avoid this problem by letting us break the application into appropriate pieces of behavior.

&copy; 2015 Adam Haile, adam.haile@gmail.com.  MIT License.
