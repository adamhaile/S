# S.js

S.js is a tiny library for performing **simple, clean, fast reactive programming** in Javascript.  It takes its name from **signal**, a reactive term for a value that changes over time.

In plain terms, S helps you **keep things up-to-date** in your Javascript program.  The cost is that the functions being kept up to date and the data that's changing must be wrapped in S's lightweight closures.

S is useful for any project that can be described in terms of keeping something up-to-date: web frameworks keep the DOM up to date with the data, client-side routers keep the application state up to date with the url, and so on.

S maintains a couple useful properties while it runs: **automatic dependency management** and the **consistency of time**.  The first of these means that you don't generally need to worry about subscribing or unsubscribing to change events, S handles that for you.  The second means that your updates run in a predictable way, with no gaps, glitches or repeats.

S is a personal research project.  It represents my own take on the most useful "mix" of reactive concepts floating around the web today.  I welcome feedback.

## How do you use S?
There are only two main steps to using S:

1. Wrap the data that will be changing in S **data signals**: `S.data(<value>)`
2. Wrap the things you want to keep up-to-date in S **computations**: `S(() => <code>)`

Both constructors return closures (aka functions).  You can read the current value by calling it &ndash; `signal()`.  For data signals, you can also set the value by passing in a new one &ndash; `signal(<new value>)`.

That's largely it.  S tries to have a simple mental model -- it's just data and computations on data.  

If you want more control over how updates run, S provides a handful of additional functions:

- `S.event(() => <code>)` - treat all data changes produced by the code as a single event, such that they propagate to computations as a unit rather than one-at-a-time

- `S.on(...signals).S(() => <code>)` - declare a static list of dependencies for a computation, as an alternative to S's live monitoring

- `S.async(<scheduler>).S(() => <code>)` - control when and how often a computation is updated

See the documentation below for full explanations of these functions.

There are also some things you *don't* have to do when using S:

- You don't need to construct your application a particular way.  S is a library, not a framework, and it leaves the big picture design up to you.  S can be used with a variety of patterns: MV*, Flux, FRP etc.

- You don't need to use S for your whole application.  Use it as narrowly or extensively as you like.

## How does S work?
As your program runs, S's data signals and computations communicate with each other to build up a live dependency graph of your code.  Since computations may reference the results of other computations, this graph may have _n_ layers, not just two.  

When a data signal changes, S uses this graph to determine which computations need to be updated and in what order.  Specifically, S runs updates in topological order, as this has several useful qualities:

- each affected computation is run exactly once, no matter how many paths converge on it
- if a computation references other computations, S insures those other computations have been updated first, so that the consuming computation sees a consistent world, where all its sources are already up-to-date

If computations modify data signals as part of their execution, S batches all these changes into a single event, which runs after the current propagation finishes.  S repeats this process until the system has reached equilibrium and no more changes are produced.

## A Tiny Example: "Hello World"
```javascript
> var name = S.data("S.js"),
      hello = S(() => "hello " + name()),
      print = S(() => console.log(hello()));
hello S.js
> name("world")
hello world
```
As small as it is, this snippet demonstrates several characteristics of S:
- `name()` is a data signal, which starts out holding "S.js"
- `hello()` and `print()` are computations
- we can read a data signal by calling it, like when `hello()` calls `name()`
- we can read the value returned by a computation the same way, like when `print()` calls `hello()`
- S evaluates each computation at its time of creation; note that `print()` logs to console when it is defined
- whenever S runs a computation, it updates an internal registry of the sources read by the computation
- whenever one of those sources changes, like `name("world")`, S runs all computations affected
- these computations are run in dependency order, so `hello()` has already been updated to "hello world" before `print()` logs it to console
- we can use computations both to create derived value (`hello()`) or to generate useful side-effects (`print()`)

## A Little Longer Example: TodoMVC in S (plus friends)
What else, right?  This example uses the suite Surplus.js, aka "S plus" some companion libraries.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array utility for a data signal carrying an array.
```javascript
var Todo = t => ({               // our Todo model
        title: S.data(t.title),  // props are data signals
        done: S.data(t.done)
    }),
    todos = S.array([]),         // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push new title onto list
        todos.push(Todo({ title: newTitle(), done: false }));
        newTitle("");            // clear new title
    },
    view =                       // declarative view
        <input type="text" @data(newTitle)/> <a onclick = addTodo>+</a>
        @todos().map(todo =>     // insert todo views
            <div>
                <input type="checkbox" @data(todo.done) />
                <input type="text" @data(todo.title) />
                <a onclick = (() => todos.remove(todo))>&times;</a>
            </div>);

document.body.appendChild(view); // add view to document
```
The htmlliterals library uses S computations to construct the dynamic parts of our view (note the '@' expressions).  That way, whenever our data changes, S updates the affected parts of the DOM automatically.  This lets us write concise, declarative code which is also efficient &mdash; Surplus.js apps generally places at or near the top of the various web application benchmarks.

