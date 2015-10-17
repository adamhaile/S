# S.js

S.js is a tiny library for performing **simple, clean, fast reactive programming in Javascript**.  It takes its name from **signal**, a reactive term for a value that changes over time.

In plain terms, S helps you **keep things up-to-date** in your Javascript program.  The cost is that the functions being kept up to date and the data that's changing must be wrapped in S's lightweight closures.

S is a personal research project.  I welcome feedback.

## How do you use S?

There are only two core steps to using S:

1. Wrap the data that will be changing in S **data signals**: `S.data(&lt;value&gt;)`
2. Wrap the things you want to keep up-to-date in S **computations**: `S(() => &lt; ... code ... &gt;)`

Both constructors return a function, and you can read the current value by calling it &ndash; `signal()`.  For data signals, you can also set them by passing in a new value &ndash; `signal(&lt;new value&gt;)`.

## How does S work?
S implements data signals and computations as **lightweight closures**, aka small first-class functions carrying a piece of state.  As your program runs, these closures communicate with each other to build up a **live dependency graph** of your program.  Then, when a data signal changes, S **traverses the graph** to determine which computations need to be updated and in what order.  This way, S keeps your program up-to-date automatically, without any need to register for change events or call update functions.

As a tiny example of how this works, here's a version of "hello world" implemented in S:
```javascript
> var name = S.data("S.js"),
      hello = S(() => "hello " + name()),
      print = S(() => console.log(hello()));
hello S.js
> name("world")
hello world
```
As small as it is, this snippet demonstrates several characteristics of S:
- Data signals are getter-setter functions: we read their value by calling them directly &ndash; `name()` &ndash; we set them by passing them a new value &ndash; `name("world")`
- When we create a computation, S invokes the function and watches to see what signals it references
- If one of those signals change, S re-runs the downstream computations &ndash; when `name()` changes, S re-runs `hello()` then `print()`
- Computations can return values, in which case they may be read just like data signals, like when `print()` calls `hello()`
- Computations may also be created for their side effects, like `print()` which logs to console

All of this should hopefully seem simple &ndash; it's just functions operating on data, both wrapped to make them &ldquo;alive.&rdquo;

Data signals are like little buckets: we read the current contents by calling the signal with no parameters &ndash; `signal()` &ndash; we set it by passing in a new value &ndash; `signal(&lt;new value&gt;)`.  Computations can be called as well, which returns the value of their most recent execution.


## What is it good for?

S helps build applications which respond ("react") to changing data.  The state-of-the-art for handling change in most Javascript systems is manual event subscription: objects holding changing data publish change events, and objects responding to changes subscribe callbacks to those change events.  This system works in simple cases, but shows its shortcomings as our applications become complex or multilayered:

1. **It violates DRY:** we have to name all the pieces of data touched by our code twice, once in the body of a calculation, then again to wire up all change events.  Errors occur if we miss a subscription.

2. **It's inefficient:** event systems propagate changes in depth-first order, meaning that if there are two paths in the dependency graph to the same target, then that target will be run twice.  In worst-case scenarios, targets may be run exponentially or factorially.

3. **It's inconsistent:** in situations where a target is run twice, the first time it is run, it sees an inconsistent world, where some of its dependencies have been updated while others haven't yet.

4. **It's leaky:** removing stale subscriptions is an error-prone task, because event-subscription systems are leaky by default.

All these problems stem from a core issue: event subscription treats change as an afterthought &mdash; *first* construct your objects, *then* wire up change handlers.  Reactive systems consider change a foundational concept, providing basic primitives and system features for responding to and reasoning about change.  Here's how S performs against the concerns above:

1. **Dependencies are automatic:** S &ldquo;watches&rdquo; the execution of your code and automatically registers a dependency when a piece of data is read.  Dependencies are exact with no need to manually re-list them.

2. **1 change &equiv; 1 update:** No matter how many paths converge on a target, S will run that target only once per change.

3. **Dependencies run first:** S runs updates in topological order, guaranteeing that when a piece of code executes, all the data it references has already been updated.

4. **Stale dependencies are disposed by default:** S doesn't just create dependencies automatically, it also removes them.  S goes even further, removing entire nodes from the dependency graph when they become stale.  In most cases, an S application is leak-free without a single manual unsubscription.

Beyond these points of comparison, S has a few other qualities which merit mention:

5. **S is fast:** reactive programming works best when it's ubiquitous, but to be ubiquitous it must be fast.  Performance is a core goal of S, and S is generally 5-100x faster at dispatching updates than other established systems.

6. **S is expressive:** with S, we don't need to write one chunk of code to initialize our application, another to handle updating it, and a third to wire it all together; instead, we can write a single, declarative description of our application's state, and S handles the updating for us.

7. **S is ergonomic:** short and intelligible stack traces, meaningful function names, helpful (hopefully!) errors.

## What is it *not* good for?

