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

S is a "scratch my own itch" project.  The main goals are to make it **useful** and to **deepen my own understanding** of reactive program design.  It's been a ton of fun, and I'm proud enough of the result to share.

## What is it good for?

S helps build applications which respond ("react") to changing data.  The state-of-the-art for handling change in most Javascript systems is event subscription: objects holding changing data publish change events, and objects responding to changes subscribe callbacks to those change events.  This system works in simple cases, but starts to show its shortcomings as our applications become more complex and multilayered:

1. **It violates DRY:** we have to name all the pieces of data touched by our code twice, once in the body of a calculation, then again to wire up all change events.  Errors occur if we miss a subscription.

2. **It's redundant:** events systems propagate changes in depth-first order, meaning that if there are two paths in the dependency graph to the same target, then that target will be run twice.

3. **It's inconsistent:** in situations where a target is run twice, the first time it is run, it sees an inconsistent world, where some of its dependencies have been updated while others haven't yet.

4. **It's leaky:** removing stale subscriptions is an error-prone task, because event-subscription systems are leaky by default.

Rather than event subscription, S is inspired by research in reactive programming.  If event subscription is a way to bolt change on top of OOP design, reactive systems consider change a core principle, providing basic primitives and system features for responding to and reasoning about change.  Consequently, S performs better against the concerns listed above.  In S:

1. **Dependencies are automatic:** S "watches" the execution of your code and automatically registers a dependency when a piece of data is read.  S insures that dependencies are exact with no need to manually re-list them.

2. **Updates are 1-1 with changes:** No matter how many paths converge on a target, S will run that target only once per change.

3. **Updates don't run until all their depenencies have:** S runs updates in topological order, guaranteeing that when a piece of code executes, all the data it references has already been updated.

4. **Stale subscriptions are disposed by default:** S doesn't just create subscriptions automatically, it also removes them.  S goes even further, removing entire nodes from the dependency graph when they become stale.  In most cases, an S application is leak-free without a single manual unsubscription.

A few other qualities merit mention:

5. **S is fast:** reactive programming works best when it's ubiquitous, but to be ubiquitous it must introduce minimal performance overhead.  S was benchmarked continuously during development, with the result that S is 5-100x faster at dispatching updates than most established systems.

6. **S is expressive:** with S, we don't need to write one chunk of code to initialize our application, another to handle updating it, and a third to wire it all together; instead, we can write a single, declarative description of our application, and S handles the updating for us.

7. **S is ergonomic:** short and intelligible stack traces, meaningful function names, helpful (hopefully!) errors.

## How does S work?

In S there are two kinds of signals, data signals and computations.  **Data signals** are the leaves in the dependency tree: they're where data (and change) enter the system.  **Computations** read signals to generate derived values and/or useful side-effects.  When a data signal changes, S propagates that to the computations which reference it, then to the upstream computations which reference those computations, and so on, until the system has finished reacting to the change.  In this way, an S application implements its behavior by creating and maintaining a tree of signals.  

S works by wrapping your functions and data in **lightweight closures**.  As your program runs, these closures communicate with each other to build a live dependency graph of your application.  When a piece of data changes, S uses this graph to update the affected computations.

## For Newcomers to Reactive Programming: An Inductive Example

Let's start with the following simple piece of code:

```javascript
var x = 1,
    y = 2,
    sum = x + y;
console.log(sum);
>>> 3
```
Plain enough: take two numbers, sum them, and log the sum.

Now suppose that this code becomes part of a larger application, and as that application runs, it's going to change the values of `x` and `y`.  We want to keep our log up-to-date, so we'll wrap the summing and logging steps as functions:

```javascript
var x = 1,
    y = 2,
    sum = () => x + y, // using ES6 fat-arrow functions
    log = () => console.log(sum());
log();
>>> 3
```

Now whenever `x` or `y` changes, we just call `log()` and the log will be updated:

```javascript
x = 2;
log();
>>> 4
y = 3;
log();
>>> 5
```

This works, but it also creates a new requirement: we have to remember to call `log()` each time we change `x` or `y`, or we'll miss a log entry.  If our code is complicated, or if there are multiple people working on it, this may be hard to enforce.

This is the kind of problem S solves.  Let's wrap our code in S's primitives:

```javascript
var x = S.data(1),
    y = S.data(2),
    sum = S(() => x() + y()),
    log = S(() => console.log(sum()));
>>> 2
```

Note that we didn't have to call `log()` to perform the first log; S did it for us.  Nor do we need to call it as `x` and `y` change:

```javascript
x(2)
>>> 4
y(3)
>>> 5
```

S has made our code "alive," in that the functions automatically *react* to changes in the data they reference.  We no longer need to remember to call `log()` after each change, and if other programmers add more behavior onto `x` and `y`, it will automatically be respected without any changes to our code.

*Reactive programming* is a good match for data-driven programming tasks like UI, games, simulations and so on.  For example, the code above can be seen as a tiny MVC application, with model data (`x` and `y`), business logic (`sum()`) and a view/presentation layer (`log()`).  Yet while reactive programming solves many of the difficulties of such applications, it also comes with its own set of concerns.  One is that in order to make our data active, we have to convert it with the S.data() constructor into getter-setter functions -- `x()` and `x(2)` instead of just `x` and `x = 2 `. This takes some getting used to, though it does have a few benefits: our data signals are first-class objects and can be passed to other code in ways that simple variables cannot, and making each piece of data a function means that an incorrect variable or property name causes an immediate runtime error right at the site of the mistake, rather than silently evaluating to `undefined`.