Declarative programming also has the advantage of enabling extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```
## API

### Data Signals
#### `S.data(val : T) : (newval? : T) => T`
Construct a data signal with the given value.  The data signal is represented as a getter-setter function: call it with no argument to read its current value; call it with an argument to update it with a new value.  When updating, the return value is the supplied new value.
```javascript
var a = S.data(1);
a()  // returns 1
a(2) // sets a() to 2 and returns 2
a()  // now returns 2
```

### Computations
#### `S(fn : () => T) : () => T`
Construct a computation out of the given paramless function.  S runs the function at the time of construction, and again whenever any of the referenced signals change.  Calling a computation reads the value returned by its most recent execution.
```javascript
> var a = S.data(1),
>     b = S(() => console.log(a()));
1     // S runs b() at time of construction
> a(2)
2     // and whenever a referenced signal changes, like a()
```
By default, dependencies are automatic and dynamic, meaning that it's only the signals read in the last execution that matter:
```javascript
> var a = S.data(true),
>     b = S.data(1),
>     c = S.data(2),
>     d = S(() => console.log(a() ? b() : c()));
1
> b(3)     // d() called b(), so changing b() re-runs d()
3
> c(4)     // d() didn't call c(), so it doesn't depend on it
> a(false) // now make d() call c()
4
> c(5)     // now c() is a dependency and updates d()
5
> b(6)     // while b() is no longer a dependency
```
When S updates computations, it does so in a way that preserves three important qualities:

1. No gaps: if a computation reads a signal, it will "see" (be executed with) all values of that signal (time doesn't skip)

2. No repeats: even if an initial change affects a computation through multiple pathways, the computation will only be run once (time doesn't loop back)

3. No glitches: (two moments never exist together)

Subcomputations

Computations also have a few options, which use a fluent syntax and which are defined below.  As an example, an extreme case would look like:
```javascript
var c = S.toplevel().on(a).async(go => setTimeout(go, 0)).S(() => ...);
```

### Simultaneous Changes
#### `S.event(fn : () => T) : T`
Collect all changes generated while the function executes, then propagate them all simultaneously.
```javascript
> var a = S.data(1),
>     b = S.data(2),
>     c = S(() => a() + b()),
>     d = S(() => console.log(c()));
3           // d's initial log of 1 + 2
> a(3)      // triggers c() which triggers d()
5
> b(4)      // ditto for b()
7
> S.event(() => {
      a(5); // S.event() lets us change a() and b() w/o propagating ...
      b(6);
  })
11          // ... until end of event, when new values propagate together
```
During an event, changes are not visible even within the body of the function.
```javascript
> var a = S.data(1);
> S.event(() => {
>     a(2);             // change a()
>     console.log(a()); // and log it
> });
1                       // a() inside event() was still 1
> console.log(a());
2                       // but after event() is new value, 2
```

### Static Dependencies
#### `S.on(...signals).S(fn)`
By default, dependencies in S are automatic.  This is usually what we want: if our computation references a signal, then we probably want it to update when that signal changes.  However, there are cases where we might want to statically declare the sources which trigger our computation.  Computations created with the .on(...) modifier will update if and only if one of the listed signals changes.  Any other signals referenced will be sampled at that time, but will not trigger updates when they change:
```javascript
> var a = S.data(1),
>     b = S.data(2),
>     c = S.on(a).S(() => console.log("a is" + a() + ", b is " + b()));
a is 1, b is 2
> a(3) // changing a() triggers c()
a is 3, b is 2
> b(4) // but changing b() doesn't
> a(5)
a is 5, b is 4
```
In the code above, c() only runs when a() changes, even though it references b().

S.on() can take any number of dependencies: .on(foo), .on(foo, bar), .on(), etc.  That last might seem useless -- a computation that never updates -- but can be helpful when we want to capture other behaviors of computations, like subcomputations or asynchrony.

### Asynchronous updates
#### `S.async(<scheduler>).S(fn)`


### Releasing resources
#### `S.cleanup(fn)`


### Disposing computations
#### `S.dispose(computation)`

```javascript
// start from the most basic operation: two values and a sum
var a = 1,
    b = 2,
    c = a + b;
c; // equals 3

// all well and good, but if we change a or b, c is now out of date
a = 2;
c; // still equals 3

// let's do that again, but using S's primitives
var a = S.data(1),
    b = S.data(2),
    c = S(() => a() + b());
c(); // equals 3
a(2);
c()b // now equals *4*

// what happened?
// - a, b and c are not just values anymore, they're *signals*
// - a signal is a container for a value that changes over time
// - signals have two types:
//      - *data signals* like a() and b()
//      - *computations* like c()
// - you read the current value of a signal by calling it, a(), b() or c()
// - S tracks internally which signals each computation reads
// - you can set a data signal by passing it a new value
// - when we set a data signal, S updates all affected computations
// so when we changed a(), S knew that c() had read a(), and so it updated c()

// to make it clearer what's going on, let's add a computation with a side-effect
var d = S(() => console.log(c()));
> 4
// note that S runs a new computation at the point it is created ...
a(3);
> 5
// ... and whenever a referenced signal changes.
// we say that this change produces a *change event*, to which S *responds*

// what if we wanted to change both a() and b()?
a(4);
> 6
b(5);
> 9
// S runs updates immediately, so two changes produces two updates.
// but what if we want both changes to appear as part of the same event?
// for that, we wrap them in S.event()
S.event(() => {
    a(6);
    b(7);
});
> 13
// now S treats both as a single event, and only responds once (one run of c())

// what if we want to run only when a() changes, but to ignore changes to b()?
// that must be declared at creation time, using the S.on(...) modifier
var e = S.on(a).S(() => a() + b()),
    f = S(() => console.log(c()));
> 13
// so now only a() triggers e()
a(8);
> 15
> 15
// wait, back up, why was 15 printed twice?  oh yeah!  c() is still listening too.
// we'll show a better way to handle stale computations later, but for now there's S.dispose()
S.dispose(c);
S.dispose(d);
// ok, once again, a() triggers e()
a(9);
> 16
// but b() doesn't
b(10); // doesn't trigger e()
// we say that e() *depends on* a(), but only *samples* b()
```

&copy; 2015 Adam Haile, adam.haile@gmail.com.  MIT License.
