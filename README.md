# S.js

S.js is a tiny library (2kb gzipped) for performing simple, clean, fast reactive programming in Javascript.

### Simple
- The core of S is just two functions, S() and S.data()
- S follows the *Scheme* school of design: a few simple primitives which can be combined to produce advanced behavior

### Clean
- S's design has been worked and reworked to remove unexpected or surprising corner cases
- S has an extensive test suite containing more code than the library itself

### Fast
- Benchmarks put S 5-100 times faster than most well-known libraries at dispatching updates

## A Quick Taste of S

Here is a tiny example of reactive programming in S, a microscopic 'application' which takes a number, doubles it, and logs the result to the console:

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
Some things to note:
- S has two central primitives, *S.data(&lt;value&gt;)*, which creates what we call a *data signal*, and *S(&lt;paramless function&gt;)*, which creates a *formula*
- *data signals* are getter-setter functions: we fetch their value by calling them directly, *d()*; we set them by passing them a new value, *d(2)*
- When we create a formula, S calls the function and watches to see what signals it references
- When any of those signals change, S re-evaluates the formula, as when *d()* changes above
- formulas can return values (see *f()*), which can be read just like data signals (see *g()*'s call to *f()*)
- formulas may also be created for their side effects (see *g()* which logs to console)
- by default, formulas are *eager*: when a signal changes, S immediately re-evaluates all formulas that reference it

## TodoMVC

Although miniscule, the code fragment above is a tiny MVC application: it has a model (the data signal), a business layer (the formula which doubles it) and a view (print to console).  For a longer example of using S in an MVC style, the below fragment is a minimalist but fully functional version of (what else) the TodoMVC application.  It handles creating, modifying, deleting, filtering and clearing todos:

```javascript
var Model = () => ({
        ToDo: (title, done) => ({
            title: S.data(title),
            done: S.data(done)
        }),
        todos:  S.data([])
    }),
    ViewModel = model => {
        var vm = {
            // filter: null = all, true = done, false = pending
            filter: S.data(null),
            filteredTodos: S(() =>
                model.todos().filter(
                    t => vm.filter() === null
                      || vm.filter() === t.done()
                )
            ),
            newTitle: S.data(""),
            add: () => {
                model.todos.unshift(model.ToDo(vm.newTitle(), false));
                vm.newTitle("");
            },
            remove: todo => model.todos.remove(todo),
            clear: () => {
                var pending = model.todos().filter(t => !t.done());
                model.todos(pending);
            }
        };
        return vm;
    },
    View = vm =>
        <h2>Minimalist TodoMVC App in S.js</h2>
        <input type="text" @signal=vm.newTitle />
        <button type="button" onclick=vm.add()> + </button>
        <ul>
            @vm.filteredTodos().map(todo =>
                <li>
                    <input type="checkbox" @signal=todo.done />
                    <input type="text" @signal=todo.title />
                    <button type="button" onclick=vm.remove(todo)> x </button>
                </li>)
        </ul>
        <div>
            Show <button type="button" onclick=vm.filter(null)>All</button>
            | <button type="button" onclick=vm.filter(true)>Completed</button>
            | <button type="button" onclick=vm.filter(false)>Pending</button>
        </div>
        <button type="button" onclick=vm.clear()>Clear Completed</a>;

var app = View(ViewModel(Model()));

document.body.appendChild(app);
```

More observations:

- Reactive programming allows us to write in a declarative style, which can be very efficient.  Here, the core logic of the application is only ~20 lines of javascript.
- S works particularly well with ES6 arrow functions
- DOM construction is handled with the *htmlliterals* library, which was designed alongside S to work well together
- While both these examples have used an MVC style, S doesn't assume any particular application design patter.  Design is left to the expert, you.

&copy; 2015 Adam Haile, adam.haile@gmail.com.  MIT License.
