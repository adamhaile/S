# S.js

```javascript
> var name = S.data("S.js"),
      hello = S(() => "hello " + name()),
      print = S(() => console.log(hello()));
hello S.js
> name("world")
hello world
```
S.js is a tiny library for performing **simple, clean, fast reactive programming in Javascript**.  It takes its name from **signal**, a reactive term for a value that changes over time.

S is a "scratch my own itch" project.  The main goals are to make it **useful** and to **deepen my own understanding** of reactive program design.  S is "opinionated" to the extent that there are many ways to implement reactive concepts, and S represents my evolving preferences.  I welcome feedback.

## What is it good for?

S helps build applications which respond ("react") to changing data.  The state-of-the-art for handling change in most Javascript systems is event subscription: objects holding changing data publish change events, and objects responding to changes subscribe callbacks to those change events.  This system works in simple cases, but starts to show its shortcomings as our applications become more complex and multilayered:

1. **It violates DRY:** we have to name all the pieces of data touched by our code twice, once in the body of a calculation, then again to wire up all change events.  Errors occur if we miss a subscription.

2. **It's inefficient:** events systems propagate changes in depth-first order, meaning that if there are two paths in the dependency graph to the same target, then that target will be run twice.

3. **It's inconsistent:** in situations where a target is run twice, the first time it is run, it sees an inconsistent world, where some of its dependencies have been updated while others haven't yet.

4. **It's leaky:** removing stale subscriptions is an error-prone task, because event-subscription systems are leaky by default.

Rather than event subscription, S is inspired by ideas from reactive programming.  If event subscription is a way to bolt change on top of OOP design, reactive systems consider change a core principle, providing basic primitives and system features for responding to and reasoning about change.  Consequently, S performs better against the concerns listed above.  In S:

1. **Dependencies are automatic:** S "watches" the execution of your code and automatically registers a dependency when a piece of data is read.  Dependencies are exact with no need to manually re-list them.

2. **1 change = 1 update:** No matter how many paths converge on a target, S will run that target only once per change.

3. **Dependencies run first:** S runs updates in topological order, guaranteeing that when a piece of code executes, all the data it references has already been updated.

4. **Stale subscriptions are disposed by default:** S doesn't just create subscriptions automatically, it also removes them.  S goes even further, removing entire nodes from the dependency graph when they become stale.  In most cases, an S application is leak-free without a single manual unsubscription.

Beyond these points of comparison, S has a few other qualities which merit mention:

5. **S is fast:** reactive programming works best when it's ubiquitous, but to be ubiquitous it must introduce minimal performance overhead.  S was benchmarked continuously during development, with the result that S is 5-100x faster at dispatching updates than most established systems.

6. **S is expressive:** with S, we don't need to write one chunk of code to initialize our application, another to handle updating it, and a third to wire it all together; instead, we can write a single, declarative description of our application, and S handles the updating for us.

7. **S is ergonomic:** short and intelligible stack traces, meaningful function names, helpful (hopefully!) errors.

## How does S work?

S works by wrapping your functions and data in **lightweight closures**.  As your program runs, these closures communicate with each other to build a live dependency graph of your application.  When a piece of data changes, S traverses this graph to update the affected computations.

In S there are two kinds of signals, data signals and computations.  **Data signals** are the leaves in the dependency tree: they're where data (and change) enter the system.  **Computations** read signals to generate derived values and/or useful side-effects.  When a data signal changes, S propagates that to the computations which reference it, then to the upstream computations which reference those computations, and so on, until the system has finished reacting to the change.  In this way, an S application implements its behavior by creating and maintaining a tree of signals.  

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
- S has two core primitives: `S.data(<value>)`, the constructor for a data signal, and `S(<paramless function>)`, the constructor for a computation.
- Data signals are getter-setter functions: we fetch their value by calling them directly `name()`; we set them by passing them a new value `name("world")`.
- When we create a computation, S invokes the function and watches to see what signals it references.
- When any of those signals change, S re-evaluates the computation, as when `name()` changes above.
- Computations can return values, in which case they may be referenced just like data signals &ndash; see `print()`'s call to `hello()`.
- Computations may also be created for their side effects, like `print()` which logs to console.
- By default, computations are *eager*: when a signal changes, S immediately re-evaluates all formulas that reference it.

