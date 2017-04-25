# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript.  It aims for a simple mental model, a clean and expressive syntax, and fast execution.  

In plain terms, S helps you **keep things up-to-date** in your program.  S programs work like a spreadsheet: when data changes, S automatically updates downstream computations.

Here's a tiny example:
```javascript
var a = S.data(1),                   //       a() |   1     3     3     5       
    b = S.data(2),                   //       b() |   2     2     4     6 
    c = S(() => a() + b()),          //       c() |   3     5     7    11 
    d = S(() => c() * a()); // t0    //       d() |   3    15    21    55  
a(3);                       // t1    //           +------------------------> 
b(4);                       // t2    //              t0    t1    t2    t3
S.freeze(() => {                     //    
    a(5);                            //    
    b(6);                            //    
});                         // t3    //    
```
The timeline on the right shows how the values evolve at each instant.  Initially (time t0), `c()` and `d()` are 3, but when `a()` changes to 3 (t1), they become 5 and 15.  Ditto for t2 and t3.  Every time `a()` or `b()` changes, S re-evaluates `c()` and `d()` to make sure they stay consistent.

To achieve this behavior, static data and computations must be converted to *signals*, which is a reactive term for a value that changes over time.  S data signals are constructed by `S.data(<value>)` and computations by `S(() => <code>)`.  Both return closures: call a signal to read its current value; pass a data signal a new value to change it.

When an S computation runs, S records what signals it references, thereby creating a live dependency graph of running code.  When data changes, S uses that graph to figure out what needs to be updated and in what order.

S has a small API.  The example above shows `S.freeze()`, which aggregates multiple changes into a single step (t3).  The full API is listed below.

## S Features

S maintains a few useful behaviors while it runs.  These features are designed to make it easier to reason about reactive programming:

> **Automatic Dependencies** - No manual (un)subscription to change events.  Dependencies in S are automatic and exact.
>
> **Guaranteed Currency** - No need to worry about how change propagates through the system.  S insures that signals always return current and updated values.
>
> **Exact Updates** - No missed or redundant updates.  Computations run exactly once per upstream change event.
>
> **A Unified Global Timeline** - No confusing nested or overlapping mutations from different sections of code. S apps advance through a series of discrete "instants" during which state is immutable.
>
> **Self-Extensible** - Computations can extend the system by creating new "child" computations.
>
> **Automatic Disposals** - No manual disposal of stale computations.  "Child" computations are disposed automatically when their "parent" updates.

For advanced cases, S provides capabilities for dealing with self-mutating code:

> **Multi-Step Updates** - Computations can set data signals during their execution.  These changes don't take effect until the current "instant" finishes, resulting in a multi-step update.
>
> **Partitionable Time** - Multi-step updates can run on a 'subclock,' meaning that surrounding code will only respond to final, at-rest values, not intermediate ones.

## An Example: TodoMVC in S (plus friends)
What else, right?  S is just a core library for dealing with change; it takes more to build an application.  This example uses Surplus.js, aka "S plus" a few companion libraries.  Most notably, it uses Surplus' JSX preprocessor for embedded DOM construction.
```jsx
var Todo = t => ({               // our Todo constructor
       title: S.data(t.title),   // properties are data signals
       done: S.data(t.done)
    }),
    todos = SArray([]),          // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push new title onto list
       todos.push(Todo({ title: newTitle(), done: false }));
       newTitle("");             // clear new title
    },
    view = S.root(() =>
       <div>                     // declarative main view
          <input type="text" {...data(newTitle)}/>
          <a onClick={addTodo}>+</a>
          {todos.map(todo =>     // insert todo views
             <div>
                <input type="checkbox" {...data(todo.done)}/>
                <input type="text" {...data(todo.title)}/>
                <a onClick={() => todos.remove(todo)}>&times;</a>
             </div>)}
       </div>);

document.body.appendChild(view); // add view to document
```
Some things to note:

- There's no code to handle updating the application.  Other than a liberal sprinkling of `()'s`, this could be static code.  In the lingo, S enables declarative programming, where we focus on defining how things should be and S handles updating the app from one state to the next as our data changes.

- The Surplus library leverages S computations to construct the dynamic parts of the view (the '{ ... }' expressions).  Whenever our data changes, S updates the affected parts of the DOM automatically.  

- S handles updates in as efficient a manner as possible: Surplus apps generally place at or near the top of the various web framework benchmarks (ToDoMVC, dbmonster, js-framework-benchmark, etc).

Reactive programs also have the benefit of an open structure that enables extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```

## API

### Constructors

### `S.root(dispose => <code>)`
Computations created by `<code>` live until `dispose` is called.  S will log an error if you try to construct a computation that is not under a root or parent computation.

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
Run `<code>`, but hold any data changes it produces in a pending state until it completes, at which point they all run as a single update.  If called within a computation, the system is already frozen, so `freeze` is inert.  Returns value of `<code>`.

### `S.sample(<signal>)`
Sample the current value of `<signal>` but don't create a dependency on it.

### `S.cleanup(final => <code>)`
Run the given function just before the enclosing computation updates or is disposed.  The function receives a boolean parameter indicating whether this is the "final" cleanup, with `true` meaning the computation is being disposed, `false` it is being updated.

S.cleanup() is used to free external resources which a computation may have claimed, like DOM event subscriptions.  Computations can register as many cleanup handlers as needed, usually adjacent to where the resources are claimed.

### `S.subclock(() => <code>)`
Run computations and data signals created by `<code>` on a subclock, meaning that they don't just run but run *to completion* before surrounding code reads them.

&copy; 2017 Adam Haile, adam.haile@gmail.com.  MIT License.
