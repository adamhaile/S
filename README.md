# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript: a simple mental model, a clean and expressive syntax, and fast execution.  It takes its name from two reactive terms: **signal**, a value that changes over time, and **synchronous**, a strategy for simplifying change.

```javascript
var a = S.data(1),                   //       
    b = S.data(2),                   //       ^
    c = S(() => a() + b()),          //   d() |  3    15    21    55  
    d = S(() => c() * a()); // t0    //   c() |  3     5     7    11 
                                     //   b() |  2     2     4     6
a(3); // t1                          //   a() |  1     3     3     5
b(4); // t2                          //       +------------------------>
S.freeze(() => {                     //         t0    t1    t2    t3 
    a(5);                            //
    b(6);                            //
}); // t3                            //
```

An S app consists of data and computations on data.  As the data changes, S updates the affected computations.

To achieve this, the data and computations must be wrapped as *signals* using `S.data(<value>)` for data and `S(() => <code>)` for computations.

S implements signals as closures: call a signal to read its current value; pass a data signal a new value to change it.

If multiple computations need to be updated, S uses a *synchronous* execution model: it is as though all computations update simultaneously and instantly.  This removes worries about update order or stale values.

- signals come in two types, *data signals* and *computations*
- data signals are the "leaves" in the system, where data and change enters
- computations perform calculations and/or useful side effects
- S implements both as closures, aka small functions carrying state
- calling a signal gets its current value; passing a data signal a value sets it
- setting a data signal advances the application to the next "tick" (t0 ... 3 above)
- each signal has exactly one value at each tick

- which S apps are composed of settable *data signals* and *computations*
- App state advances on a linear timeline of discrete instances
- Changing a data signal advances to the next instant
- Each signal has exactly one value at each instant

In plain terms, S helps you **keep things up-to-date** in your Javascript program.  S implements a **live, performant dependency graph** of your running code.  When data changes, S uses this graph to determine which parts of your application need to be updated and in what order.  

The cost of this process is that the computations being kept up to date and the data that's changing must be wrapped in S's **lightweight closures**.

S maintains a few useful properties as it runs:

- **automatic dependencies**: no manual un/subscription of change handlers.  Dependencies in S are automatic and exact.

- **automatic graph pruning**: no manual disposal of stale computations. In an S app, you only need to manage a few top level computations.  Most of the graph automatically grows *and shrinks* with the size of your data.

- **guaranteed currency**: no need to worry about how change propagates through the graph.  S insures that any signals referenced return updated values.

- **exact updates**: no missed or redundant updates.  Computations run exactly once per change event.

- **a unified global timeline**: no confusing nested or overlapping mutations of different sections of code. S apps advance through a series of discrete "instants" during which state is immutable.

S is useful for any project that can be described in terms of keeping something up-to-date: web frameworks keep the DOM up to date with the data, client-side routers keep the application state up to date with the url, and so on.

S is a personal research project.  The primary goal is to make something useful for the kinds of applications I write ("scratch my own itch"), the second is to explore concepts in reactive programming.  I welcome feedback.

## How do you use S?
There are only two main steps to using S:

1. Wrap the data that will be changing in S **data signals**: `S.data(<value>)`
2. Wrap the code you want to keep up-to-date in S **computations**: `S(() => <code>)`

Both constructors return closures (aka functions).  You can read the current value by calling it &ndash; `signal()`.  For data signals, you can also set the value by passing in a new one &ndash; `signal(<new value>)`.

That's largely it.  S tries to have a simple mental model &ndash; it's just data and computations on data.  

For advanced cases, S provides a handful of functions for things like treating multiple changes as a single event (`S.event()`), performing calculations over time (`S.on()`) and deferring updates (`S.defer()`).  See the API below for more.

There are also some things you *don't* have to do when using S:

- You don't need to construct your application a particular way.  S is a library, not a framework, and it leaves the big picture design up to you.  S can be used with a variety of patterns: MV*, Flux, FRP etc.

- You don't need to use S for your whole application.  Use it as narrowly or extensively as you like.

## How does S work?
As your program runs, S's data signals and computations communicate with each other to build up a live dependency graph of your code.  Computations set an internal 'calling card' variable which referenced signals use to register a dependency.  Since computations may reference the results of other computations, this graph may have _n_ layers, not just two.  