## TodoMVC in S (plus friends)

What else, right?  This example uses the suite Surplus.js, aka "S plus" some companion libraries.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array utility for a data signal carrying an array.

```javascript
var Todo = t => ({               // our Todo model
        title: S.data(t.title),  // props are data signals
        done: S.data(t.done)
    }),
    todos = S.array([]),         // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push title onto list
        todos.push(Todo({ title: newTitle(), done: false }));
        newTitle("");
    },
    view =                       // declarative view
        <input type="text" @data(newTitle)/> <a onclick = addTodo>+</a>
        @todos().map(todo =>
            <div>
                <input type="checkbox" @data(todo.done) />
                <input type="text" @data(todo.title) />
                <a onclick = (() => todos.remove(todo))>&times;</a>
            </div>);

document.body.appendChild(view); // add view to document
```
The htmlliterals library uses S computations to construct the dynamic parts of our view (note the '@' expressions), so that whenever our data changes, S updates the affected parts of the DOM automatically.  This lets us write concise, declarative code which is also efficient &mdash; S generally places at or near the top of the various web application benchmarks.

Declarative programming also has the advantage of enabling extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos)          // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                          // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```
## Documentation

### Constructors
#### Data Signals

#### `S.data<T>(v : T) : () => T | (v : T) => T`
Construct a data signal with the given value.
```javascript
var d = S.data(1);
d()  // returns 1
d(2) // sets d() to 2 and returns 2
d()  // now returns 2
```

#### Computations
#### `S(fn : () => T) : T`
Construct a computation out of the given paramless function.
```javascript
var d = S.data(1),
    c = S(() => d() * 2);
c()  // returns 2
d(2)
c()  // now returns 4
```
Computations also have a few options, which are defined with a fluent syntax.  For example, an extreme case would look like:
```javascript
var c = S.on(a).gate(S.debounce(0)).pin().S(() => ...);
```
These options are explained below.

### Dependencies

By default, **dependencies in S are automatic and dynamic**: we don't need to explicitly subscribe to signals, S watches our function's evaluation and does it for us.  Furthermore, only the dependencies from the most recent evaluation of a computation are active.

```javascript
> var a = S.data(1),
>     b = S.data(2),
>     f = S(function () { console.log(a() || b()); });
1
> a(3) // f() called a(), so changing a() re-evaluates f()
3
> b(4) // f() didn't call b(), so it doesn't depend on it
> a(0) // now force f() to call and log b()
4
> b(5) // now b() is a dependency and updates f()
 5
> a(6) // now turn the dependency on b() back off by setting a()
6
> b(7) // b() no longer triggers f()
```

Automatic dependencies are usually what we want: if our computation references a signal, then we probably want it to update when that signal changes.  However, there are cases where we might want explicit control over when a computation updates.  Perhaps it references several signals but should only re-evaluate when a particular one changes.  Or perhaps there is a signal or two for which we only want the current value and don't care if it changes.

S provides two functions for explicitly controlling dependencies: S.on(...) and S.peek(...).  Computations created with the .on(...) modifier will update only when one of the indicated signals changes:

#### S.on(<signal>, ...).S(<fn>)
```javascript
var f = S.on(foo).S(function () { return foo() + bar(); });
```

In the above code, `f()` will update only when foo() triggers, even though it references both foo() and bar().  For that matter, it would update when foo() triggered even if its body didn't reference foo() at all.  The .on(...) modifier changes the computation's behavior from dynamic dependencies to static.

The .on(...) modifier can take any number of dependencies: .on(foo), .on(foo, bar), etc.

#### S.peek(<fn>)
```javascript
var f = S(function () { return foo() + S.peek(bar); });
```

This code achieves the same effect as the one above -- f() only depends on foo() -- by only "peeking" at bar, which gets its current value but avoids registering a dependency to it.

S.peek works on any paramless function, of which a signal just happens to be one.

```javascript
var sum = S.peek(function () {
    return foo() + bar();
});
```

In the above code, neither foo() nor bar() will register a dependency.

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
