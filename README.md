# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript.  It takes its name from **signal**, a reactive term for a value that changes over time.

In plain terms, S helps you **keep things up-to-date** in your Javascript program.  S implements a **live, performant dependency graph** of your running code.  When data changes, S uses this graph to determine which parts of your application need to be updated and in what order.  

The cost of this process is that the computations being kept up to date and the data that's changing must be wrapped in S's **lightweight closures**.

S maintains a few useful properties as it runs:

- **automatic dependencies**: no manual un/subscription of change handlers.  Dependencies in S are automatic and exact.

- **automatic graph pruning**: no manual disposal of stale computations. In an S app, you only need to manage a few top level computations.  Most of the graph automatically grows *and shrinks* with the size of your data.

- **atomic updates**: no stale values, no missed or redundant updates.  S insures that your computations run exactly once per change event and that the signals they reference return current values.

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

In S, data signals are immutable during updates.  If the updates set any values, those values are held in a pending state until the udpate finishes.  At that point their new values are committed and the system updates accordingly.  This process repeats until the system reaches a quiet state with no more changes.

## S API

### S.data(<value>)
Construct a data signal whose initial value is <value>.

### S(<thunk>)
Construct a computation whose value is the result of the given <thunk>.  <thunk> is run at time of construction, then again whenever a referenced signal changes.

### S.event(<thunk>)
Execute the given <thunk> as a single event in the system, meaning that any data changes produced are aggregated and run as a unit when the <thunk> completes.  Returns value of <thunk>.

### S.on(<signal>, <reducer>, <seed>, <runnow>)
Create a reducing computation.  Run <reducer> on the current value, initially <seed>, every time <signal> changes.  If <runnow> is true, <reducer> is also run at time of construction.

<seed> and <runnow> are both optional, with defaults of `undefined` and `false`.

<signal> may be an array of signals, in which case the reducer runs whenever one or more of the signals changes.

### S.sample(<signal>)
Sample the current value of <signal> but don't create a dependency on it.

### S.dispose(<signal>)
Dispose <signal>.  <signal> will still have its value, but that value will no longer update, as it is disconnected from the dependency graph.

### S.cleanup(<unary function>)
Run the given function just before the enclosing computation updates or is disposed.  The function receives a parameter of `true` if the computation is being disposed and `false` if it's just an update.

S.cleanup() is used to free external resources, like DOM event registrations, which a computation may have claimed.  Computations can register as many cleanup handlers as needed.

### S.orphan().S(...)
A computation created with the .orphan() modifier is disconnected from its parent, meaning that it is not disposed when the parent updates.  Such a computation must be manually disposed with S.dispose().

### S.defer(<scheduler>).S(...)
The .defer() modifier controls when a computation updates.  <scheduler> is passed the computation's real update function and returns a replacement.  This replacement can then determine when to run the real update.

### S.sum(<value>)
Construct an accumulating data signal with the given <value>.  Sums are updated by passing in a function that takes the old value and returns the new.  Unlike S.data(), sums may be updated several times in the same event, in which case each subsequent update receives the result of the previous.

## An Annotated Tour of S

### The Basics: S() and S.data()

```javascript
// Start from the most basic operation - two values and a sum:
var x   = 1,
    y   = 2,
    sum = x + y;
sum; // equals 3

// All well and good, but if we change x or y, sum is now out of date
x = 2;
sum; // still equals 3

// Let's do that again, but using S's primitives for data and computations:

var x   = S.data(1),
    y   = S.data(2),
    sum = S(() => x() + y());
sum(); // equals 3
x(2);
sum(); // now equals *4*

// What happened? A bit of terminology:
// - x, y and sum are not just values anymore, they're *signals*
// - a signal is a container for a value that changes over time
// - signals have two types:
//      - *data signals* like x() and y()
//      - *computations* like sum()
// - you read the current value of a signal by calling it, x(), y() or sum()
// - you set a data signal by passing it a new value, x(2)
// - S tracks internally which signals each computation reads
// - when we set a data signal, S updates all downstream computations
// Here, setting x(2) caused S to updated sum()

// Computations don't just read data signals, they can also read the
// values of other computations:

var x   = S.data(1),
    y   = S(() => x() * 2),   // equals 2
    z   = S(() => x() * 3),   // equals 3
    sum = S(() => y() + z()); // equals 5

x(2); // sum() now 10

// S follows two important rules when it updates computations:
// - affected computations are run exactly once per event
// - reading a computation never returns a "stale" (not-yet-updated) value
// Here, even though there are two paths from x() to sum() (x -> y -> sum and
// x -> z -> sum), S will run sum() only once per change of x() and only after
// it has already updated y() and z():

// We can see this in action if we add a computation with a side-effect:

var log = S(() => console.log(sum()));
> 10

x(3);
> 15

// Note that log() runs once initially, as computations always do, and that
// it only runs once when x() changes.

// One corollary of how S runs updates is that cycles are an error, though in
// practice it's rare to encounter one, as it takes some ingenuity to do:

var x = S.data(1),
    y = S(() => x() || y()); // ok at first, since y() doesn't call y() initially

x(0); // now throws a circular dependency exception
```

