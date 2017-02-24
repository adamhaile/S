# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript: a simple mental model, a clean and expressive syntax, and fast execution.  It takes its name from two reactive terms: **signal**, a value that changes over time, and **synchronous**, a strategy for simplifying change.

```javascript
var a, b, c, d;               //
S.root(() => {                //       ^
    a = S.data(1);            //   a() |  1    3    3    5       
    b = S.data(2);            //   b() |  2    2    4    6 
    c = S(() => a() + b());   //   c() |  3    5    7   11 
    d = S(() => c() * a());   //   d() |  3   15   21   55  
});   // t0                   //       +------------------>
                              //         t0   t1   t2   t3 
a(3); // t1                   //
b(4); // t2                   // 
S.freeze(() => {              //
    a(5);                     //
    b(6);                     //
});   // t3                   //
```

An S app consists of data and computations on data.  As the data changes, S updates the affected computations.

To achieve this, the data and computations are wrapped as *signals* using `S.data(<value>)` for data and `S(() => <code>)` for computations.

S implements signals as closures: call a signal to read its current value; pass a data signal a new value to change it.

If a change affects multiple computations, S uses what's called a *synchronous* execution model: it is as though all computations update "instantly."  They can't, of course, but S maintains this behavior by three invariants: computations always return current (not stale) values, they run exactly once per change event (no missed or redundant updates), and if they change any data signals, those changes don't take effect until all other updates have finished.

S allows computations to generate more computations, with the rule that these "child" computations only live until their "parent" updates.  This allows an application to grow *and shrink* with the size of your data.  In general, S applications never need to manually subscribe or unsubscribe from changes.

S has a small API for doing things like aggreggating multiple changes into one event (S.freeze()), deferring updates (S.defer()), controlling dependencies (S.sample()), and so on.  See the full list below.

## How does S work?
As your program runs, S's data signals and computations communicate with each other to build up a live dependency graph of your code.  Computations set an internal 'calling card' variable which referenced signals use to register a dependency.  Since computations may reference the results of other computations, this graph may have _n_ layers, not just two. 

When data signal(s) change, S starts from the changed signals and traverses the dependency graph twice: 

1) mark all downstream computations as stale, remove the old dependency edges and dispose of child computations

2) update those computations and (re)create their new dependency edges.  

S usually gets the order of updates correct, but if execution changes, like a different conditional branch, S may need to suspend a calling computation in order to update a called one before returning the updated value.

In S, data signals are immutable during updates.  If the updates set any values, those values are held in a pending state until the update finishes.  At that point their new values are committed and the system updates accordingly.  This process repeats until the system reaches a quiet state with no more changes.  It then awaits the next external change.

## S API

### Constructors

### `S.root(dispose => <code>)`
Computations created by `<code>` live until `dispose` is called.  It is an error to try to construct a computation that is not under a root or parent computation.

### `S.data(<value>)`
Construct a data signal whose initial value is `<value>`.

### `S(() => <code>)`
Construct a computation whose value is the result of the given `<code>`.

### `S(val => <code>, <seed>)`
Construct a reducing computation, whose new value is derived from the last one, staring with `<seed>`.

### `S.on(<signal>, val => <code>, <seed>, <onchanges>)`
Statically declare a computation's dependencies, rather than relying on S's automatic dependency detection. 

`<seed>` is optional, with default `undefined`.

`<onchanges>` is optional and defaults to `false`.  If `<onchanges>` is true, then the initial run is skipped (i.e. computation starts with value `<seed>` and doesn't run `<code>` until a change occurs).

`<signal>` may be an array, in which case dependencies are created for each signal in the array.

### Behavior

### `S.freeze(() => <code>)`
Run `<code>`, but hold any data changes it produces in a pending state until it completes, at which point they all run as a single update.  If called within a computation, the system is already frozen, so is inert.  Returns value of `<code>`.

### `S.sample(<signal>)`
Sample the current value of `<signal>` but don't create a dependency on it.

### `S.cleanup(final => <code>)`
Run the given function just before the enclosing computation updates or is disposed.  The function receives a boolean parameter indicating whether this is the "final" cleanup, with `true` meaning the computation is being disposed, `false` it is being updated.

S.cleanup() is used to free external resources which a computation may have claimed, like DOM event subscriptions.  Computations can register as many cleanup handlers as needed, usually adjacent to where the resources are claimed.

### `S.subclock(() => <code>)`
Run computations and data signals created by `<code>` on a subclock, meaning that they don't just run but run *to completion* before surrounding code reads them.

## An Example: TodoMVC in S (plus friends)
What else, right?  S is just a core library for dealing with change; it takes more to build an application.  This example uses the suite Surplus.js, aka "S plus" a few companion libraries.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array() utility for a data signal carrying an array.
```javascript
var Todo = t => ({               // our Todo constructor
        title: S.data(t.title),  // properties are data signals
        done: S.data(t.done)
    }),
    todos = S.array([]),         // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push new title onto list
        todos.push(Todo({ title: newTitle(), done: false }));
        newTitle("");            // clear new title
    },
    view = S.root(() =>          // declarative view
        <input type="text" @data(newTitle)/> <a onclick = addTodo>+</a>
        @todos.map(todo =>       // insert todo views
            <div>
                <input type="checkbox" @data(todo.done) />
                <input type="text" @data(todo.title) />
                <a onclick = (() => todos.remove(todo))>&times;</a>
            </div>));

document.body.appendChild(view); // add view to document
```
Some things to note:

- There's no code to handle updating the application.  Other than a liberal sprinkling of `()'s`, this could be static code.  In the lingo, S enables declarative programming, where we focus on defining how things should be and S handles updating the app from one state to the next as our data changes.

- The htmlliterals library leverages S computations to construct the dynamic parts of the view (note the '@' expressions).  Whenever our data changes, S updates the affected parts of the DOM automatically.  

- S handles updates in as efficient a manner as possible: Surplus.js apps generally place at or near the top of the various web framework benchmarks (ToDoMVC, dbmonster, etc).

Reactive programs also have the benefit of an open structure that enables extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```

&copy; 2017 Adam Haile, adam.haile@gmail.com.  MIT License.