1. &ldquo;Batch processing&rdquo; - tasks which perform a single calculation or modification and then exit.  Since no data structures persist across changes, there's no advantage to a framework designed to keep them up to date.  This includes stateless network servers, like web servers.
2. Very performance-critical code.  While speed is a goal of S, the overhead is not zero.  S may still be useful as an orchestrator of such tasks, but may be the wrong choice for especially hot sections of code.
3. Telling you how to build an application.  S is not a &ldquo;just add your business logic here&rdquo; application framework, like Angular or Ember.  S's reactive primitives may help you build such macro-structures, but it leaves it to you to come up with the best pattern for your application.

## How does S work?

S works by wrapping your functions and data in **lightweight closures**.  As your program runs, these closures communicate with each other to build a **live dependency graph** of your application.  When a piece of data changes, S **traverses this graph** to update the affected computations.

In S there are two kinds of signals, data signals and computations.  **Data signals** represent a value that changes over time.  They're the leaves in the dependency tree, where data (and changes to data) enter the system.  **Computations** read signals to generate derived values and/or useful side-effects.  When a data signal changes, S propagates that to the computations which reference it, then to the upstream computations which reference those computations, and so on, until the system has finished reacting to the change.  In this way, an S application implements its behavior by creating and maintaining a graph of signals.  

## A tiny example of S

Here is a small example of reactive programming in S, a tiny 'application' which takes a name and says "hello" to it on the console:
```javascript
> var name = S.data("S.js"),
      hello = S(() => "hello " + name()),
      print = S(() => console.log(hello()));
hello S.js
> name("world")
hello world
```
As small as it is, this snippet demonstrates several characteristics of S:
- S has two core constructors: `S.data(<value>)`, which makes a data signal, and `S(<paramless function>)`, which makes a computation
- Data signals are getter-setter functions: we fetch their value by calling them directly `name()`; we set them by passing them a new value `name("world")`
- When we create a computation, S invokes the function and watches to see what signals it references
- If one of those signals change, S re-runs the computation &ndash; when `name()` changes, S re-runs `hello()` then `print()`
- Computations can return values, in which case they may be referenced just like data signals, like when `print()` calls `hello()`
- Computations may also be created for their side effects, like `print()` which logs to console

## TodoMVC in S (plus friends)

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
The htmlliterals library uses S computations to construct the dynamic parts of our view (note the '@' expressions).  That way, whenever our data changes, S updates the affected parts of the DOM automatically.  This lets us write concise, declarative code which is also efficient &mdash; S generally places at or near the top of the various web application benchmarks.

Declarative programming also has the advantage of enabling extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos)          // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                          // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```
## API - Basic

### Constructors

S is built around two core data types, Data Signals and Computations.

#### Data Signals

#### `S.data(val : T) : (newval? : T) => T`
Construct a data signal with the given value.  The data signal is represented as a getter-setter function: call it with no argument to read its current value; call it with an argument to update it with a new value.  When updating, the return value is the new value, even when propagation is frozen (see S.freeze()).
```javascript
var a = S.data(1);
a()  // returns 1
a(2) // sets a() to 2 and returns 2
a()  // now returns 2
```

#### Computations
#### `S(fn : () => T) : () => T`
Construct a computation out of the given paramless function.  S runs the supplied function at the time of construction, and in that and each subsequent run, it watches which signals are read.  When any of those signals changes, S re-runs the computation.
```javascript
> var a = S.data(1),
>     b = S(() => console.log(a()));
1     // S runs b() at time of construction
> a(2)
2     // and whenever a referenced signal changes, like a()
```
Note that it's only the signals read in the *last* execution that matter.  This means that dependencies are dynamic, i.e. they may come and go depending on function execution:
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
Computations are signals as well.  Calling them reads the value returned by their most recent execution:
```javascript
var a = S.data(1),
    b = S(() => a() * 2);
b() // returns 2
a(2)
b() // returns 4
```
Since computations are signals, our dependency graphs may be deeper than just two layers.  This raises the question of how S handles multi-layered propagation.  The rules are simple:

1. One initial change generates exactly one update of all affected computations

2. No computation runs until all the computations it references have run

In mathematical terms, changes run in topological order:
```javascript
> var a = S.data(1),
>     b = S(() => a() * 2),
>     c = S(() => a() * 3),
>     d = S(() => console.log(b() + c()));
5
> a(2)
10 // d() only runs once, and only after b() and c()
```
Computations also have a few options, which use a fluent syntax and which are defined below.  As an example, an extreme case would look like:
```javascript
var c = S.watch(a).async(go => setTimeout(go, 0)).pin(b).S(() => ...);
```

### Simultaneous changes
#### S.freeze(fn : () => T) : T
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
> S.freeze(() => {
      a(5); // freeze lets us change a() and b() w/o propagating ...
      b(6);
  })