### Understanding Discrete, Atomic Time with S.event()

```javascript
// Start with the same code we used above:

var x   = S.data(1),
    y   = S.data(2),
    sum = S(() => x() + y());
    
// What if we want to change both x() and y()?

x(3); // sum() now 5
y(4); // sum() now 7

// Each time we set a data signal it produces an *event*, so two changes
// = two events = two updates.  If we want to make multiple changes
// that propagate as a single event, we wrap them in S.event():

S.event(() => {
    x(6); // sum() still 9
    y(7); // ditto
}); // sum() now 13

// Now sum() is updated only when S.event() exits.  In fact, x() and y()
// don't actually change until then either.  When we set a data signal,
// we're really setting its *next* value.  Normally, S advances immediately
// to make that value current, but if we're in an event, S waits until it
// finishes, then advances on all changes at once.

// For this reason, it's an error to set a signal to two different
// values in the same event:

S.even(() => {
    x(8);
    x(8); // fine, as it's the same value (===)
    x(9); // exception, the next value of x can't be both 8 and 9
});

// If one part of your code thinks x should be 8, and another thinks 9,
// it's a bug and S will tell you so.
```


These three functions &ndash; S(), S.data() and S.event() &ndash; cover >90% of S usage.

### Computations over time: S.on()

S() performs computations across the *current* values of signals, but what if we want to perform a calculation across a signal's changing *stream* of values?  S provides a helper, S.on(), which allows us to perform such computations by defining them as reducing functions.

```javascript
// Instead of summing x() and y(), let's sum just x() over time:

var x = S.data(1),
    sum = S.on(x, sum => sum + x(), 0);

// S.on() creates a *reducing* computation, which starts with the given
// seed value -- here 0 -- and updates each time the indicated signal changes.

x(2); // sum() now 2
x(3); // sum() now 5
x(4); // sum() now 9

> 13
// now setting x() triggers sum()
x(9);
> 16
// but y() doesn't
y(10);
// we say that sum() *depends on* x(), but only *samples* y()

// what if we want to stop logging? we can dispose log() ...
S.dispose(log);
x(11);
// but there's a better way. S lets us create computations *in* computations,
// with the rule that these 'subs' expire the next time the parent updates.
// let's say we want to log some of the time, not all. so that's a bit of state:
var logging = S.data(true);
// then a computation that creates the logger when needed:
S(() => {
    if (logging())
        S(() => console.log(sum()));
});
> 21
x(12);
> 22
logging(false)
x(13);
// S disposes the inner computation automatically when logging() turns false.
// 'subs' are a subtly powerful feature: if we use computations to build our
// application, not just run it, then as the application changes and grows,
// stale pieces are disposed automatically.  No zombies!

// what if we want to control the frequency with which a computation updates?
// the S.async() modifier lets us intercept and defer an update.
// say we wanted to 'debounce' our logging function using underscore.js:
S.async(u => _.debounce(u, 100)).S(() => console.log(sum()));
> 23
x(14);
x(15);
x(16);
// ... imagine waiting until 100 msecs of inactivity have passed
> 26
// note that with S.async(), the computation still runs once at creation time,
// without that, there would be no dependencies, and so no update to defer.

// that's it: the entire API is just eight functions
//  constructors: S(), S.data()
//  control of ...
//    events:    S.event(), S.on()
//    updates:   S.async()
//    lifespan:  S.dispose(), S.toplevel()
//    resources: S.cleanup()
```

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

&copy; 2016 Adam Haile, adam.haile@gmail.com.  MIT License.