When data signal(s) change, S starts from the changed signals and traverses the dependency graph twice: one pass to mark all downstream computations, remove the old dependency edges and dispose of child computations; and a second pass to update those computations and (re)create their new dependency edges.  S usually gets the order of updates correct, but if execution changes, like a different conditional branch, S may need to suspend a calling computation in order to update a called one before returning the updated value.

In S, data signals are immutable during updates.  If the updates set any values, those values are held in a pending state until the update finishes.  At that point their new values are committed and the system updates accordingly.  This process repeats until the system reaches a quiet state with no more changes.  It then awaits the next external change.

## S API

### `S.data(<value>)`
Construct a data signal whose initial value is `<value>`.

### `S(() => <code>)`
Construct a computation whose value is the result of the given `<code>`.  `<code>` is run at time of construction, then again whenever a referenced signal changes.

### `S.event(() => <code>)`
Execute the given `<code>` as a single event in the system, meaning that any data changes produced are aggregated and run as a unit when the `<code>` completes.  Returns value of `<code>`.

### `S.on(<signal>, <reducer>, <seed>, <onchanges>)`
Create a reducing computation.  Run `<reducer>` on the current value, initially `<seed>`, at time of construction and every time `<signal>` changes.  If `<onchanges>` is true, then the initial run is suppressed and the value starts as `<seed>`.

`<seed>` and `<onchanges>` are both optional, with defaults of `undefined` and `false`.

`<signal>` may be an array of signals, in which case the reducer runs whenever one or more of the signals changes.

### `S.sample(<signal>)`
Sample the current value of `<signal>` but don't create a dependency on it.

### `S.dispose(<computation>)`
Dispose `<computation>`.  `<computation>` will still have its value, but that value will no longer update, as it is disconnected from the dependency graph.

Note: S allows computations to create other computations, with the rule that these "child" computations are automatically disposed when their parent updates.  As a result, S.dispose() is generally only needed for top level and .orphan()'d computations.

### `S.cleanup(final => <code>)`
Run the given function just before the enclosing computation updates or is disposed.  The function receives a boolean parameter indicating whether this is the "final" cleanup, with `true` meaning the computation is being disposed, `false` it's merely being updated.

S.cleanup() is used to free external resources, like DOM event subscriptions, which a computation may have claimed.  Computations can register as many cleanup handlers as needed, usually adjacent to where the resources are claimed.

### `S.orphan().S(...)`
A computation created with the .orphan() modifier is disconnected from its parent, meaning that it is not disposed when the parent updates.  Such a computation will remain alive until it is manually disposed with S.dispose().

### `S.defer(<scheduler>).S(...)`
The .defer() modifier controls when a computation updates.  `<scheduler>` is passed the computation's real update function and returns a replacement which will be called in its stead.  This replacement can then determine when to run the real update.

### `S.sum(<value>)`
Construct an accumulating data signal with the given `<value>`.  Sums are updated by passing in a function that takes the old value and returns the new.  Unlike S.data(), sums may be updated several times in the same event, in which case each subsequent update receives the result of the previous.

## An Example: TodoMVC in S (plus friends)
What else, right?  S is just a core library for dealing with change; it takes more to build an application.  This example uses the suite Surplus.js, aka "S plus" a few companion libraries.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array() utility for a data signal carrying an array.
```javascript
var Todo = t => ({               // our Todo model
        title: S.data(t.title),  // properties are data signals
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
Some things to note:

- There's no code to handle updating the application.  Other than a liberal sprinkling of `()` dereferences, this could be static code.  In the lingo, S enables declarative programming, where we focus on defining how things should be and S handles updating one such state to the next as our data changes.

- The htmlliterals library leverages S computations to construct the dynamic parts of the view (note the '@' sections).  That way, whenever our data changes, S updates the affected parts of the DOM automatically.  

- S handles updates in as efficient a manner as possible: Surplus.js apps generally places at or near the top of the various web framework benchmarks (ToDoMVC, dbmonster, etc).

Reactive programs also have the benefit of a very 'open' structure that enables extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```

&copy; 2016 Adam Haile, adam.haile@gmail.com.  MIT License.