11          // ... until freeze exits, when new values propagate together
```
During a freeze, changes are not visible even within the body of the function.
```javascript
var a = S.data(1),
    old_a;
S.freeze(() => {
    a(2);         // change a()
    old_a = a();  // and read its value
})
a()               // returns new value, 2
old_a             // returns old value 1, b/c freeze hadn't finished when old_a was set
```

## API - Intermediate

### Controlling Dependencies

As mentioned above, by default dependencies in S are automatic.  This is usually what we want: if our computation references a signal, then we probably want it to update when that signal changes.  However, there are cases where we might want explicit control over when a dependency is registered.  Perhaps we want to reference a signal only for context and not to trigger an update if it changes, or perhaps we want to explicitly list the dependencies of a computation for transparency about when it runs.

S provides two functions for controlling dependencies: S.peek(...) and S.watch(...).  

#### Avoiding Dependencies
#### S.peek(fn : () => T) : T
Turn off dependency detection while running the supplied function.  Return the result of the function.
```javascript
> var a = S.data(1),
>     b = S.data(2),
>     c = S(() => console.log("a is" + a() + ", b is " + S.peek(b));
a is 1, b is 2
> a(3) // changing a() triggers c()
a is 3, b is 2
> b(4) // but changing b() doesn't
> a(5)
a is 5, b is 4
```
In the code above, c() only runs when a() changes, even though it references b().

S.peek() works on any paramless function, of which a signal just happens to be one.

```javascript
var sum = S.peek(() => a() + b());
```

In the above code, neither a() nor b() will register a dependency.

#### Static Dependencies
#### `S.watch(...signals).S(fn)`

Computations created with the .watch(...) modifier will update if and only if one of the listed signals changes:
```javascript
> var a = S.data(1),
>     b = S.data(2),
>     c = S.watch(a).S(() => console.log("a is" + a() + ", b is " + b()));
```
The above code achieves the same effect as the exampale in S.peek(), but it does so by explicitly watching only a() instead of peaking at b().

S.watch() can take any number of dependencies: .on(foo), .on(foo, bar), .on(), etc.  That last might seem useless -- a computation that never updates -- but can be helpful when we want to capture other behaviors of computations, like subcomputations or asynchrony.

### Subcomputations

One of the core organizational patterns of programming is *composition*: big functions are composed of smaller functions, big objects of smaller objects and so on.  S follows in this trend, in that computations may create sub-computations within them that decompose their behavior into smaller pieces.  

Consider, for example, a design in which a single top-level computation defines "the application."  Without the ability to create subcomputations, any small change to application state would require rebuilding the entire application and all its data structures. Subcomputations avoid this problem by letting us break the application into smaller pieces of behavior.

The two rules of subcomputations are:

1. signals referenced in the body of a subcomputation create dependencies for the subcomputation but not the parent

2. by default, subcomputations are considered part of "the result" of running the parent computation, and as such, they only last until the next time the parent runs or the parent is disposed

In some rare occasions, it can be useful to have a subcomputation that lives beyond its parent's update cycle.  For instance, the parent computation might be serving as a computation "factory," creating new computations with each update which should all continue to be alive.  For such cases, S provides the S.pin() modifier, which "pins" subcomputations to the lifespan, not update cycle, of their parent.  

Imagine you were designing a game, and every time the game level changed, you wanted to spawn a new monster, and for all the existing monsters to start moving faster.  You might encode that behavior as follows:

```javascript
var level = S.data(1),
    monsters = [],
    levelSpawner = S.on(level).S(() => monsters.push(new Monster(Math.rand())));

function Monster(friskiness) {
    this.speed = S(() => friskiness * level());
}

```
So there's a computation, levelSpawner(), that creates the new monsters, and each monster has its own monster.speed() computation that determines its speed base on the current level().  

You notice, however, that after the first level, the existing monsters don't go any faster.  The reason is that since they were created by levelSpawner(), their own monster.speed() computations are children of levelSpawner().  Now that levelSpawner() has updated, those monster.speed() computations have been disposed and are no longer listening to level().

The fix is to "pin" monster.speed(), so that it stays alive as long as levelSpawner():

```javascript
function Monster(speed) {
    this.speed = S.pin().S(() => speed * level());
}
```

This fixes the problem, and the monsters start accelerating.  However, there's a bit of a smell here, in tat we had to change the Monster constructor based on the behavior of levelSpawner().  This seems wrong: Monster shouldn't know or care about how levelSpaner works.  For this scenario, S provides an alternate syntax for .pin(), where we can pass it a function, and any subcomputation created within it is pinned, without needing to have the .pin() modifier prefixed.  We can now keep the pinning in levelSpawner() where it belongs:

```javascript
    levelSpawner = S.on(level).S(() => S.pin(() => monsters.push(new Monster(Math.rand))));
```

### The computation Lifecycle



&copy; 2015 Adam Haile, adam.haile@g    mail.com.  MIT License.