The second concern is that reactive programming can appear suspiciously "magical."  For programmers used to having to trigger behavior explicitly, the fact that it is done automatically in S can be unsettling at first.  Combined with S's automatic registration of dependencies, this can create the fear that an application will become an unintelligible mess of abounding dependencies and callbacks.  This concern is understandable, but is answered by gaining experience in reactive programming.  In the appropriate domains, reactive programs can be more succinct and easier to reason about than their imperative counterparts.  In addition, S has been written with an eye to developer ergonomics: a small but expressive API, meaningful errors, and shallow stack traces.

## For Experienced Reactive Programmers

S implements an *automatic*, *dynamic*, *eager*, *glitch-less*, *differentiated*, *generative*, *generational*, *re-entrant* graph of signals.  That's quite a lot of buzzwords.  Let's break it down:

- *Automatic* - when a computation references a signal, S records a dependency automatically (unless opted out)
- *Dynamic* - only the dependencies from the most recent execution of a computation are active
- *Eager* - changes are propagated immediately when a signal changes
- *Glitch-less* - S updates all of a computation's dependencies before the computation itself, i.e. updates run in topological order
- *Differentiated* - programmers can control when change enters specific sections of the graph, allowing for scheduling or canceling updates
- *Generative* - computations can create new (sub)computations when they run
- *Generational* - subcomputations are considered part of the "result" of their parent, and are disposed when the parent re-runs
- *Re-entrant* - computations may push new values into data signals, so long as those data signals aren't a direct or indirect dependency

Beyond the buzzwords, these features were selected to make S a useful programming tool:

- being automatic enables DRY: we don't need to name signals twice, once to read them and again to wire up dependencies
- being dynamic means we also don't need to worry about removing stale dependencies, S picks only the active set
- being eager means we can use computations as "workers" that produce useful side-effects, like DOM updates
- being glitch-less means we don't need to worry about errors produced by getting different "versions" of two dependencies
- being differentiated allows us to control when expensive tasks occur, like (again) DOM updates
- being generative allows us to break a large computation's behavior into smaller pieces with more targeted dependencies
- being generational means we don't need to worry about computations accumulating ad inifinitum, as only the most recent ones are active
- being re-entrant allows us to write computations that express and enforce relationships between our data

## TodoMVC with S.js and friends, plus ES6

For a longer example, the below code is a minimalist but fully functional version of &ndash; what else &ndash; TodoMVC.  It implements creating, modifying, deleting, filtering and clearing todos.  S.js provides just the core reactive primitives, so to create an entire HTML application, we need help from a few companion libraries.  This example uses the suite Surplus.js, aka "S plus" some friends.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array utility for a data signal carrying an array.  This example also uses ES6's fat-arrow functions to demonstrate how well they works with S.js.

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

Reactive programming allows us to write in a declarative style, which can be very efficient.  Here, the core logic of the application is only ~20 lines of javascript.  Furthermore, reactive programs lend themselves to extension.  For instance, the above code does not save todos to local storage, but we can add this feature with only four lines of code and no modifications to any of the above source:

```javascript
var stored = localStorage.getItem('minimalist-todos');
if (stored) todos(JSON.parse(stored).map(Todo));
S(() => localStorage.setItem('minimalist-todos',
    JSON.stringify(todos())));
```

### Data signals

Data signals are constructed with S.data(&lt;value&gt;), which returns a small "getter-setter" closure.  Call this closure without a parameter to get the current value, call it with a parameter to set the value (and return that same value).

#### S.data<T>(v : T) : () => T | (v : T) => T
```javascript
var d = S.data(1)
d() // returns 1
d(2) // sets d() to 2 and returns 2
```

### Computations

Computations are constructed by calling S(&lt;fn&gt;) directly:

### S()

### Dependencies

By default, **dependencies in S are automatic and dynamic**: we don't need to explicitly subscribe to signals, S watches our function's evaluation and does it for us.  Furthermore, only the dependencies from the most recent evaluation of a computation are active.

```javascript
var a = S.data("a"),
    b = S.data("b"),
    f = S(function () { console.log(a() || b()); });
>>> "a"
a("a2") // f() called a(), so changing a() re-evaluates f()
>>> "a2"
b("b2") // f() didn't call b(), so it doesn't depend on it

a(null) // now force f() to call and log b()
>>> "b2"
b("b3") // now b() is a dependency and updates f()
>>> "b3"

a("a3") // now turn the dependency on b() back off
>>> "a3"
b("b4") // b() no longer triggers f()
```

Automatic dependencies are usually what we want: if our computation references a signal, then we should probably update it when that signal changes.  However, there are cases where we might want explicit control over when a computation updates.  Perhaps it references several signals but should only re-evaluate when a particular one changes.  Or perhaps there is a signal or two for which we only want the current value and don't care if it changes.

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
